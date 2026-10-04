import { describe, expect, it } from 'vitest';
import {
  LedgerError,
  accountBalance,
  assertValidAccount,
  assertValidCategory,
  assertValidTxn,
  computeAccountBalances,
  consolidatedBalance,
  editAccount,
  editTxn,
  setAccountArchived,
  setTxnArchived,
  txnEffectOn,
  validateLedger,
} from '../../src/domain/ledger';
import type { Account, Category, Txn } from '../../src/domain/types';

const NOW = '2026-09-26T12:00:00.000Z';

// --- fixture helpers ------------------------------------------------------

function acc(id: string, over: Partial<Account> = {}): Account {
  return {
    id,
    name: `Account ${id}`,
    type: 'cash',
    openingBalance: 0,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function cat(
  id: string,
  kind: 'income' | 'expense' = 'income',
  over: Partial<Category> = {},
): Category {
  return {
    id,
    name: `Category ${id}`,
    kind,
    ...over,
  };
}

function txn(over: Partial<Txn> & { id: string }): Txn {
  return {
    type: 'income',
    date: '2026-09-01',
    amount: 100,
    accountId: 'a1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function ctxOf(accounts: Account[], categories: Category[]) {
  return {
    accountsById: new Map(accounts.map((a) => [a.id, a])),
    categoriesById: new Map(categories.map((c) => [c.id, c])),
  };
}

const A1 = acc('a1');
const A2 = acc('a2');
const CAT_I = cat('ci', 'income');
const CAT_E = cat('ce', 'expense');

// --- assertValidAccount ---------------------------------------------------

describe('assertValidAccount', () => {
  it('accepts a valid account of every type', () => {
    for (const type of ['cash', 'bank', 'investment', 'credit', 'other'] as const) {
      expect(() => assertValidAccount(acc('a1', { type }))).not.toThrow();
    }
  });

  it('accepts negative opening balance for liabilities', () => {
    expect(() => assertValidAccount(acc('a1', { type: 'credit', openingBalance: -500000 }))).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() => assertValidAccount(acc(''))).toThrow(LedgerError);
  });

  it('rejects non-string id', () => {
    expect(() => assertValidAccount({ ...acc('a1'), id: 7 as unknown as string })).toThrow(LedgerError);
  });

  it('rejects empty name', () => {
    expect(() => assertValidAccount(acc('a1', { name: '' }))).toThrow('account "a1": name must be non-empty');
  });

  it('rejects whitespace-only name', () => {
    expect(() => assertValidAccount(acc('a1', { name: '   ' }))).toThrow('account "a1": name must be non-empty');
  });

  it('rejects invalid type', () => {
    expect(() => assertValidAccount(acc('a1', { type: 'savings' as unknown as Account['type'] }))).toThrow(
      'account "a1": type must be one of cash | bank | investment | credit | other, got savings',
    );
  });

  it('rejects non-integer openingBalance', () => {
    expect(() => assertValidAccount(acc('a1', { openingBalance: 12.5 }))).toThrow(
      'account "a1": openingBalance must be a signed integer in minor units (liabilities start negative)',
    );
  });

  it('rejects NaN openingBalance', () => {
    expect(() => assertValidAccount(acc('a1', { openingBalance: NaN }))).toThrow(LedgerError);
  });

  it('rejects Infinity openingBalance', () => {
    expect(() => assertValidAccount(acc('a1', { openingBalance: Infinity }))).toThrow(LedgerError);
  });
});

// --- assertValidCategory --------------------------------------------------

describe('assertValidCategory', () => {
  it('accepts income and expense categories', () => {
    expect(() => assertValidCategory(cat('c1', 'income'))).not.toThrow();
    expect(() => assertValidCategory(cat('c1', 'expense'))).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() => assertValidCategory(cat(''))).toThrow(LedgerError);
  });

  it('rejects empty name', () => {
    expect(() => assertValidCategory(
      cat('c1', 'income', { name: '' })
    )).toThrow('category "c1": name must be non-empty');
  });

  it('rejects invalid kind', () => {
    expect(() => assertValidCategory(cat('c1', 'asset' as unknown as 'income'))).toThrow(
      'category "c1": kind must be "income" or "expense", got asset',
    );
  });
});

// --- assertValidTxn -------------------------------------------------------

describe('assertValidTxn (income)', () => {
  const ctx = ctxOf([A1], [CAT_I, CAT_E]);

  it('accepts a valid income txn', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci' }), ctx)).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() => assertValidTxn(txn({ id: '' }), ctx)).toThrow(LedgerError);
  });

  it('rejects amount 0', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 0 }), ctx)).toThrow(
      'txn "t1": amount must be a positive integer in minor units (got 0)',
    );
  });

  it('rejects negative amount', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: -100 }), ctx)).toThrow(
      'txn "t1": amount must be a positive integer in minor units (got -100)',
    );
  });

  it('rejects non-integer amount', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 12.5 }), ctx)).toThrow(
      'txn "t1": amount must be a positive integer in minor units (got 12.5)',
    );
  });

  it('rejects bad date', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', date: '2026-13-01' }), ctx)).toThrow(
      'txn "t1": date must be a valid YYYY-MM-DD string (got 2026-13-01)',
    );
  });

  it('rejects missing accountId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: '' as unknown as string, categoryId: 'ci' }), ctx)).toThrow(LedgerError);
  });

  it('rejects nonexistent accountId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'missing', categoryId: 'ci' }), ctx)).toThrow(
      'txn "t1": accountId "missing" does not exist',
    );
  });

  it('rejects income without categoryId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1' }), ctx)).toThrow(
      'txn "t1": income requires a categoryId',
    );
  });

  it('rejects nonexistent categoryId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'c' }), ctx)).toThrow(
      'txn "t1": categoryId "c" does not exist',
    );
  });

  it('rejects wrong-kind categoryId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ce' }), ctx)).toThrow(
      'txn "t1": income needs an income category, got kind "expense"',
    );
  });

  it('rejects toAccountId on non-transfer', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', toAccountId: 'a2' }), ctxOf([A1, A2], [CAT_I]))).toThrow(
      'txn "t1": toAccountId is only valid on transfers',
    );
  });
});

