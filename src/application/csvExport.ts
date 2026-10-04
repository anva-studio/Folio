import type { ProfileData } from '../domain/types.js';

function formatMinorToDecimal(minor: number, minorDigits: number): string {
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

function toCsvRows(rows: unknown[][]): string {
  return rows.map(row => row.map(cell => escapeCsvCell(cell)).join(',')).join('\r\n');
}

export function exportTransactionsCsv(data: ProfileData): string {
  const accountMap = new Map(data.accounts.map(a => [a.id, a.name]));
  const categoryMap = new Map(data.categories.map(c => [c.id, c.name]));
  const header = ['id','date','type','amount','currency','accountId','accountName','toAccountId','toAccountName','categoryId','categoryName','note','archived'];
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
    ]);
  }
  return toCsvRows(rows);
}

export function exportAccountsCsv(data: ProfileData): string {
  const header = ['id','name','type','openingBalance','currency','archived','createdAt'];
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
    ]);
  }
  return toCsvRows(rows);
}

export function exportRecurringCsv(data: ProfileData): string {
  const accountMap = new Map(data.accounts.map(a => [a.id, a.name]));
  const categoryMap = new Map(data.categories.map(c => [c.id, c.name]));
  const header = ['id','name','kind','amount','currency','frequency','dayOfMonth','dayOfWeek','accountId','accountName','categoryId','categoryName','startDate','endDate','active','note'];
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
    ]);
  }
  return toCsvRows(rows);
}

export function exportDebtsCsv(data: ProfileData): string {
  const header = ['id','name','kind','balance','currency','annualRatePct','monthlyPayment','dueDay','startDate','active','note'];
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
    ]);
  }
  return toCsvRows(rows);
}

export function exportGoalsCsv(data: ProfileData): string {
  const accountMap = new Map(data.accounts.map(a => [a.id, a.name]));
  const header = ['id','name','targetAmount','currency','method','monthlyContribution','targetDate','annualRatePct','linkedAccountId','linkedAccountName','manualSaved','active','createdAt'];
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
    ]);
  }
  return toCsvRows(rows);
}
