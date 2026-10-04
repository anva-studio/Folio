import { describe, it, expect } from 'vitest';
import {
  RecurringError,
  assertValidRecurring,
  occurrencesInMonth,
  recurringAmountInMonth,
  summarizeRecurringMonth,
} from '../../src/domain/recurring';
import type { Recurring, Account, Category } from '../../src/domain/types';

function makeRecurring(over: Partial<Recurring> & { id: string; name: string }): Recurring {
  return {
    id: over.id,
    name: over.name,
    kind: over.kind ?? 'income',
    amount: over.amount ?? 1000,
    frequency: over.frequency ?? 'monthly',
    dayOfMonth: over.dayOfMonth ?? 15,
    dayOfWeek: over.dayOfWeek,
    accountId: over.accountId,
    categoryId: over.categoryId,
    startDate: over.startDate ?? '2026-01-01',
    endDate: over.endDate,
    active: over.active ?? true,
    note: over.note,
  };
}

function ctxOf(accounts: Account[], categories: Category[]) {
  return {
    accountsById: new Map(accounts.map(a => [a.id, a])),
    categoriesById: new Map(categories.map(c => [c.id, c])),
  };
}

const acc = (id: string): Account => ({ id, name: `A ${id}`, type: 'cash', openingBalance: 0, archived: false, createdAt: '2026-01-01T00:00:00Z' });
const cat = (id: string, kind: 'income'|'expense'): Category => ({ id, name: `C ${id}`, kind });

describe('assertValidRecurring validation', () => {
  it('accepts valid income', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r1', name: 'Salary', kind: 'income', amount: 50000, frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-01' }))).not.toThrow();
  });
  it('accepts valid expense', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r2', name: 'Rent', kind: 'expense', amount: 20000, frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' }))).not.toThrow();
  });
  it('rejects empty id', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: '', name: 'x' } as any))).toThrow(RecurringError);
  });
  it('rejects empty name', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: '' }))).toThrow(RecurringError);
  });
  it('rejects invalid kind', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', kind: 'other' as any }))).toThrow(RecurringError);
  });
  it('rejects zero amount', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', amount: 0 }))).toThrow(RecurringError);
  });
  it('rejects negative amount', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', amount: -10 }))).toThrow(RecurringError);
  });
  it('rejects non-integer amount', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', amount: 1.5 as any }))).toThrow(RecurringError);
  });
  it('rejects invalid frequency', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', frequency: 'daily' as any }))).toThrow(RecurringError);
  });
  it('rejects dayOfMonth 0', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', dayOfMonth: 0 }))).toThrow(RecurringError);
  });
  it('rejects dayOfMonth 29', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', dayOfMonth: 29 }))).toThrow(RecurringError);
  });
  it('weekly missing dayOfWeek', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', frequency: 'weekly', dayOfMonth: 15 }))).toThrow(RecurringError);
  });
  it('weekly dayOfWeek below 0', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', frequency: 'weekly', dayOfWeek: -1 }))).toThrow(RecurringError);
  });
  it('weekly dayOfWeek above 6', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', frequency: 'weekly', dayOfWeek: 7 }))).toThrow(RecurringError);
  });
  it('non-weekly carrying dayOfWeek', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', frequency: 'monthly', dayOfWeek: 2 }))).toThrow(RecurringError);
  });
  it('invalid startDate', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', startDate: '2026-13-01' }))).toThrow(RecurringError);
  });
  it('invalid endDate', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', endDate: '2026-02-30' }))).toThrow(RecurringError);
  });
  it('endDate before startDate', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', startDate: '2026-02-01', endDate: '2026-01-01' }))).toThrow(RecurringError);
  });
  it('optional account/category allowed', () => {
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x' }))).not.toThrow();
  });
  it('unknown account when ctx supplied', () => {
    const context = ctxOf([acc('a1')], []);
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', accountId: 'missing' }), context)).toThrow(RecurringError);
  });
  it('unknown category when ctx supplied', () => {
    const context = ctxOf([], [cat('c1','income')]);
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', categoryId: 'missing' }), context)).toThrow(RecurringError);
  });
  it('category kind mismatch', () => {
    const context = ctxOf([], [cat('c1','expense')]);
    expect(() => assertValidRecurring(makeRecurring({ id: 'r', name: 'x', kind: 'income', categoryId: 'c1' }), context)).toThrow(RecurringError);
  });
});

