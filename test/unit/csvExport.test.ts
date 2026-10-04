import { describe, it, expect } from 'vitest';
import { exportTransactionsCsv, exportAccountsCsv, exportRecurringCsv, exportGoalsCsv } from '../../src/application/csvExport.js';
import { createEmptyProfileData } from '../../src/application/profileData.js';

describe('csvExport', () => {
  it('exports major-unit decimal values', () => {
    const d = createEmptyProfileData();
    d.accounts.push({ id: 'a1', name: 'Cash', type: 'cash', openingBalance: 0, archived: false, createdAt: new Date().toISOString() });
    d.txns.push({
      id: 't1',
      date: '2025-01-01',
      type: 'expense',
      amount: 123456,
      accountId: 'a1',
      archived: false,
      createdAt: new Date().toISOString(),
    });
    const csv = exportTransactionsCsv(d);
    expect(csv).toContain('amount,currency');
    expect(csv).toContain('1234.56');
  });

  it('includes account and category names in transactions', () => {
    const d = createEmptyProfileData();
    d.accounts.push({ id: 'a1', name: 'Cash', type: 'cash', openingBalance: 12345, archived: false, createdAt: new Date().toISOString() });
    d.categories.push({ id: 'c1', name: 'Food', kind: 'expense' });
    d.txns.push({
      id: 't1',
      date: '2025-01-01',
      type: 'expense',
      amount: 12345,
      accountId: 'a1',
      categoryId: 'c1',
      note: 'lunch',
      archived: false,
      createdAt: new Date().toISOString(),
    });
    const csv = exportTransactionsCsv(d);
    expect(csv).toContain('accountName');
    expect(csv).toContain('categoryName');
    expect(csv).toContain('Cash');
    expect(csv).toContain('Food');
  });

  it('recurring includes account and category names', () => {
    const d = createEmptyProfileData();
    d.accounts.push({ id: 'a1', name: 'Cash', type: 'cash', openingBalance: 0, archived: false, createdAt: new Date().toISOString() });
    d.categories.push({ id: 'c1', name: 'Rent', kind: 'expense' });
    d.recurring.push({
      id: 'r1',
      name: 'Monthly rent',
      kind: 'expense',
      amount: 100000,
      frequency: 'monthly',
      dayOfMonth: 1,
      accountId: 'a1',
      categoryId: 'c1',
      startDate: '2025-01-01',
      active: true,
    });
    const csv = exportRecurringCsv(d);
    expect(csv).toContain('accountName');
    expect(csv).toContain('categoryName');
    expect(csv).toContain('Cash');
    expect(csv).toContain('Rent');
  });

  it('goals includes linkedAccountName', () => {
    const d = createEmptyProfileData();
    d.accounts.push({ id: 'a1', name: 'Savings', type: 'cash', openingBalance: 0, archived: false, createdAt: new Date().toISOString() });
    d.goals.push({
      id: 'g1',
      name: 'Trip',
      targetAmount: 500000,
      method: 'manual' as any,
      monthlyContribution: 0,
      createdAt: new Date().toISOString(),
      linkedAccountId: 'a1',
      active: true,
    });
    const csv = exportGoalsCsv(d);
    expect(csv).toContain('linkedAccountName');
    expect(csv).toContain('Savings');
  });

  it('formula injection protection', () => {
    const d = createEmptyProfileData();
    d.accounts.push({ id: 'a1', name: 'Cash', type: 'cash', openingBalance: 0, archived: false, createdAt: new Date().toISOString() });
    d.txns.push({
      id: 't1',
      date: '2025-01-01',
      type: 'expense',
      amount: 100,
      accountId: 'a1',
      note: '=cmd',
      archived: false,
      createdAt: new Date().toISOString(),
    });
    const csv = exportTransactionsCsv(d);
    expect(csv).toContain("'=cmd");
  });

  it.each(['\t=SUM(1+1)', '  +cmd', '\r@cmd', '\n-cmd', '\uFEFF=cmd', '＝cmd', '＋cmd', '－cmd', '＠cmd'])('neutralizes hidden formula prefixes: %j', name => {
    const data = createEmptyProfileData();
    data.accounts.push({ id: 'a1', name, type: 'cash', openingBalance: -12345, archived: false, createdAt: '' });
    const csv = exportAccountsCsv(data);
    expect(csv).toContain("'" + name);
    expect(csv).toContain(',-123.45,');
  });
  it('comma and quote escaping', () => {
    const d = createEmptyProfileData();
    d.accounts.push({ id: 'a1', name: 'A,B "C"', type: 'cash', openingBalance: 0, archived: false, createdAt: new Date().toISOString() });
    const csv = exportAccountsCsv(d);
    expect(csv).toContain('"A,B ""C"""');
  });

  it('exports absent recurring schedule fields as blank cells', () => {
    const data = createEmptyProfileData();
    data.recurring.push({ id: 'weekly', name: 'Weekly', kind: 'expense', amount: 100, frequency: 'weekly', dayOfMonth: 1, dayOfWeek: 1, startDate: '2026-10-01', active: true });
    const csv = exportRecurringCsv(data);
    expect(csv).not.toContain('undefined');
    expect(csv).toContain('weekly,1,1,');
  });
  it('does not mutate input data', () => {
    const d = createEmptyProfileData();
    const clone = JSON.parse(JSON.stringify(d));
    exportTransactionsCsv(d);
    expect(JSON.stringify(d)).toBe(JSON.stringify(clone));
  });
});