describe('assertValidTxn (expense)', () => {
  const ctx = ctxOf([A1], [CAT_I, CAT_E]);

  it('accepts a valid expense txn', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'expense', accountId: 'a1', categoryId: 'ce' }), ctx)).not.toThrow();
  });

  it('rejects expense with income category', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'expense', accountId: 'a1', categoryId: 'ci' }), ctx)).toThrow(
      'txn "t1": expense needs an expense category, got kind "income"',
    );
  });

  it('rejects expense without categoryId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'expense', accountId: 'a1' }), ctx)).toThrow(
      'txn "t1": expense requires a categoryId',
    );
  });
});

describe('assertValidTxn (transfer)', () => {
  it('accepts a valid transfer', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'a2' }), ctxOf([A1, A2], []))).not.toThrow();
  });

  it('rejects transfer without toAccountId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'transfer', accountId: 'a1' }), ctxOf([A1, A2], []))).toThrow(
      'txn "t1": transfer requires a toAccountId',
    );
  });

  it('rejects self-transfer', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'a1' }), ctxOf([A1], []))).toThrow(
      'txn "t1": transfer source and destination must differ',
    );
  });

  it('rejects nonexistent toAccountId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'missing' }), ctxOf([A1, A2], []))).toThrow(
      'txn "t1": toAccountId "missing" does not exist',
    );
  });

  it('rejects transfer with categoryId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'a2', categoryId: 'ci' }), ctxOf([A1, A2], [CAT_I]))).toThrow(
      'txn "t1": transfers are not classified (remove categoryId)',
    );
  });

  it('rejects transfer with missing toAccountId', () => {
    expect(() => assertValidTxn(txn({ id: 't1', type: 'transfer', accountId: 'a1' }), ctxOf([A1, A2], []))).toThrow(
      'txn "t1": transfer requires a toAccountId',
    );
  });
});

// --- computeAccountBalances -----------------------------------------------