describe('occurrencesInMonth scheduling', () => {
  it('inactive item gives []', () => {
    const r = makeRecurring({ id: 'r', name: 'x', active: false });
    expect(occurrencesInMonth(r, '2026-01')).toEqual([]);
  });
  it('monthly normal occurrence', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-01' });
    expect(occurrencesInMonth(r, '2026-03')).toEqual(['2026-03-15']);
  });
  it('monthly startDate after anchor skips first month', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-20' });
    expect(occurrencesInMonth(r, '2026-01')).toEqual([]);
    expect(occurrencesInMonth(r, '2026-02')).toEqual(['2026-02-15']);
  });
  it('monthly inclusive start date', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'monthly', dayOfMonth: 10, startDate: '2026-01-10' });
    expect(occurrencesInMonth(r, '2026-01')).toEqual(['2026-01-10']);
  });
  it('monthly inclusive end date', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-01', endDate: '2026-03-15' });
    expect(occurrencesInMonth(r, '2026-03')).toEqual(['2026-03-15']);
    expect(occurrencesInMonth(r, '2026-04')).toEqual([]);
  });
  it('monthly after endDate gives []', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-01', endDate: '2026-02-01' });
    expect(occurrencesInMonth(r, '2026-03')).toEqual([]);
  });
  it('quarterly cadence across several months', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'quarterly', dayOfMonth: 10, startDate: '2026-01-01' });
    expect(occurrencesInMonth(r, '2026-01')).toEqual(['2026-01-10']);
    expect(occurrencesInMonth(r, '2026-04')).toEqual(['2026-04-10']);
    expect(occurrencesInMonth(r, '2026-02')).toEqual([]);
    expect(occurrencesInMonth(r, '2026-07')).toEqual(['2026-07-10']);
  });
  it('quarterly start-month candidate before startDate is skipped', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'quarterly', dayOfMonth: 15, startDate: '2026-01-20' });
    expect(occurrencesInMonth(r, '2026-01')).toEqual([]);
    expect(occurrencesInMonth(r, '2026-04')).toEqual(['2026-04-15']);
  });
  it('yearly cadence', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'yearly', dayOfMonth: 5, startDate: '2026-03-01' });
    expect(occurrencesInMonth(r, '2026-03')).toEqual(['2026-03-05']);
    expect(occurrencesInMonth(r, '2027-03')).toEqual(['2027-03-05']);
    expect(occurrencesInMonth(r, '2026-04')).toEqual([]);
  });
  it('weekly occurrences in a calendar month', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '2026-01-01' }); // Monday
    const occ = occurrencesInMonth(r, '2026-09');
    // September 2026 starts on Tuesday, Mondays: 7,14,21,28
    expect(occ).toEqual(['2026-09-07','2026-09-14','2026-09-21','2026-09-28']);
  });
  it('weekly startDate cuts off earlier matching weekdays', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '2026-09-10' });
    const occ = occurrencesInMonth(r, '2026-09');
    expect(occ).toEqual(['2026-09-14','2026-09-21','2026-09-28']);
  });
  it('weekly endDate cuts off later matching weekdays', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '2026-01-01', endDate: '2026-09-20' });
    const occ = occurrencesInMonth(r, '2026-09');
    expect(occ).toEqual(['2026-09-07','2026-09-14']);
  });
  it('invalid monthKey rejected', () => {
    const r = makeRecurring({ id: 'r', name: 'x' });
    expect(() => occurrencesInMonth(r, '2026-13')).toThrow(RecurringError);
    expect(() => occurrencesInMonth(r, 'bad')).toThrow(RecurringError);
  });
  it('dates returned in ascending order', () => {
    const r = makeRecurring({ id: 'r', name: 'x', frequency: 'weekly', dayOfWeek: 0, dayOfMonth: 1, startDate: '2026-01-01' });
    const occ = occurrencesInMonth(r, '2026-01');
    const sorted = [...occ].sort();
    expect(occ).toEqual(sorted);
  });
});

