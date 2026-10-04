import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileRepository } from '../../src/persistence/profileRepository';
import { ProfileSession } from '../../src/application/profileSession';
import { FolioController } from '../../src/application/folioController';
import { createEmptyProfileData } from '../../src/application/profileData';

const clock = { now: () => '2026-09-26T00:00:00.000Z' };

describe('Application workflow persistence', () => {
  it('persists data through lock/unlock cycle', async () => {
    const repo = new ProfileRepository({ dbName: 'test-folio-app', clock });
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    const data = createEmptyProfileData(clock);
    await repo.createProfile({ label: 'Persist', password: 'secret', data });
    const selectors = await repo.listProfiles();
    const pid = selectors[0].profileId;

    const session1 = new ProfileSession(repo);
    await session1.unlock(pid, 'secret');
    const ctrl1 = new FolioController(session1);
    const acc1 = ctrl1.createAccount({ name: 'Bank', type: 'bank', openingBalance: 100000 });
    const acc2 = ctrl1.createAccount({ name: 'Cash', type: 'cash', openingBalance: 0 });
    const incCat = ctrl1.createCategory({ name: 'Salary', kind: 'income' });
    const expCat = ctrl1.createCategory({ name: 'Food', kind: 'expense' });
    ctrl1.createTransaction({ type: 'income', date: '2026-09-01', amount: 50000, accountId: acc1, categoryId: incCat });
    ctrl1.createTransaction({ type: 'expense', date: '2026-09-02', amount: 20000, accountId: acc1, categoryId: expCat });
    ctrl1.createTransaction({ type: 'transfer', date: '2026-09-03', amount: 10000, accountId: acc1, toAccountId: acc2 });
    ctrl1.createRecurring({
      name: 'Rent',
      kind: 'expense',
      amount: 15000,
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2026-01-01',
    });
    await session1.flush();
    await session1.lock();

    const session2 = new ProfileSession(repo);
    await session2.unlock(pid, 'secret');
    const ctrl2 = new FolioController(session2);
    const balances = ctrl2.getAccountBalances();
    expect(balances.balances.get(acc1)).toBe(120000);
    expect(balances.balances.get(acc2)).toBe(10000);
    const snap = ctrl2.snapshot;
    expect(snap.categories.length).toBe(2);
    expect(snap.txns.length).toBe(3);
    expect(snap.recurring.length).toBe(1);
    const month = ctrl2.getMonthlyCashFlow('2026-09');
    expect(month.actual.income).toBe(50000);
    expect(month.actual.expense).toBe(20000);
    expect(month.committed.expense).toBe(15000);
    await session2.lock();
  });
});