describe('computeAccountBalances', () => {
  it('starts from opening balance', () => {
    const b = computeAccountBalances([acc('a1', { openingBalance: 1000 })], []);
    expect(b.get('a1')).toBe(1000);
  });

  it('adds income, subtracts expense', () => {
    const b = computeAccountBalances(
      [acc('a1')],
      [
        txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 50000 }),
        txn({ id: 't2', type: 'expense', accountId: 'a1', categoryId: 'ce', amount: 20000 }),
      ],
    );
    expect(b.get('a1')).toBe(30000);
  });

  it('transfer subtracts from source, adds to destination', () => {
    const b = computeAccountBalances(
      [acc('a1', { openingBalance: 100000 }), acc('a2')],
      [txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'a2', amount: 30000 })],
    );
    expect(b.get('a1')).toBe(70000);
    expect(b.get('a2')).toBe(30000);
  });

  it('archived txns are excluded', () => {
    const b = computeAccountBalances(
      [acc('a1')],
      [
        txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 1000, archived: true }),
        txn({ id: 't2', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 500 }),
      ],
    );
    expect(b.get('a1')).toBe(500);
  });

  it('keeps archived accounts in the derived map for historical integrity', () => {
    const b = computeAccountBalances(
      [acc('a1', { archived: true }), acc('a2')],
      [
        txn({
          id: 't1',
          type: 'income',
          accountId: 'a2',
          categoryId: 'ci',
          amount: 100,
        }),
      ],
    );

    expect(b.get('a2')).toBe(100);
    expect(b.get('a1')).toBe(0);
  });

  it('strict: throws on duplicate account id', () => {
    expect(() => computeAccountBalances([acc('a1'), acc('a1')], [])).toThrow('duplicate account id "a1"');
  });

  it('lenient: later account with same id overrides', () => {
    const b = computeAccountBalances([acc('a1', { openingBalance: 100 }), acc('a1', { openingBalance: 200 })], [], { strict: false });
    expect(b.get('a1')).toBe(200);
  });

  it('strict: throws on duplicate txn id', () => {
    expect(() =>
      computeAccountBalances(
        [acc('a1')],
        [
          txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 100 }),
          txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 200 }),
        ],
      ),
    ).toThrow('duplicate txn id "t1"');
  });

  it('lenient: duplicate txn id counted once', () => {
    const b = computeAccountBalances(
      [acc('a1')],
      [
        txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 100 }),
        txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 200 }),
      ],
      { strict: false },
    );
    expect(b.get('a1')).toBe(100);
  });

  it('strict: throws on unknown account reference', () => {
    expect(() => computeAccountBalances([acc('a1')], [txn({ id: 't1', type: 'income', accountId: 'aX' })])).toThrow(
      'txn "t1": unknown account "aX"',
    );
  });

  it('lenient: unknown account reference is skipped', () => {
    const b = computeAccountBalances([acc('a1')], [txn({ id: 't1', type: 'income', accountId: 'aX' })], { strict: false });
    expect(b.get('a1')).toBe(0);
  });

  it('strict: throws on invalid amount or date', () => {
    expect(() =>
      computeAccountBalances([acc('a1')], [txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: -5 })]),
    ).toThrow('txn "t1": invalid amount or date');
  });

  it('strict: throws on invalid transfer destination', () => {
    expect(() =>
      computeAccountBalances([acc('a1')], [txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'a1' })]),
    ).toThrow('txn "t1": invalid transfer destination');
  });

  it('strict: throws on unknown toAccount', () => {
    expect(() =>
      computeAccountBalances([acc('a1'), acc('a2')], [txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'aZ' })]),
    ).toThrow('txn "t1": unknown toAccount "aZ"');
  });
});

// --- accountBalance / consolidatedBalance / txnEffectOn -------------------

describe('accountBalance', () => {
  it('returns the balance for a known account', () => {
    const b = computeAccountBalances([acc('a1', { openingBalance: 42 })], []);
    expect(accountBalance(b, 'a1')).toBe(42);
  });

  it('throws for unknown account', () => {
    const b = computeAccountBalances([acc('a1')], []);
    expect(() => accountBalance(b, 'aX')).toThrow('no balance computed for account "aX"');
  });
});

describe('consolidatedBalance', () => {
  it('sums non-archived balances', () => {
    const accounts = [acc('a1', { openingBalance: 100 }), acc('a2', { openingBalance: -30 }), acc('a3', { openingBalance: 999, archived: true })];
    const b = computeAccountBalances(accounts, []);
    expect(consolidatedBalance(accounts, b)).toBe(70);
  });

  it('returns 0 when all accounts are archived', () => {
    const accounts = [acc('a1', { openingBalance: 100, archived: true })];
    const b = computeAccountBalances(accounts, []);
    expect(consolidatedBalance(accounts, b)).toBe(0);
  });
});

