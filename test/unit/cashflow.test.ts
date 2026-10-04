import { describe, it, expect } from 'vitest';
import {
  CashFlowError,
  summarizeTransactionsMonth,
  summarizeCommitmentsMonth,
  summarizeMonthlyCashFlow,
} from '../../src/domain/cashflow';
import type { Txn, Recurring } from '../../src/domain/types';

function makeTxn(over: Partial<Txn> & { id: string }): Txn {
  const base: Txn = {
    id: over.id,
    type: over.type ?? 'income',
    date: over.date ?? '2026-09-01',
    amount: over.amount ?? 1000,
    accountId: over.accountId ?? 'a1',
    createdAt: '2026-01-01T00:00:00Z',
  };
  return { ...base, ...over } as Txn;
}

function makeRecurring(over: Partial<Recurring> & { id: string; name: string }): Recurring {
  const base: Recurring = {
    id: over.id,
    name: over.name,
    kind: over.kind ?? 'income',
    amount: over.amount ?? 1000,
    frequency: over.frequency ?? 'monthly',
    dayOfMonth: over.dayOfMonth ?? 15,
    startDate: over.startDate ?? '2026-01-01',
    active: over.active ?? true,
  };
  return { ...base, ...over } as Recurring;
}

describe('summarizeTransactionsMonth month validation', () => {
  it('accepts valid month key', () => {
    const sum = summarizeTransactionsMonth([], '2026-09');
    expect(sum.income).toBe(0);
  });
  it('rejects invalid month key', () => {
    expect(() => summarizeTransactionsMonth([], '2026-13')).toThrow(CashFlowError);
    expect(() => summarizeTransactionsMonth([], 'bad')).toThrow(CashFlowError);
  });
});

describe('summarizeTransactionsMonth actual transactions', () => {
  it('single income', () => {
    const txns = [makeTxn({ id: 't1', type: 'income', date: '2026-09-10', amount: 5000 })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.income).toBe(5000);
    expect(s.expense).toBe(0);
    expect(s.net).toBe(5000);
    expect(s.transactionCount).toBe(1);
  });
  it('single expense', () => {
    const txns = [makeTxn({ id: 't1', type: 'expense', date: '2026-09-10', amount: 2000 })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.expense).toBe(2000);
    expect(s.net).toBe(-2000);
    expect(s.transactionCount).toBe(1);
  });
  it('mixed income + expense', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 10000 }),
      makeTxn({ id: 't2', type: 'expense', date: '2026-09-15', amount: 3000 }),
    ];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.income).toBe(10000);
    expect(s.expense).toBe(3000);
    expect(s.net).toBe(7000);
    expect(s.transactionCount).toBe(2);
  });
  it('multiple transactions summed', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 1000 }),
      makeTxn({ id: 't2', type: 'income', date: '2026-09-02', amount: 2000 }),
      makeTxn({ id: 't3', type: 'expense', date: '2026-09-03', amount: 500 }),
    ];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.income).toBe(3000);
    expect(s.expense).toBe(500);
    expect(s.transactionCount).toBe(3);
  });
  it('prior month excluded', () => {
    const txns = [makeTxn({ id: 't1', type: 'income', date: '2026-08-31', amount: 5000 })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.income).toBe(0);
    expect(s.transactionCount).toBe(0);
  });
  it('later month excluded', () => {
    const txns = [makeTxn({ id: 't1', type: 'expense', date: '2026-10-01', amount: 5000 })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.expense).toBe(0);
  });
  it('archived income excluded', () => {
    const txns = [makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 5000, archived: true })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.income).toBe(0);
    expect(s.transactionCount).toBe(0);
  });
  it('archived expense excluded', () => {
    const txns = [makeTxn({ id: 't1', type: 'expense', date: '2026-09-01', amount: 5000, archived: true })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.expense).toBe(0);
  });
  it('transfer excluded from income', () => {
    const txns = [makeTxn({ id: 't1', type: 'transfer', date: '2026-09-01', amount: 10000, toAccountId: 'a2' })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0);
    expect(s.transactionCount).toBe(0);
  });
  it('transfer excluded from expense', () => {
    const txns = [makeTxn({ id: 't1', type: 'transfer', date: '2026-09-01', amount: 10000, toAccountId: 'a2' })];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.expense).toBe(0);
  });
  it('transfer excluded from transactionCount', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 1000 }),
      makeTxn({ id: 't2', type: 'transfer', date: '2026-09-01', amount: 5000, toAccountId: 'a2' }),
    ];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.transactionCount).toBe(1);
  });
  it('transactionCount counts actual income/expense only', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 100 }),
      makeTxn({ id: 't2', type: 'expense', date: '2026-09-01', amount: 50 }),
      makeTxn({ id: 't3', type: 'transfer', date: '2026-09-01', amount: 1000, toAccountId: 'a2' }),
    ];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.transactionCount).toBe(2);
  });
  it('calendar boundary behavior', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-01-31', amount: 1000 }),
      makeTxn({ id: 't2', type: 'income', date: '2026-02-01', amount: 2000 }),
    ];
    const jan = summarizeTransactionsMonth(txns, '2026-01');
    const feb = summarizeTransactionsMonth(txns, '2026-02');
    expect(jan.income).toBe(1000);
    expect(feb.income).toBe(2000);
  });
});

