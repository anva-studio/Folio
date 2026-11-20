import type {Account,Category,CurrencyConfig,ProfileData,Txn} from '../domain/types';
import {regionalParse} from '../domain/regional';
import {isValidDate} from '../domain/dates';
import {assertValidTxn} from '../domain/ledger';
import {assertRefundLinks} from '../domain/refunds';

export interface CsvTable {headers:string[];rows:string[][]}
/** Strict bounded RFC-style parser; quoted newlines are preserved, never evaluated. */
export function parseCsv(text:string,delimiter= ','):CsvTable {
 if(text.length>20*1024*1024)throw new Error('CSV must be under 20 MB');
 if(![',',';','\t'].includes(delimiter))throw new Error('Choose comma, semicolon or tab');
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 const cell=()=>{row.push(field);if(row.length>256)throw new Error('CSV has too many columns');field='';closed=false;};
 const endRow=()=>{cell();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>50001)throw new Error('CSV supports up to 50,000 data rows');};
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===delimiter){cell();continue;}if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();continue;}
  if(c==='"'){if(field!==''||closed)throw new Error('Unexpected quote in CSV');quoted=true;continue;}
  if(closed)throw new Error('Unexpected text after a quoted CSV cell');field+=c;
 }
 if(quoted)throw new Error('CSV contains an unclosed quoted cell');if(field!==''||row.length||closed)endRow();
 if(!rows.length)throw new Error('CSV is empty');const [headers,...data]=rows;
 if(headers.some(h=>!h.trim()))throw new Error('Every CSV column needs a header');
 if(data.some(r=>r.length!==headers.length))throw new Error('CSV rows have inconsistent column counts');
 return {headers:headers.map(h=>h.trim()),rows:data};
}
export type ImportField='date'|'type'|'amount'|'account'|'toAccount'|'category'|'currency'|'note'|'id'|'refundOf'|'splits'|'archived'|'debtPayment';
export interface ImportMapping {columns:Partial<Record<ImportField,number>>;dateFormat:'iso'|'dmy'|'mdy';amountLocale?:string;signedAmounts:boolean;fixedAccountId?:string;accountMap:Record<string,string>;categoryMap:Record<string,string>;typeMap:Record<string,Txn['type']>;stagedCategories:Category[]}
export interface ImportRow {index:number;sourceId?:string;txn?:Txn;error?:string;duplicate?:string}
export interface ImportPreview {rows:ImportRow[];basis:string;stagedCategories:Category[]}
export function importBasis(data:ProfileData){return JSON.stringify({currency:data.currency,accounts:data.accounts,categories:data.categories,txns:data.txns});}
export function defaultImportMapping(headers:string[]):ImportMapping {
 const names:Record<ImportField,string[]>={date:['date'],type:['type'],amount:['amount'],account:['accountid','account'],toAccount:['toaccountid','toaccount'],category:['categoryid','category'],currency:['currency'],note:['note','description'],id:['id'],refundOf:['refundof'],splits:['splitsjson'],archived:['archived'],debtPayment:['debtpaymentid']};
 const columns:Partial<Record<ImportField,number>>={};for(const [key,options] of Object.entries(names)){const index=headers.findIndex(h=>options.includes(h.toLowerCase()));if(index>=0)columns[key as ImportField]=index;}
 return {columns,dateFormat:'iso',signedAmounts:false,accountMap:{},categoryMap:{},typeMap:{income:'income',expense:'expense',transfer:'transfer',refund:'refund'},stagedCategories:[]};
}
export function csvDate(value:string,format:ImportMapping['dateFormat']){
 let date=value.trim();if(format!=='iso'){const parts=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(date);if(!parts)throw new Error('Date does not match the selected format');const [,first,second,year]=parts;const day=format==='dmy'?first:second,month=format==='dmy'?second:first;date=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;}
 if(!isValidDate(date))throw new Error('Invalid date');return date;
}
export function importFingerprint(t:Txn){return JSON.stringify([t.type,t.date,t.amount,t.accountId,t.toAccountId??'',t.categoryId??'',t.splits??[],t.note??'',!!t.archived]);}
export function previewCsv(table:CsvTable,mapping:ImportMapping,data:ProfileData):ImportPreview {
 const get=(row:string[],key:ImportField)=>mapping.columns[key]===undefined?'':row[mapping.columns[key]!]??'';
 const currencies:CurrencyConfig={...data.currency,...(mapping.amountLocale?{locale:mapping.amountLocale}:{})};
 const accounts=new Map(data.accounts.map(a=>[a.id,a])),categories=new Map([...data.categories,...mapping.stagedCategories].map(c=>[c.id,c]));
 const prefix='csv-staged:'+crypto.randomUUID()+':';
 const existingIds=new Set(data.txns.map(t=>t.id)),existingSourceIds=new Set(data.txns.filter(t=>t.importSourceId).map(t=>t.accountId+':'+t.importSourceId)),existingFingerprints=new Set(data.txns.map(importFingerprint)),sourceIds=new Map<string,string>(),batchFingerprints=new Set<string>();
 table.rows.forEach((row,i)=>{const id=get(row,'id').trim();if(id&&!sourceIds.has(id))sourceIds.set(id,prefix+i);});
 const resolveAccount=(name:string,source=false):Account=>{const id=mapping.accountMap[name]??(accounts.has(name)?name:source&&mapping.columns.account===undefined?mapping.fixedAccountId:undefined),account=id?accounts.get(id):undefined;if(!account||account.archived)throw new Error('Map this row to an active account');return account;};
 const resolveCategory=(name:string,type:'income'|'expense')=>{const id=mapping.categoryMap[type+':'+name]??(categories.has(name)?name:undefined),category=id?categories.get(id):undefined;if(!category||category.kind!==type)throw new Error(`Map the ${type} category ${name||'(unspecified)'}`);return category.id;};
 const seenSourceIds=new Set<string>();
 const rows:ImportRow[]=table.rows.map((row,index)=>{
  const sourceId=get(row,'id').trim()||undefined;try{
   if(sourceId&&sourceId.length>256)throw new Error('Source ID must be at most 256 characters');
   if(get(row,'debtPayment').trim())throw new Error('Grouped debt payment rows need encrypted backup restore; importing isolated components would lose their relationship');
   const currency=get(row,'currency').trim();if(currency&&currency.toUpperCase()!==data.currency.code)throw new Error(`Currency ${currency} differs from profile ${data.currency.code}; no conversion is performed`);
   let amount=regionalParse(get(row,'amount'),currencies),type:Txn['type'];
   if(mapping.signedAmounts){type=amount<0?'expense':'income';amount=Math.abs(amount);}else{type=mapping.typeMap[get(row,'type').trim().toLowerCase()];if(!type)throw new Error('Map the transaction type or explicitly choose signed amounts');}
   if(amount<=0)throw new Error('Use a positive amount; choose signed-amount mode for a signed income/expense export');
   const accountId=resolveAccount(get(row,'account').trim(),true).id;
   const txn:Txn={id:prefix+index,type,date:csvDate(get(row,'date'),mapping.dateFormat),amount,accountId,note:get(row,'note')||undefined,createdAt:'staged',importSourceId:sourceId};
   if(get(row,'archived')){if(!['true','false'].includes(get(row,'archived').toLowerCase()))throw new Error('Excluded state must be true or false');txn.archived=get(row,'archived').toLowerCase()==='true';}
   if(type==='transfer')txn.toAccountId=resolveAccount(get(row,'toAccount').trim()).id;
   else if(type==='expense'&&get(row,'splits').trim()){
    const split=JSON.parse(get(row,'splits'));if(!Array.isArray(split))throw new Error('Split data must be an array');txn.splits=split.map(s=>({categoryId:resolveCategory(String(s.categoryId??''),'expense'),amount:s.amount}));
   }else txn.categoryId=resolveCategory(get(row,'category').trim(),type==='income'?'income':'expense');
   if(type==='refund'){const source=get(row,'refundOf').trim();txn.refundOf=existingIds.has(source)?source:sourceIds.get(source);if(!txn.refundOf)throw new Error('Map refundOf to an existing or imported purchase ID');}
   assertValidTxn(txn,{accountsById:accounts,categoriesById:categories});
   const fingerprint=importFingerprint(txn),duplicate=sourceId&&(existingIds.has(sourceId)||existingSourceIds.has(accountId+':'+sourceId))?'Source ID already exists':sourceId&&seenSourceIds.has(sourceId)?'Repeated source ID in this file':existingFingerprints.has(fingerprint)||batchFingerprints.has(fingerprint)?'Same recorded details already exist':undefined;
   if(sourceId)seenSourceIds.add(sourceId);batchFingerprints.add(fingerprint);return {index,sourceId,txn,duplicate};
  }catch(e){return {index,sourceId,error:e instanceof Error?e.message:'Could not parse this row'};}
 });
 return {rows,basis:importBasis(data),stagedCategories:mapping.stagedCategories};
}
export function selectedImportRows(preview:ImportPreview,selected:Set<number>,data:ProfileData){
 const rows=preview.rows.filter(row=>selected.has(row.index));if(!rows.length)throw new Error('Select at least one valid row');if(rows.some(row=>row.error||!row.txn))throw new Error('Fix or deselect invalid rows before importing');
 const txns=rows.map(row=>row.txn!);const ids=new Set(txns.map(t=>t.id)),staged=new Set(preview.rows.flatMap(row=>row.txn?[row.txn.id]:[]));for(const t of txns)if(t.refundOf&&staged.has(t.refundOf)&&!ids.has(t.refundOf))throw new Error('Include the original purchase or link the refund to an existing record');
 const existingIds=new Set(data.txns.map(t=>t.id));if(ids.size!==txns.length||txns.some(t=>existingIds.has(t.id)))throw new Error('Invalid staged transaction identities');
 assertRefundLinks([...data.txns,...txns]);return txns;
}
export function mappingRequirements(table:CsvTable,mapping:ImportMapping,data:ProfileData){
 const get=(row:string[],key:ImportField)=>mapping.columns[key]===undefined?'':row[mapping.columns[key]!]??'';
 const accounts=new Set<string>(),categories=new Map<string,{key:string;kind:'income'|'expense';source:string}>(),types=new Set<string>();
 for(const row of table.rows){const rawType=get(row,'type').trim().toLowerCase();if(rawType)types.add(rawType);let type=mapping.typeMap[rawType];if(mapping.signedAmounts){try{type=regionalParse(get(row,'amount'),{...data.currency,...(mapping.amountLocale?{locale:mapping.amountLocale}:{})})<0?'expense':'income';}catch{continue;}}
  if(mapping.columns.account!==undefined)accounts.add(get(row,'account').trim());if(type==='transfer'){accounts.add(get(row,'toAccount').trim());continue;}if(!type)continue;
  const kind=type==='income'?'income':'expense';let source=[get(row,'category').trim()];if(type==='expense'&&get(row,'splits').trim()){try{const parts=JSON.parse(get(row,'splits'));if(Array.isArray(parts))source=parts.map(s=>String(s.categoryId??''));}catch{continue;}}
  for(const name of source)categories.set(kind+':'+name,{key:kind+':'+name,kind,source:name});
 }
 return {accounts:[...accounts],categories:[...categories.values()],types:[...types]};
}