describe('txnEffectOn', () => {
  it('income: positive on the account', () => {
    const t = txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 500 });
    expect(txnEffectOn(t, 'a1')).toBe(500);
  });

  it('expense: negative on the account', () => {
    const t = txn({ id: 't1', type: 'expense', accountId: 'a1', categoryId: 'ce', amount: 300 });
    expect(txnEffectOn(t, 'a1')).toBe(-300);
  });

  it('transfer: negative on source, positive on destination', () => {
    const t = txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'a2', amount: 700 });
    expect(txnEffectOn(t, 'a1')).toBe(-700);
    expect(txnEffectOn(t, 'a2')).toBe(700);
    expect(txnEffectOn(t, 'a3')).toBe(0);
  });
});

// --- setTxnArchived / setAccountArchived ----------------------------------

describe('setTxnArchived', () => {
  it('sets archived to true', () => {
    const t = txn({ id: 't1' });
    const out = setTxnArchived(t, true, NOW);
    expect(out.archived).toBe(true);
    expect(out.updatedAt).toBe(NOW);
  });

  it('sets archived to false', () => {
    const t = txn({ id: 't1', archived: true });
    const out = setTxnArchived(t, false, NOW);
    expect(out.archived).toBe(false);
  });

  it('returns same reference when value unchanged', () => {
    const t = txn({ id: 't1', archived: true });
    expect(setTxnArchived(t, true)).toBe(t);
  });

  it('does not mutate the original', () => {
    const t = txn({ id: 't1' });
    setTxnArchived(t, true, NOW);
    expect('archived' in t).toBe(false);
  });
});

describe('setAccountArchived', () => {
  it('sets archived to true', () => {
    const a = acc('a1');
    const out = setAccountArchived(a, true, NOW);
    expect(out.archived).toBe(true);
    expect(out.updatedAt).toBe(NOW);
  });

  it('returns same reference when value unchanged', () => {
    const a = acc('a1', { archived: false });
    expect(setAccountArchived(a, false)).toBe(a);
  });

  it('does not mutate the original', () => {
    const a = acc('a1');
    setAccountArchived(a, true, NOW);
    expect(a.archived).toBe(false);
  });
});

// --- editTxn / editAccount -------------------------------------------------

describe('editTxn', () => {
  const ctx = ctxOf([A1, A2], [CAT_I, CAT_E]);
  const base = () => txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 1000, createdAt: '2026-01-01T00:00:00.000Z' });

  it('updates amount', () => {
    const out = editTxn(base(), { amount: 2500 }, ctx, NOW);
    expect(out.amount).toBe(2500);
    expect(out.updatedAt).toBe(NOW);
  });

  it('updates date', () => {
    const out = editTxn(base(), { date: '2026-10-15' }, ctx, NOW);
    expect(out.date).toBe('2026-10-15');
  });

  it('rejects changing income to an expense category', () => {
    expect(() =>
      editTxn(base(), { categoryId: 'ce' }, ctx, NOW)
    ).toThrow(
      'txn "t1": income needs an income category, got kind "expense"',
    );
  });

  it('throws when clearing required categoryId on income', () => {
    expect(() => editTxn(base(), { categoryId: undefined }, ctx, NOW)).toThrow(
      'txn "t1": income requires a categoryId',
    );
  });

  it('throws on immutable id', () => {
    expect(() => editTxn(base(), { id: 'other' }, ctx, NOW)).toThrow('txn: id is immutable');
  });

  it('throws on immutable createdAt', () => {
    expect(() => editTxn(base(), { createdAt: '2026-01-02T00:00:00.000Z' }, ctx, NOW)).toThrow('txn: createdAt is immutable');
  });

  it('validates the resulting txn', () => {
    expect(() => editTxn(base(), { accountId: 'missing' }, ctx, NOW)).toThrow(
      'txn "t1": accountId "missing" does not exist',
    );
  });

  it('preserves fields not in patch', () => {
    const t = base();
    const out = editTxn(t, { amount: 999 }, ctx, NOW);
    expect(out.type).toBe('income');
    expect(out.accountId).toBe('a1');
    expect(out.categoryId).toBe('ci');
    expect(out.date).toBe('2026-09-01');
  });

  it('does not mutate the original', () => {
    const t = base();
    editTxn(t, { amount: 9999 }, ctx, NOW);
    expect(t.amount).toBe(1000);
  });

  it('clearing toAccountId makes it a plain income', () => {
    const t = txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', toAccountId: 'a2' });
    // This would be invalid as-is, but after clearing toAccountId it should be valid
    const out = editTxn(t, { toAccountId: undefined }, ctxOf([A1, A2], [CAT_I]), NOW);
    expect('toAccountId' in out).toBe(false);
  });
});