describe('summarizeTransactionsMonth structural safety', () => {
  it('invalid date rejected', () => {
    const txns = [makeTxn({ id: 't1', date: '2026-13-01', amount: 100 })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('zero amount rejected', () => {
    const txns = [makeTxn({ id: 't1', amount: 0 })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('negative amount rejected', () => {
    const txns = [makeTxn({ id: 't1', amount: -100 })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('non-integer amount rejected', () => {
    const txns = [makeTxn({ id: 't1', amount: 1.5 as any })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('invalid transaction type rejected', () => {
    const txns = [makeTxn({ id: 't1', type: 'loan' as any })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('malformed transfer rejected - missing toAccountId', () => {
    const txns = [makeTxn({ id: 't1', type: 'transfer', date: '2026-09-01', amount: 1000 })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('malformed transfer rejected - same source/destination', () => {
    const txns = [makeTxn({ id: 't1', type: 'transfer', date: '2026-09-01', amount: 1000, toAccountId: 'a1' })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('transfer carrying categoryId rejected', () => {
    const txns = [makeTxn({ id: 't1', type: 'transfer', date: '2026-09-01', amount: 1000, toAccountId: 'a2', categoryId: 'c1' })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('transfer with empty categoryId rejected', () => {
    const txns = [makeTxn({ id: 't1', type: 'transfer', date: '2026-09-01', amount: 1000, toAccountId: 'a2', categoryId: '' })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
  it('transfer with null categoryId rejected via unsafe cast', () => {
    const txns = [makeTxn({ id: 't1', type: 'transfer', date: '2026-09-01', amount: 1000, toAccountId: 'a2', categoryId: null as any })];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(CashFlowError);
  });
});

describe('summarizeTransactionsMonth money safety', () => {
  it('income aggregation overflow throws', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: Number.MAX_SAFE_INTEGER }),
      makeTxn({ id: 't2', type: 'income', date: '2026-09-02', amount: 1 }),
    ];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(RangeError);
  });
  it('expense aggregation overflow throws', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'expense', date: '2026-09-01', amount: Number.MAX_SAFE_INTEGER }),
      makeTxn({ id: 't2', type: 'expense', date: '2026-09-02', amount: 1 }),
    ];
    expect(() => summarizeTransactionsMonth(txns, '2026-09')).toThrow(RangeError);
  });
  it('net safe arithmetic behaves correctly', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 5000 }),
      makeTxn({ id: 't2', type: 'expense', date: '2026-09-01', amount: 3000 }),
    ];
    const s = summarizeTransactionsMonth(txns, '2026-09');
    expect(s.net).toBe(2000);
  });
});

describe('summarizeCommitmentsMonth', () => {
  it('delegates recurring monthly income correctly', () => {
    const rec = [makeRecurring({ id: 'r1', name: 'Salary', kind: 'income', amount: 100000, frequency: 'monthly', dayOfMonth: 5 })];
    const s = summarizeCommitmentsMonth(rec, '2026-09');
    expect(s.income).toBe(100000);
    expect(s.occurrenceCount).toBe(1);
  });
  it('delegates recurring monthly expense correctly', () => {
    const rec = [makeRecurring({ id: 'r1', name: 'Rent', kind: 'expense', amount: 20000, frequency: 'monthly', dayOfMonth: 1 })];
    const s = summarizeCommitmentsMonth(rec, '2026-09');
    expect(s.expense).toBe(20000);
  });
  it('weekly multiple occurrences reflected in occurrenceCount', () => {
    const rec = [makeRecurring({ id: 'r1', name: 'Gym', kind: 'expense', amount: 200, frequency: 'weekly', dayOfWeek: 2, dayOfMonth: 1 })];
    const s = summarizeCommitmentsMonth(rec, '2026-09');
    expect(s.occurrenceCount).toBe(5);
    expect(s.expense).toBe(1000);
  });
  it('inactive recurring excluded', () => {
    const rec = [makeRecurring({ id: 'r1', name: 'X', kind: 'income', amount: 1000, active: false })];
    const s = summarizeCommitmentsMonth(rec, '2026-09');
    expect(s.income).toBe(0);
    expect(s.occurrenceCount).toBe(0);
  });
  it('recurring range boundaries preserved', () => {
    const rec = [makeRecurring({ id: 'r1', name: 'X', kind: 'income', amount: 1000, frequency: 'monthly', dayOfMonth: 10, startDate: '2026-06-01', endDate: '2026-08-01' })];
    const s = summarizeCommitmentsMonth(rec, '2026-09');
    expect(s.income).toBe(0);
  });
  it('malformed recurring record propagates validation failure', () => {
    const rec = [makeRecurring({ id: 'r1', name: 'X', dayOfMonth: 29 as any })];
    expect(() => summarizeCommitmentsMonth(rec, '2026-02')).toThrow();
  });
});

describe('summarizeMonthlyCashFlow combined view', () => {
  it('returns actual and committed sections separately', () => {
    const txns = [makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 5000 })];
    const rec = [makeRecurring({ id: 'r1', name: 'Salary', kind: 'income', amount: 10000, frequency: 'monthly', dayOfMonth: 5 })];
    const s = summarizeMonthlyCashFlow(txns, rec, '2026-09');
    expect(s.monthKey).toBe('2026-09');
    expect(s.actual.income).toBe(5000);
    expect(s.committed.income).toBe(10000);
  });
  it('actual net correct', () => {
    const txns = [
      makeTxn({ id: 't1', type: 'income', date: '2026-09-01', amount: 8000 }),
      makeTxn({ id: 't2', type: 'expense', date: '2026-09-01', amount: 3000 }),
    ];
    const s = summarizeMonthlyCashFlow(txns, [], '2026-09');
    expect(s.actual.net).toBe(5000);
  });
  it('committed net correct', () => {
    const rec = [
      makeRecurring({ id: 'r1', name: 'Salary', kind: 'income', amount: 8000, frequency: 'monthly', dayOfMonth: 1 }),
      makeRecurring({ id: 'r2', name: 'Rent', kind: 'expense', amount: 3000, frequency: 'monthly', dayOfMonth: 1 }),
    ];
    const s = summarizeMonthlyCashFlow([], rec, '2026-09');
    expect(s.committed.net).toBe(5000);
  });
  it('does NOT combine/double-count them', () => {
    const txns = [makeTxn({ id: 't1', type: 'expense', date: '2026-09-01', amount: 20000 })];
    const rec = [makeRecurring({ id: 'r1', name: 'Rent', kind: 'expense', amount: 20000, frequency: 'monthly', dayOfMonth: 1 })];
    const s = summarizeMonthlyCashFlow(txns, rec, '2026-09');
    expect(s.actual.expense).toBe(20000);
    expect(s.committed.expense).toBe(20000);
    // No combined field should exist
    expect('combined' in s).toBe(false);
  });
  it('monthKey echoed correctly', () => {
    const s = summarizeMonthlyCashFlow([], [], '2027-03');
    expect(s.monthKey).toBe('2027-03');
  });
});
