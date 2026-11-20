import {adjustedBalances,goalAllocationBalances} from '../domain/financialRecords';
import {goalSavedSoFar} from '../domain/goal';
import type { ProfileData } from '../domain/types.js';

export function formatMinorToDecimal(minor: number, minorDigits: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  if (minorDigits === 0) {
    const major = Math.trunc(abs);
    return sign + String(major);
  }
  const base = Math.pow(10, minorDigits);
  const major = Math.trunc(abs / base);
  const frac = abs % base;
  const fracPad = String(frac).padStart(minorDigits, '0');
  return sign + String(major) + '.' + fracPad;
}

function escapeCsvCell(value: unknown, isText?: boolean): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  const isNumericString = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(str);
  const treatAsText = isText ?? (typeof value === 'string' && !isNumericString);
  let out = str;
  if (treatAsText && !isNumericString) {
    if (/^[\s\uFEFF]*[=+\-@＝＋－＠]/.test(out) || /^[\t\r\n]/.test(out)) {
      out = "'" + out;
    }
  }
  if (/[",\r\n]/.test(out)) {
    out = '"' + out.replace(/"/g, '""') + '"';
  }
  return out;
}

export function toCsvRows(rows: unknown[][]): string {
  return rows.map(row => row.map(cell => escapeCsvCell(cell)).join(',')).join('\r\n');
}

export function exportTransactionsCsv(data: ProfileData): string {
  const accountMap = new Map(data.accounts.map(a => [a.id, a.name]));
  const categoryMap = new Map(data.categories.map(c => [c.id, c.name]));
  const header = ['id','date','type','amount','currency','accountId','accountName','toAccountId','toAccountName','categoryId','categoryName','note','archived'];
  if(data.version===2)header.push('splitsJson','refundOf','debtPaymentId','importSourceId');
  const rows: unknown[][] = [header];
  for (const t of data.txns) {
    const amountStr = formatMinorToDecimal(t.amount, data.currency.minorDigits);
    const accountName = accountMap.get(t.accountId) ?? '';
    const toAccountName = t.toAccountId ? (accountMap.get(t.toAccountId) ?? '') : '';
    const categoryName = t.categoryId ? (categoryMap.get(t.categoryId) ?? '') : '';
    rows.push([
      t.id,
      t.date,
      t.type,
      amountStr,
      data.currency.code,
      t.accountId,
      accountName,
      t.toAccountId ?? '',
      toAccountName,
      t.categoryId ?? '',
      categoryName,
      t.note ?? '',
      t.archived ? 'true' : 'false',
      ...(data.version===2?[t.splits?JSON.stringify(t.splits):'',t.refundOf??'',t.debtPaymentId??'',t.importSourceId??'']:[]),
    ]);
  }
  return toCsvRows(rows);
}

export function exportAccountsCsv(data: ProfileData): string {
  const header = ['id','name','type','openingBalance','currency','archived','createdAt'];
  const balances=data.version===2?adjustedBalances(data):undefined;
  if(data.version===2)header.push('recordedBalance');
  const rows: unknown[][] = [header];
  for (const a of data.accounts) {
    rows.push([
      a.id,
      a.name,
      a.type,
      formatMinorToDecimal(a.openingBalance, data.currency.minorDigits),
      data.currency.code,
      a.archived ? 'true' : 'false',
      a.createdAt,
      ...(balances?[formatMinorToDecimal(balances.get(a.id)??0,data.currency.minorDigits)]:[]),
    ]);
  }
  return toCsvRows(rows);
}

export function exportRecurringCsv(data: ProfileData): string {
  const accountMap = new Map(data.accounts.map(a => [a.id, a.name]));
  const categoryMap = new Map(data.categories.map(c => [c.id, c.name]));
  const header = ['id','name','kind','amount','currency','frequency','dayOfMonth','dayOfWeek','accountId','accountName','categoryId','categoryName','startDate','endDate','active','note'];
  if(data.version===2)header.push('lastDayOfMonth');
  const rows: unknown[][] = [header];
  for (const r of data.recurring) {
    const accountName = r.accountId ? (accountMap.get(r.accountId) ?? '') : '';
    const categoryName = r.categoryId ? (categoryMap.get(r.categoryId) ?? '') : '';
    rows.push([
      r.id,
      r.name,
      r.kind,
      formatMinorToDecimal(r.amount, data.currency.minorDigits),
      data.currency.code,
      r.frequency,
      r.dayOfMonth !== undefined ? String(r.dayOfMonth) : '',
      r.dayOfWeek !== undefined ? String(r.dayOfWeek) : '',
      r.accountId ?? '',
      accountName,
      r.categoryId ?? '',
      categoryName,
      r.startDate,
      r.endDate ?? '',
      r.active ? 'true' : 'false',
      r.note ?? '',
      ...(data.version===2?[r.lastDayOfMonth?'true':'false']:[]),
    ]);
  }
  return toCsvRows(rows);
}

export function exportDebtsCsv(data: ProfileData): string {
  const header = ['id','name','kind',data.version===2?'enteredBalance':'balance','currency','annualRatePct','monthlyPayment','dueDay','startDate','active','note'];
  const balances=data.version===2?adjustedBalances(data):undefined;
  if(data.version===2)header.push('balanceSource','linkedLiabilityAccountId','recordedBalance');
  const rows: unknown[][] = [header];
  for (const d of data.debts) {
    rows.push([
      d.id,
      d.name,
      d.kind,
      formatMinorToDecimal(d.balance, data.currency.minorDigits),
      data.currency.code,
      d.annualRatePct,
      formatMinorToDecimal(d.monthlyPayment, data.currency.minorDigits),
      d.dueDay !== undefined ? String(d.dueDay) : '',
      d.startDate ?? '',
      d.active ? 'true' : 'false',
      d.note ?? '',
      ...(balances?[d.linkedLiabilityAccountId?'linked-liability':'manual',d.linkedLiabilityAccountId??'',formatMinorToDecimal(d.linkedLiabilityAccountId?Math.max(0,-(balances.get(d.linkedLiabilityAccountId)??0)):d.balance,data.currency.minorDigits)]:[]),
    ]);
  }
  return toCsvRows(rows);
}

export function exportGoalsCsv(data: ProfileData): string {
  const accountMap = new Map(data.accounts.map(a => [a.id, a.name]));
  const header = ['id','name','targetAmount','currency','method','monthlyContribution','targetDate','annualRatePct','linkedAccountId','linkedAccountName','manualSaved','active','createdAt'];
  const context=data.version===2?{accountBalances:adjustedBalances(data),goalAllocations:goalAllocationBalances(data)}:undefined;
  if(data.version===2)header.push('fundingSource','savedUnderFundingSource');
  const rows: unknown[][] = [header];
  for (const g of data.goals) {
    const linkedAccountName = g.linkedAccountId ? (accountMap.get(g.linkedAccountId) ?? '') : '';
    rows.push([
      g.id,
      g.name,
      formatMinorToDecimal(g.targetAmount, data.currency.minorDigits),
      data.currency.code,
      g.method,
      formatMinorToDecimal(g.monthlyContribution, data.currency.minorDigits),
      g.targetDate ?? '',
      g.annualRatePct !== undefined ? String(g.annualRatePct) : '',
      g.linkedAccountId ?? '',
      linkedAccountName,
      g.manualSaved !== undefined ? formatMinorToDecimal(g.manualSaved, data.currency.minorDigits) : '',
      g.active ? 'true' : 'false',
      g.createdAt,
      ...(context?[g.funding==='allocations'?'allocations':g.linkedAccountId?'whole-linked-account':'manual',formatMinorToDecimal(goalSavedSoFar(g,context),data.currency.minorDigits)]:[]),
    ]);
  }
  return toCsvRows(rows);
}

export function exportCategoriesCsv(data:ProfileData):string {
  return toCsvRows([['id','name','kind','color'],...data.categories.map(c=>[c.id,c.name,c.kind,c.color??''])]);
}

/** Readable stored records, not a substitute for encrypted profile restore. */
export function exportPlanningRecordsCsv(data:ProfileData):string {
  const rows:unknown[][]=[['recordType','recordId','currency','minorDigits','recordJson']];
  rows.push(['healthTargets','health',data.currency.code,data.currency.minorDigits,JSON.stringify(data.health)]);
  for(const [kind,records] of Object.entries(data.financial??{})){
    if(!Array.isArray(records))continue;
    for(const [index,record] of records.entries()){
      const row=record as Record<string,unknown>;
      const id=row.id??row.month??row.key??(typeof row.scheduleId==='string'?row.scheduleId+':'+row.date:String(index));
      rows.push([kind,id,data.currency.code,data.currency.minorDigits,JSON.stringify(record)]);
    }
  }
  return toCsvRows(rows);
}
