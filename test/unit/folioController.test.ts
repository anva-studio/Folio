import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileSession } from '../../src/application/profileSession';
import { FolioController } from '../../src/application/folioController';
import { ProfileRepository } from '../../src/persistence/profileRepository';
import { createEmptyProfileData } from '../../src/application/profileData';

const clock = { now: () => '2026-09-26T00:00:00.000Z' };

async function makeController() {
  const dbName = `test-folio-${Math.random().toString(36).slice(2)}`;
  const repo = new ProfileRepository({ dbName, clock });
  await repo.open();
  const data = createEmptyProfileData(clock);
  await repo.createProfile({ label: 'Test', password: 'pass', data });
  const selectors = await repo.listProfiles();
  const session = new ProfileSession(repo, { autosaveDelayMs: 10 });
  await session.unlock(selectors[0].profileId, 'pass');
  return { repo, session, controller: new FolioController(session), sessionId: selectors[0].profileId };
}

describe('FolioController', () => {
  it('creates account and computes balance', async () => {
    const { controller } = await makeController();
    const id = controller.createAccount({ name: 'Bank', type: 'bank', openingBalance: 100000 });
    expect(id).toBeTypeOf('string');
    const balances = controller.getAccountBalances();
    expect(balances.balances.get(id)).toBe(100000);
  });

  it('creates category and transaction', async () => {
    const { controller } = await makeController();
    const acc = controller.createAccount({ name: 'Cash', type: 'cash', openingBalance: 0 });
    const cat = controller.createCategory({ name: 'Salary', kind: 'income' });
    controller.createTransaction({ type: 'income', date: '2026-09-01', amount: 50000, accountId: acc, categoryId: cat });
    const balances = controller.getAccountBalances();
    expect(balances.balances.get(acc)).toBe(50000);
  });

  it('transfer moves money', async () => {
    const { controller } = await makeController();
    const a1 = controller.createAccount({ name: 'A', type: 'bank', openingBalance: 100000 });
    const a2 = controller.createAccount({ name: 'B', type: 'bank', openingBalance: 0 });
    controller.createTransaction({ type: 'transfer', date: '2026-09-01', amount: 30000, accountId: a1, toAccountId: a2 });
    const bal = controller.getAccountBalances();
    expect(bal.balances.get(a1)).toBe(70000);
    expect(bal.balances.get(a2)).toBe(30000);
  });

  it('archived account cannot be used for new txn', async () => {
    const { controller } = await makeController();
    const acc = controller.createAccount({ name: 'A', type: 'bank', openingBalance: 0 });
    controller.setAccountArchived(acc, true);
    const cat = controller.createCategory({ name: 'Food', kind: 'expense' });
    expect(() => controller.createTransaction({ type: 'expense', date: '2026-09-01', amount: 1000, accountId: acc, categoryId: cat })).toThrow();
  });

  it('cannot delete referenced category', async () => {
    const { controller } = await makeController();
    const acc = controller.createAccount({ name: 'A', type: 'bank', openingBalance: 0 });
    const cat = controller.createCategory({ name: 'Food', kind: 'expense' });
    controller.createTransaction({ type: 'expense', date: '2026-09-01', amount: 1000, accountId: acc, categoryId: cat });
    expect(() => controller.deleteCategory(cat)).toThrow();
  });
});