describe('editAccount', () => {
  it('updates name', () => {
    const out = editAccount(acc('a1'), { name: 'New Name' }, NOW);
    expect(out.name).toBe('New Name');
    expect(out.updatedAt).toBe(NOW);
  });

  it('updates type', () => {
    const out = editAccount(acc('a1'), { type: 'bank' as Account['type'] }, NOW);
    expect(out.type).toBe('bank');
  });

  it('updates openingBalance', () => {
    const out = editAccount(acc('a1'), { openingBalance: 50000 }, NOW);
    expect(out.openingBalance).toBe(50000);
  });

  it('throws on immutable id', () => {
    expect(() => editAccount(acc('a1'), { id: 'other' }, NOW)).toThrow('account: id is immutable');
  });

  it('throws on immutable createdAt', () => {
    expect(() => editAccount(acc('a1'), { createdAt: '2026-01-02T00:00:00.000Z' }, NOW)).toThrow('account: createdAt is immutable');
  });

  it('validates the resulting account', () => {
    expect(() => editAccount(acc('a1'), { name: '' }, NOW)).toThrow('account "a1": name must be non-empty');
  });

  it('does not mutate the original', () => {
    const a = acc('a1');
    editAccount(a, { name: 'Changed' }, NOW);
    expect(a.name).toBe('Account a1');
  });
});

// --- validateLedger --------------------------------------------------------

describe('validateLedger', () => {
  const validAccounts = [acc('a1'), acc('a2')];
  const validCategories = [CAT_I, CAT_E];
  const validTxns = [
    txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 1000 }),
    txn({ id: 't2', type: 'expense', accountId: 'a1', categoryId: 'ce', amount: 500 }),
    txn({ id: 't3', type: 'transfer', accountId: 'a1', toAccountId: 'a2', amount: 200 }),
  ];

  it('accepts a fully valid ledger', () => {
    const res = validateLedger({ accounts: validAccounts, categories: validCategories, txns: validTxns });
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('reports all account problems', () => {
    const res = validateLedger({
      accounts: [
        acc('a1', { name: '' }),
        { ...acc('a1'), id: '' },
        acc('a3', { type: undefined as unknown as Account['type'] }),
      ],
      categories: [],
      txns: [],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
    const problems = res.errors.map((e) => e.problem);
    expect(problems).toContain('name must be non-empty');
    expect(problems).toContain('id missing or empty');
    expect(problems).toContain('type must be one of cash | bank | investment | credit | other');
  });

  it('reports duplicate account ids', () => {
    const res = validateLedger({ accounts: [acc('a1'), acc('a1')], categories: [], txns: [] });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.problem === 'duplicate id')).toBe(true);
  });

  it('reports category problems', () => {
    const res = validateLedger({
      accounts: [],
      categories: [cat('c1', 'income', { name: '' }), cat('c2', 'asset' as unknown as 'income')],
      txns: [],
    });
    expect(res.ok).toBe(false);
    const problems = res.errors.map((e) => e.problem);
    expect(problems).toContain('name must be non-empty');
    expect(problems).toContain('kind must be income or expense');
  });

  it('reports txn problems', () => {
    const res = validateLedger({
      accounts: validAccounts,
      categories: validCategories,
      txns: [
        txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 0 }),
        txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 100, date: 'bad' }),
        txn({ id: 't2', type: 'income', accountId: 'missing', categoryId: 'ci', amount: 100 }),
      ],
    });
    expect(res.ok).toBe(false);
    const problems = res.errors.map((e) => e.problem);
    expect(problems).toContain('amount must be a positive integer in minor units');
    expect(problems).toContain('date must be a valid YYYY-MM-DD string');
    expect(problems).toContain('accountId "missing" does not exist');
    expect(problems).toContain('duplicate id');
  });

  it('reports transfer problems', () => {
    const res = validateLedger({
      accounts: validAccounts,
      categories: validCategories,
      txns: [
        txn({ id: 't1', type: 'transfer', accountId: 'a1', amount: 100 }),
        txn({ id: 't2', type: 'transfer', accountId: 'a1', toAccountId: 'a1', amount: 100 }),
        txn({ id: 't3', type: 'transfer', accountId: 'a1', toAccountId: 'a2', categoryId: 'ci', amount: 100 }),
      ],
    });
    expect(res.ok).toBe(false);
    const problems = res.errors.map((e) => e.problem);
    expect(problems).toContain('transfer requires toAccountId');
    expect(problems).toContain('transfer source and destination must differ');
    expect(problems).toContain('transfers are not classified (remove categoryId)');
  });

  it('reports toAccountId on non-transfer', () => {
    const res = validateLedger({
      accounts: validAccounts,
      categories: validCategories,
      txns: [txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', toAccountId: 'a2', amount: 100 })],
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0].problem).toBe('toAccountId is only valid on transfers');
  });

  it('reports missing categoryId on income', () => {
    const res = validateLedger({
      accounts: validAccounts,
      categories: validCategories,
      txns: [txn({ id: 't1', type: 'income', accountId: 'a1', amount: 100 })],
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0].problem).toBe('income requires a categoryId');
  });

  it('reports wrong-kind category', () => {
    const res = validateLedger({
      accounts: validAccounts,
      categories: validCategories,
      txns: [txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ce', amount: 100 })],
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0].problem).toBe('income needs a income category (got expense)');
  });

  it('reports nonexistent categoryId', () => {
    const res = validateLedger({
      accounts: validAccounts,
      categories: validCategories,
      txns: [txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'nope', amount: 100 })],
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0].problem).toBe('categoryId "nope" does not exist');
  });

  it('reports nonexistent toAccountId', () => {
    const res = validateLedger({
      accounts: validAccounts,
      categories: validCategories,
      txns: [txn({ id: 't1', type: 'transfer', accountId: 'a1', toAccountId: 'nope', amount: 100 })],
    });
    expect(res.ok).toBe(false);
    expect(res.errors[0].problem).toBe('toAccountId "nope" does not exist');
  });

  it('entity field is correct for each problem', () => {
    const res = validateLedger({
      accounts: [acc('a1', { name: '' })],
      categories: [cat('c1', 'income', { name: '' })],
      txns: [txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 0 })],
    });
    const entities = new Set(res.errors.map((e) => e.entity));
    expect(entities).toContain('account');
    expect(entities).toContain('category');
    expect(entities).toContain('txn');
  });

  it('id is present on each error', () => {
    const res = validateLedger({
      accounts: [acc('a1', { name: '' })],
      categories: [],
      txns: [],
    });
    expect(res.errors[0].id).toBe('a1');
  });
});

