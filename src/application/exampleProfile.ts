import { ProfileRepository } from '../persistence/profileRepository';
import { createEmptyProfileData } from './profileData';
import { randomBytes, deriveProfileKeys, createPasswordVerifier } from '../security/crypto';
import { bytesToBase64 } from '../security/encoding';
import { encryptVault } from '../persistence/vault';
import { DuplicateProfileError } from '../security/errors';

export const EXAMPLE_DB = 'folio-example';
export const EXAMPLE_ID = 'folio-fictional-meera';
export const EXAMPLE_VERSION = 1;
// Public compatibility credential. Example storage is not private storage.
export const EXAMPLE_PASSWORD = 'Folio public fictional sandbox v1';
export const EXAMPLE_NAME = 'Meera Rao';
export const exampleFigures = { liquidFunds:'48500', monthlyIncome:'52000', monthlyExpenses:'38500', annualIncome:'624000', reserve:'231000', surplus:'13500', upfront:'8000', added:'0' };
export function exampleDeleted(){return localStorage.getItem('folio:example-deleted')==='yes';}
export function createExampleData(anchor = new Date()) {
 const data=createEmptyProfileData();
 const now=anchor.toISOString();
 const month=(offset:number,day:number)=>new Date(anchor.getFullYear(),anchor.getMonth()+offset,day,12).toISOString().slice(0,10);
 data.createdAt=now;data.updatedAt=now;data.onboardingDone=true;
 data.identity={photo:'/example-meera.webp'};
 data.example={datasetVersion:EXAMPLE_VERSION,anchorMonth:month(0,1).slice(0,7)};
 data.accounts=[{id:'daily',name:'Everyday · salary & bills',type:'bank',openingBalance:2400000,archived:false,createdAt:now},{id:'savings',name:'Savings · a little breathing room',type:'bank',openingBalance:1800000,archived:false,createdAt:now},{id:'cash',name:'Cash · everyday errands',type:'cash',openingBalance:200000,archived:false,createdAt:now}];
 const categories=[['salary','Salary','income'],['freelance','Illustration work','income'],['rent','Rent','expense'],['groceries','Groceries','expense'],['utilities','Utilities','expense'],['transport','Transport','expense'],['dining','Dining & coffee','expense'],['personal','Personal','expense'],['subscriptions','Subscriptions','expense'],['debt','Loan payment','expense']] as const;
 data.categories=categories.map(([id,name,kind])=>({id,name,kind}));
 let sequence=0;
 for(let offset=-5;offset<=0;offset++) {
  const add=(day:number,type:'income'|'expense'|'transfer',amount:number,categoryId?:string,note?:string,accountId='daily',toAccountId?:string)=>{
   if(offset===0&&day>anchor.getDate())return;
   data.txns.push({id:'meera-'+sequence++,date:month(offset,day),type,amount:amount*100,accountId,...(categoryId?{categoryId}:{}),...(toAccountId?{toAccountId}:{}),note,createdAt:now});
  };
  add(1,'income',52000,'salary','Design studio salary');add(2,'expense',16000,'rent','Apartment rent');
  add(3,'expense',3300+(offset+5)*180,'groceries','Weekly market & pantry');add(10,'expense',3100,'groceries','Groceries');
  add(4,'expense',2200+(offset%2===0?450:0),'utilities','Electricity, water & mobile');
  add(5,'expense',1800,'transport','Metro pass & auto rides');add(6,'expense',599,'subscriptions','Music & cloud tools');
  add(8,'transfer',7000,undefined,'Monthly savings','daily','savings');add(9,'transfer',2000,undefined,'Cash withdrawal','daily','cash');
  add(12,'expense',4200,'debt','Loan payment · Debt balance updated separately');
  add(14,'expense',1100,'dining','Coffee with friends');add(19,'expense',1900+(offset===-2?2400:0),'dining','Dinner & weekend plans');
  add(21,'expense',950,'personal','Books & everyday essentials','cash');add(23,'expense',2800,'personal','Clothes & gifts');
  if(offset===-3)add(25,'expense',19500,'personal','Unexpected laptop repair & replacement parts');
  if(offset===-1)add(24,'income',8500,'freelance','Illustration commission');
 }
 data.recurring=[{id:'rent-schedule',name:'Apartment rent',kind:'expense',amount:1600000,frequency:'monthly',dayOfMonth:2,startDate:month(-5,1),active:true,accountId:'daily',categoryId:'rent'},{id:'subscription-schedule',name:'Music & creative tools',kind:'expense',amount:59900,frequency:'monthly',dayOfMonth:6,startDate:month(-5,1),active:true,accountId:'daily',categoryId:'subscriptions'},{id:'salary-schedule',name:'Studio salary',kind:'income',amount:5200000,frequency:'monthly',dayOfMonth:1,startDate:month(-5,1),active:true,accountId:'daily',categoryId:'salary'}];
 data.debts=[{id:'meera-loan',name:'Laptop loan · manually maintained',kind:'personal',balance:4800000,annualRatePct:11.5,monthlyPayment:420000,dueDay:12,active:true}];
 data.goals=[{id:'emergency',name:'Emergency breathing room',targetAmount:23100000,method:'fixed',monthlyContribution:700000,linkedAccountId:'savings',active:true,createdAt:now},{id:'console',name:'A handheld console for weekends',targetAmount:800000,method:'fixed',monthlyContribution:50000,manualSaved:200000,active:true,createdAt:now},{id:'trip',name:'A slow trip to the mountains',targetAmount:9000000,method:'target-date',targetDate:month(9,15),monthlyContribution:0,manualSaved:1200000,active:true,createdAt:now}];
 return data;
}
let queued=Promise.resolve();
async function serialized<T>(action:()=>Promise<T>):Promise<T> {
 if(typeof navigator!=='undefined'&&navigator.locks) return navigator.locks.request('folio-example-lifecycle',action);
 const next=queued.then(action,action);queued=next.then(()=>{},()=>{});return next;
}
export class ExampleRepository extends ProfileRepository {
 constructor(dbName=EXAMPLE_DB){super({dbName});}
 async ensure(restore=false){return serialized(async()=>{
  const list=await this.listProfiles();if(list.some(p=>p.profileId===EXAMPLE_ID))return;
  if(exampleDeleted()&&!restore)throw new Error('The Example Profile was deleted. Choose Restore Example Profile to recreate it.');
  try{await this.install(false);}catch(error){if(!(error instanceof DuplicateProfileError))throw error;}
  localStorage.removeItem('folio:example-deleted');
 });}
 async reset(){return serialized(async()=>{await this.install(true);localStorage.removeItem('folio:example-deleted');});}
 async remove(){return serialized(async()=>{await this.deleteProfile(EXAMPLE_ID);localStorage.setItem('folio:example-deleted','yes');});}
 private async install(replace:boolean){
  const salt=randomBytes(16);const {authKey,encryptionKey}=await deriveProfileKeys(EXAMPLE_PASSWORD,salt);const now=new Date().toISOString();
  const index={profileId:EXAMPLE_ID,label:EXAMPLE_NAME,createdAt:now,updatedAt:now,kdf:{algorithm:'PBKDF2' as const,hash:'SHA-256' as const,iterations:310000,saltBase64:bytesToBase64(salt)},authVerifierBase64:bytesToBase64(await createPasswordVerifier(authKey))};
  const vault={profileId:EXAMPLE_ID,...await encryptVault(encryptionKey,EXAMPLE_ID,1,createExampleData())};
  await this.importProfileBackup({profileId:EXAMPLE_ID,index,vault,replace});
 }
}
