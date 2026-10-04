// Recurring commitments domain engine
import { Recurring, Account, Category } from './types';
import { isValidDate, isValidMonthKey, monthKeyOf, daysInCalendarMonth } from './dates';
import { mulMinor, addMinor, subMinor, assertMinorUnits } from './money';

export class RecurringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurringError';
  }
}

export interface RecurringContext {
  accountsById: ReadonlyMap<string, Account>;
  categoriesById: ReadonlyMap<string, Category>;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function assertValidRecurring(recurring: Recurring, ctx?: RecurringContext): void {
  if (!isNonEmptyString(recurring.id)) {
    throw new RecurringError('recurring: id must be a non-empty string');
  }
  if (!isNonEmptyString(recurring.name)) {
    throw new RecurringError(`recurring "${recurring.id}": name must be non-empty`);
  }
  if (recurring.kind !== 'income' && recurring.kind !== 'expense') {
    throw new RecurringError(`recurring "${recurring.id}": kind must be income or expense`);
  }
  if (typeof recurring.amount !== 'number' || !Number.isSafeInteger(recurring.amount) || recurring.amount <= 0) {
    throw new RecurringError(`recurring "${recurring.id}": amount must be a positive integer in minor units`);
  }
  const validFreqs = new Set(['weekly', 'monthly', 'quarterly', 'yearly']);
  if (!validFreqs.has(recurring.frequency)) {
    throw new RecurringError(`recurring "${recurring.id}": frequency must be weekly|monthly|quarterly|yearly`);
  }
  if (!Number.isSafeInteger(recurring.dayOfMonth) || recurring.dayOfMonth < 1 || recurring.dayOfMonth > 28) {
    throw new RecurringError(`recurring "${recurring.id}": dayOfMonth must be 1..28`);
  }
  if (recurring.frequency === 'weekly') {
    if (typeof recurring.dayOfWeek !== 'number' || !Number.isSafeInteger(recurring.dayOfWeek) || recurring.dayOfWeek < 0 || recurring.dayOfWeek > 6) {
      throw new RecurringError(`recurring "${recurring.id}": weekly requires dayOfWeek 0..6`);
    }
  } else {
    if (recurring.dayOfWeek !== undefined) {
      throw new RecurringError(`recurring "${recurring.id}": dayOfWeek must be absent for ${recurring.frequency}`);
    }
  }
  if (!isValidDate(recurring.startDate)) {
    throw new RecurringError(`recurring "${recurring.id}": startDate must be valid YYYY-MM-DD`);
  }
  if (recurring.endDate !== undefined) {
    if (!isValidDate(recurring.endDate)) {
      throw new RecurringError(`recurring "${recurring.id}": endDate must be valid YYYY-MM-DD`);
    }
    if (recurring.endDate < recurring.startDate) {
      throw new RecurringError(`recurring "${recurring.id}": endDate must be >= startDate`);
    }
  }
  if (typeof recurring.active !== 'boolean') {
    throw new RecurringError(`recurring "${recurring.id}": active must be boolean`);
  }
  if (recurring.accountId !== undefined) {
    if (!isNonEmptyString(recurring.accountId)) {
      throw new RecurringError(`recurring "${recurring.id}": accountId must be non-empty if present`);
    }
    if (ctx && !ctx.accountsById.has(recurring.accountId)) {
      throw new RecurringError(`recurring "${recurring.id}": accountId "${recurring.accountId}" does not exist`);
    }
  }
  if (recurring.categoryId !== undefined) {
    if (!isNonEmptyString(recurring.categoryId)) {
      throw new RecurringError(`recurring "${recurring.id}": categoryId must be non-empty if present`);
    }
    if (ctx) {
      const cat = ctx.categoriesById.get(recurring.categoryId);
      if (!cat) {
        throw new RecurringError(`recurring "${recurring.id}": categoryId "${recurring.categoryId}" does not exist`);
      }
      if (cat.kind !== recurring.kind) {
        throw new RecurringError(`recurring "${recurring.id}": category kind "${cat.kind}" does not match recurring kind "${recurring.kind}"`);
      }
    }
  }
}

function dateInRange(date: string, startDate: string, endDate?: string): boolean {
  if (date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

function buildDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function occurrencesInMonth(recurring: Recurring, monthKey: string): string[] {
  if (!isValidMonthKey(monthKey)) {
    throw new RecurringError('invalid month key');
  }
  assertValidRecurring(recurring);
  if (!recurring.active) return [];
  const [yStr, mStr] = monthKey.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const startMonthKey = monthKeyOf(recurring.startDate);
  // Quick range check: if month is before start month or after end month
  const monthStart = `${monthKey}-01`;
  const monthEnd = buildDateString(year, month, daysInCalendarMonth(year, month));
  if (monthStart < recurring.startDate || (recurring.endDate && monthEnd < recurring.startDate)) {
    // Could still have dates after startDate in month, but if monthEnd < startDate then no
    if (monthEnd < recurring.startDate) return [];
  }
  // Also if month is after end month
  if (recurring.endDate) {
    const endMonthKey = monthKeyOf(recurring.endDate);
    if (monthKey > endMonthKey) return [];
    if (monthKey === endMonthKey) {
      // still possible
    }
  }

  const dates: string[] = [];

  if (recurring.frequency === 'weekly') {
    const dow = recurring.dayOfWeek!;
    const dim = daysInCalendarMonth(year, month);
    for (let d = 1; d <= dim; d++) {
      const dateStr = buildDateString(year, month, d);
      if (!dateInRange(dateStr, recurring.startDate, recurring.endDate)) continue;
      const utc = new Date(Date.UTC(year, month - 1, d));
      if (utc.getUTCDay() === dow) {
        dates.push(dateStr);
      }
    }
    return dates;
  }

  // monthly / quarterly / yearly
  const day = recurring.dayOfMonth;
  const candidate = buildDateString(year, month, day);
  // candidate must be a valid date; day 1..28 guarantees valid
  if (!dateInRange(candidate, recurring.startDate, recurring.endDate)) {
    return [];
  }

  if (recurring.frequency === 'monthly') {
    return [candidate];
  }

  // quarterly / yearly need cadence check
  const monthsBetweenFromStart = (function monthsBetween(a: string, b: string) {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
  })(startMonthKey, monthKey);
  if (monthsBetweenFromStart < 0) return [];

  if (recurring.frequency === 'quarterly') {
    if (monthsBetweenFromStart % 3 !== 0) return [];
    return [candidate];
  }
  if (recurring.frequency === 'yearly') {
    if (monthsBetweenFromStart % 12 !== 0) return [];
    return [candidate];
  }

  return dates;
}

export function recurringAmountInMonth(recurring: Recurring, monthKey: string): number {
  if (!isValidMonthKey(monthKey)) {
    throw new RecurringError('invalid month key');
  }
  assertValidRecurring(recurring);
  if (!recurring.active) return 0;
  const occ = occurrencesInMonth(recurring, monthKey);
  if (occ.length === 0) return 0;
  // assertMinorUnits for safety
  assertMinorUnits(recurring.amount, 'recurring amount');
  return mulMinor(recurring.amount, occ.length);
}

export function summarizeRecurringMonth(recurring: readonly Recurring[], monthKey: string): {
  income: number;
  expense: number;
  net: number;
  occurrenceCount: number;
} {
  if (!isValidMonthKey(monthKey)) {
    throw new RecurringError('invalid month key');
  }
  let income = 0;
  let expense = 0;
  let occurrenceCount = 0;

  for (const r of recurring) {
    assertValidRecurring(r);
    if (!r.active) continue;
    const occ = occurrencesInMonth(r, monthKey);
    const cnt = occ.length;
    if (cnt === 0) continue;
    const total = mulMinor(r.amount, cnt);
    if (r.kind === 'income') {
      income = addMinor(income, total);
    } else {
      expense = addMinor(expense, total);
    }
    occurrenceCount += cnt;
  }

  const net = subMinor(income, expense);
  return { income, expense, net, occurrenceCount };
}