// --- invariant tests -----------------------------------------------------

describe('computeAccountBalances invariants', () => {
  it('positive safe-integer overflow throws RangeError', () => {
    expect(() =>
      computeAccountBalances(
        [acc('a1', { openingBalance: Number.MAX_SAFE_INTEGER })],
        [txn({ id: 't1', type: 'income', accountId: 'a1', categoryId: 'ci', amount: 1 })]
      )
    ).toThrow(RangeError);
  });

  it('negative safe-integer underflow throws RangeError', () => {
    expect(() =>
      computeAccountBalances(
        [acc('a1', { openingBalance: -Number.MAX_SAFE_INTEGER })],
        [txn({ id: 't1', type: 'expense', accountId: 'a1', categoryId: 'ce', amount: 1 })]
      )
    ).toThrow(RangeError);
  });

  it('plain transfer conserves total balance', () => {
    const accounts = [
      acc('a1', { openingBalance: 100000 }),
      acc('a2', { openingBalance: 25000 }),
    ];

    const before = consolidatedBalance(
      accounts,
      computeAccountBalances(accounts, []),
    );

    const after = consolidatedBalance(
      accounts,
      computeAccountBalances(accounts, [
        txn({
          id: 't1',
          type: 'transfer',
          accountId: 'a1',
          toAccountId: 'a2',
          amount: 30000,
        }),
      ]),
    );

    expect(after).toBe(before);
  });

  it('transfer conservation with negative credit balance', () => {
    const accounts = [
      acc('a1', { type: 'bank', openingBalance: 100000 }),
      acc('a2', { type: 'credit', openingBalance: -50000 }),
    ];

    const before = consolidatedBalance(
      accounts,
      computeAccountBalances(accounts, []),
    );

    const after = consolidatedBalance(
      accounts,
      computeAccountBalances(accounts, [
        txn({
          id: 't1',
          type: 'transfer',
          accountId: 'a1',
          toAccountId: 'a2',
          amount: 20000,
        }),
      ]),
    );

    expect(after).toBe(before);
  });
});