describe('recurringAmountInMonth money', () => {
  it('monthly amount', () => {
    const r = makeRecurring({ id: 'r', name: 'x', amount: 5000, frequency: 'monthly', dayOfMonth: 10, startDate: '2026-01-01' });
    expect(recurringAmountInMonth(r, '2026-05')).toBe(5000);
  });
  it('weekly with multiple occurrences', () => {
    const r = makeRecurring({ id: 'r', name: 'x', amount: 100, frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '2026-01-01' });
    // September 2026 Mondays: 7,14,21,28 => 4 * 100 = 400
    expect(recurringAmountInMonth(r, '2026-09')).toBe(400);
  });
  it('inactive amount = 0', () => {
    const r = makeRecurring({ id: 'r', name: 'x', amount: 1000, active: false });
    expect(recurringAmountInMonth(r, '2026-01')).toBe(0);
  });
  it('amount multiplication overflow throws RangeError', () => {
    const r = makeRecurring({ id: 'r', name: 'x', amount: Number.MAX_SAFE_INTEGER, frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '2026-01-01' });
    // September has 4 Mondays, multiplication will overflow
    expect(() => recurringAmountInMonth(r, '2026-09')).toThrow(RangeError);
  });
  it('malformed inactive recurring throws RecurringError', () => {
    const bad = makeRecurring({ id: 'b', name: 'x', active: false, dayOfMonth: 29 as any });
    expect(() => recurringAmountInMonth(bad, '2026-01')).toThrow(RecurringError);
  });
});

describe('summarizeRecurringMonth', () => {
  it('mixed recurring income + expense', () => {
    const inc = makeRecurring({ id: 'i', name: 'Salary', kind: 'income', amount: 100000, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01' });
    const exp = makeRecurring({ id: 'e', name: 'Rent', kind: 'expense', amount: 30000, frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' });
    const sum = summarizeRecurringMonth([inc, exp], '2026-09');
    expect(sum.income).toBe(100000);
    expect(sum.expense).toBe(30000);
    expect(sum.net).toBe(70000);
    expect(sum.occurrenceCount).toBe(2);
  });
  it('correct net', () => {
    const inc = makeRecurring({ id: 'i', name: 'A', kind: 'income', amount: 5000, frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' });
    const exp = makeRecurring({ id: 'e', name: 'B', kind: 'expense', amount: 2000, frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' });
    const sum = summarizeRecurringMonth([inc, exp], '2026-06');
    expect(sum.net).toBe(3000);
  });
  it('weekly occurrenceCount counts each occurrence', () => {
    const w = makeRecurring({ id: 'w', name: 'Gym', kind: 'expense', amount: 200, frequency: 'weekly', dayOfWeek: 2, dayOfMonth: 1, startDate: '2026-01-01' });
    const sum = summarizeRecurringMonth([w], '2026-09');
    // Sept 2026 Wednesdays: 2,9,16,23,30 => 5
    expect(sum.occurrenceCount).toBe(5);
    expect(sum.expense).toBe(1000);
  });
  it('inactive items excluded', () => {
    const inc = makeRecurring({ id: 'i', name: 'A', kind: 'income', amount: 1000, active: false });
    const sum = summarizeRecurringMonth([inc], '2026-01');
    expect(sum.income).toBe(0);
    expect(sum.occurrenceCount).toBe(0);
  });
  it('out-of-range items excluded', () => {
    const r = makeRecurring({ id: 'r', name: 'x', amount: 1000, frequency: 'monthly', dayOfMonth: 10, startDate: '2027-01-01' });
    const sum = summarizeRecurringMonth([r], '2026-01');
    expect(sum.income).toBe(0);
    expect(sum.occurrenceCount).toBe(0);
  });
  it('safe-integer sum overflow throws RangeError', () => {
    const big = makeRecurring({ id: 'b', name: 'big', kind: 'income', amount: Number.MAX_SAFE_INTEGER, frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' });
    const other = makeRecurring({ id: 'o', name: 'other', kind: 'income', amount: 1, frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' });
    expect(() => summarizeRecurringMonth([big, other], '2026-01')).toThrow(RangeError);
  });

  it('malformed inactive recurring inside summarizeRecurringMonth throws RecurringError', () => {
    const bad = makeRecurring({ id: 'b', name: 'x', active: false, dayOfMonth: 29 as any });
    expect(() => summarizeRecurringMonth([bad], '2026-01')).toThrow(RecurringError);
  });

  it('occurrencesInMonth validates recurring structure - dayOfMonth 29', () => {
    const bad = makeRecurring({ id: 'b', name: 'x', dayOfMonth: 29 as any });
    expect(() => occurrencesInMonth(bad, '2026-02')).toThrow(RecurringError);
  });

  it('occurrencesInMonth validates recurring structure - malformed weekly dayOfWeek', () => {
    const bad = makeRecurring({ id: 'b', name: 'x', frequency: 'weekly', dayOfWeek: 9 as any });
    expect(() => occurrencesInMonth(bad, '2026-01')).toThrow(RecurringError);
  });

  it('occurrencesInMonth returns [] for valid inactive recurring', () => {
    const r = makeRecurring({ id: 'i', name: 'x', active: false });
    expect(occurrencesInMonth(r, '2026-01')).toEqual([]);
  });
});
