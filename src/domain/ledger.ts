/**
 * FOLIO — ledger domain (accounts, categories, transactions, balances).
 *
 * The single source of truth for "what happened". Balances are DERIVED,
 * never stored: they are recomputed here from transactions, in integer
 * minor units, and never touch float arithmetic.
 *
 * Core invariants enforced here (see test/unit/ledger.test.ts):
 *  - a transfer always moves the same amount out of one account and into
 *    another, two distinct accounts, so total money in the system is
 *    conserved;
 *  - income/expense transactions are classified (a category of the matching
 *    kind) and touch exactly one account;
 *  - transactions are never hard-deleted: they are archived (soft delete)
 *    and archived transactions are excluded from balances;
 *  - balances are always derived from the transaction list, so an edit or
 *    un-archiving a transaction is automatically consistent.
 *
 * All money math goes through the integer helpers in ./money.
 */

import { Account, Category, Txn } from './types';
import { addMinor, isMinorUnits } from './money';
import { isValidDate } from './dates';

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

// ── validation ────────────────────────────────────────────────────────

/** A positive integer in minor units (₹0.01 is the smallest unit). */
function isPositiveMinor(n: unknown): n is number {
  return isMinorUnits(n) && (n as number) > 0;
}

/** The five account subtypes in types.ts (source of truth). */
const ACCOUNT_TYPES = new Set<string>(['cash', 'bank', 'investment', 'credit', 'other']);

function isAccountType(t: unknown): boolean {
  return typeof t === 'string' && ACCOUNT_TYPES.has(t);
}

export function assertValidAccount(account: Account): void {
  if (typeof account.id !== 'string' || account.id.length === 0) {
    throw new LedgerError('account: id must be a non-empty string');
  }
  if (typeof account.name !== 'string' || account.name.trim().length === 0) {
    throw new LedgerError(`account "${account.id}": name must be non-empty`);
  }
  if (!isAccountType(account.type)) {
    throw new LedgerError(
      `account "${account.id}": type must be one of cash | bank | investment | credit | other, got ${String(account.type)}`,
    );
  }
  if (!isMinorUnits(account.openingBalance)) {
    throw new LedgerError(
      `account "${account.id}": openingBalance must be a signed integer in minor units (liabilities start negative)`,
    );
  }
}

export function assertValidCategory(category: Category): void {
  if (typeof category.id !== 'string' || category.id.length === 0) {
    throw new LedgerError('category: id must be a non-empty string');
  }
  if (typeof category.name !== 'string' || category.name.trim().length === 0) {
    throw new LedgerError(`category "${category.id}": name must be non-empty`);
  }
  if (category.kind !== 'income' && category.kind !== 'expense') {
    throw new LedgerError(
      `category "${category.id}": kind must be "income" or "expense", got ${String(category.kind)}`,
    );
  }
}

/**
 * Validates a transaction against a ledger context (existing accounts and
 * categories). Throws a LedgerError describing the first violation found.
 */
export function assertValidTxn(
  txn: Txn,
  ctx: { accountsById: Map<string, Account>; categoriesById: Map<string, Category> },
): void {
  if (typeof txn.id !== 'string' || txn.id.length === 0) {
    throw new LedgerError('txn: id must be a non-empty string');
  }
  if (!isPositiveMinor(txn.amount)) {
    throw new LedgerError(
      `txn "${txn.id}": amount must be a positive integer in minor units (got ${String(txn.amount)})`,
    );
  }
  if (!isValidDate(txn.date)) {
    throw new LedgerError(
      `txn "${txn.id}": date must be a valid YYYY-MM-DD string (got ${String(txn.date)})`,
    );
  }

  const account = ctx.accountsById.get(txn.accountId);
  if (!account) {
    throw new LedgerError(`txn "${txn.id}": accountId "${txn.accountId}" does not exist`);
  }

  if (txn.type === 'transfer') {
    if (typeof txn.toAccountId !== 'string' || txn.toAccountId.length === 0) {
      throw new LedgerError(`txn "${txn.id}": transfer requires a toAccountId`);
    }
    if (txn.toAccountId === txn.accountId) {
      throw new LedgerError(`txn "${txn.id}": transfer source and destination must differ`);
    }
    if (!ctx.accountsById.has(txn.toAccountId)) {
      throw new LedgerError(`txn "${txn.id}": toAccountId "${txn.toAccountId}" does not exist`);
    }
    if (txn.categoryId !== undefined && txn.categoryId !== null && txn.categoryId.length > 0) {
      throw new LedgerError(`txn "${txn.id}": transfers are not classified (remove categoryId)`);
    }
    return;
  }

  if (txn.toAccountId !== undefined && txn.toAccountId !== null) {
    throw new LedgerError(`txn "${txn.id}": toAccountId is only valid on transfers`);
  }

  if (typeof txn.categoryId !== 'string' || txn.categoryId.length === 0) {
    throw new LedgerError(`txn "${txn.id}": ${txn.type} requires a categoryId`);
  }
  const category = ctx.categoriesById.get(txn.categoryId);
  if (!category) {
    throw new LedgerError(`txn "${txn.id}": categoryId "${txn.categoryId}" does not exist`);
  }
  if (category.kind !== txn.type) {
    throw new LedgerError(
      `txn "${txn.id}": ${txn.type} needs an ${txn.type} category, got kind "${category.kind}"`,
    );
  }
}

// ── balance derivation ────────────────────────────────────────────────

/**
 * Signed effect of one transaction on one account, in minor units:
 *  - income to the account:        +amount
 *  - expense from the account:     -amount
 *  - transfer out of the account:  -amount
 *  - transfer into the account:    +amount
 *  - archived transactions:        0 (excluded from balances)
 *  - any other account:            0
 */
export function txnEffectOn(txn: Txn, accountId: string): number {
  if (txn.archived === true) return 0;
  if (txn.accountId === accountId) {
    return txn.type === 'income' ? txn.amount : -txn.amount;
  }
  if (txn.type === 'transfer' && txn.toAccountId === accountId) {
    return txn.amount;
  }
  return 0;
}

export interface BalanceOptions {
  /**
   * true (default): throw LedgerError on duplicate ids, unknown references,
   * or self-transfers. For loading real user data.
   * false: skip invalid transactions silently (and let later duplicate
   * account entries override earlier ones). For tolerant display paths.
   */
  strict?: boolean;
}

/**
 * Computes every account's balance in minor units:
 *   balance = openingBalance + Σ effects of its non-archived transactions.
 *
 * Returns a ReadonlyMap<accountId, balance>. All arithmetic is integer
 * addition (addMinor), so it is exact and overflow/underflow-checked.
 */
export function computeAccountBalances(
  accounts: readonly Account[],
  txns: readonly Txn[],
  options: BalanceOptions = {},
): ReadonlyMap<string, number> {
  const { strict = true } = options;
  const balances = new Map<string, number>();

  const seenIds = new Set<string>();
  for (const account of accounts) {
    if (typeof account.id !== 'string' || account.id.length === 0) {
      if (strict) throw new LedgerError('account with empty or missing id');
      continue;
    }
    if (seenIds.has(account.id)) {
      if (strict) throw new LedgerError(`duplicate account id "${account.id}"`);
      // lenient: later entry overrides
      balances.delete(account.id);
    }
    seenIds.add(account.id);
    if (!isMinorUnits(account.openingBalance)) {
      if (strict) throw new LedgerError(`account "${account.id}": invalid openingBalance`);
      continue;
    }
    balances.set(account.id, account.openingBalance);
  }

  const known = new Set(balances.keys());
  const txnIds = new Set<string>();
  for (const txn of txns) {
    const id = (txn as { id?: unknown }).id;
    if (typeof id !== 'string' || id.length === 0) {
      if (strict) throw new LedgerError('txn with empty or missing id');
      continue;
    }
    if (txnIds.has(id)) {
      if (strict) throw new LedgerError(`duplicate txn id "${id}"`);
      continue; // lenient: count a duplicate txn exactly once
    }
    txnIds.add(id);

    if (!isPositiveMinor(txn.amount) || !isValidDate(txn.date)) {
      if (strict) throw new LedgerError(`txn "${id}": invalid amount or date`);
      continue;
    }
    if (txn.type === 'transfer') {
      if (
        typeof txn.toAccountId !== 'string' ||
        txn.toAccountId === '' ||
        txn.toAccountId === txn.accountId
      ) {
        if (strict) throw new LedgerError(`txn "${id}": invalid transfer destination`);
        continue;
      }
    }
    if (!known.has(txn.accountId)) {
      if (strict) throw new LedgerError(`txn "${id}": unknown account "${txn.accountId}"`);
      continue;
    }
    if (txn.type === 'transfer') {
      const dest = txn.toAccountId as string;
      if (!known.has(dest)) {
        if (strict) throw new LedgerError(`txn "${id}": unknown toAccount "${dest}"`);
        continue;
      }
    }

    balances.set(
      txn.accountId,
      addMinor(balances.get(txn.accountId) as number, txnEffectOn(txn, txn.accountId)),
    );
    if (txn.type === 'transfer') {
      const dest = txn.toAccountId as string;
      balances.set(dest, addMinor(balances.get(dest) as number, txnEffectOn(txn, dest)));
    }
  }

  return balances;
}

/** Balance of one account from a computed balance map (throws if absent). */
export function accountBalance(balances: ReadonlyMap<string, number>, accountId: string): number {
  if (!balances.has(accountId)) {
    throw new LedgerError(`no balance computed for account "${accountId}"`);
  }
  return balances.get(accountId) as number;
}

/**
 * Consolidated net position across all non-archived accounts, in minor units.
 *
 * Balances are already signed as "money owned" (liability accounts carry
 * negative balances), so this is a plain sum — no type-based sign flip.
 */
export function consolidatedBalance(
  accounts: readonly Account[],
  balances: ReadonlyMap<string, number>,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const account of accounts) {
    if (typeof account.id !== 'string' || account.id.length === 0 || seen.has(account.id)) continue;
    seen.add(account.id);
    if (account.archived === true) continue;
    if (!balances.has(account.id)) continue;
    total = addMinor(total, balances.get(account.id) as number);
  }
  return total;
}

// ── soft delete (archive) ─────────────────────────────────────────────

/** Returns a new transaction with `archived` set; never mutates the input. */
export function setTxnArchived(
  txn: Txn,
  archived: boolean,
  now: string = new Date().toISOString(),
): Txn {
  if (txn.archived === archived) return txn;
  return { ...txn, archived, updatedAt: now };
}

export function setAccountArchived(
  account: Account,
  archived: boolean,
  now: string = new Date().toISOString(),
): Account {
  if (account.archived === archived) return account;
  return { ...account, archived, updatedAt: now };
}

// ── edits ─────────────────────────────────────────────────────────────

/**
 * Patch semantics: a key present in `patch` with value `undefined` CLEARS
 * that field on the result (used to remove optional fields like categoryId
 * or toAccountId). A key absent from `patch` is left untouched.
 * `id` and `createdAt` are immutable — attempting to change them throws.
 * The merged entity is re-validated, then `updatedAt` is stamped.
 */
type ClearablePatch<T> = { [K in keyof T]?: T[K] | undefined } & Record<string, unknown>;

function mergeWithClear<T extends object>(base: T, patch: ClearablePatch<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
  return out as T;
}

function assertIdentity(base: { id: string; createdAt: string }, patch: Record<string, unknown>, what: string): void {
  if ('id' in patch && patch.id !== base.id) {
    throw new LedgerError(`${what}: id is immutable`);
  }
  if ('createdAt' in patch && patch.createdAt !== base.createdAt) {
    throw new LedgerError(`${what}: createdAt is immutable`);
  }
}

/** Edit a transaction: merge patch, re-validate against ctx, stamp updatedAt. */
export function editTxn(
  txn: Txn,
  patch: ClearablePatch<Txn>,
  ctx: { accountsById: Map<string, Account>; categoriesById: Map<string, Category> },
  now: string = new Date().toISOString(),
): Txn {
  const merged = mergeWithClear(txn, patch);
  assertIdentity(txn, patch, 'txn');
  assertValidTxn(merged, ctx);
  return { ...merged, updatedAt: now };
}

/** Edit an account: merge patch, re-validate, stamp updatedAt. */
export function editAccount(
  account: Account,
  patch: ClearablePatch<Account>,
  now: string = new Date().toISOString(),
): Account {
  const merged = mergeWithClear(account, patch);
  assertIdentity(account, patch, 'account');
  assertValidAccount(merged);
  return { ...merged, updatedAt: now };
}

// ── whole-ledger validation (no throwing, collects all errors) ────────

export interface LedgerValidationIssue {
  entity: 'account' | 'category' | 'txn';
  id: string;
  problem: string;
}

export interface LedgerValidationResult {
  ok: boolean;
  errors: LedgerValidationIssue[];
}

/**
 * Checks an entire ledger for structural problems and reports ALL of them
 * (duplicate ids, unknown references, self-transfers, kind/category
 * mismatch, invalid amounts/dates) instead of stopping at the first.
 */
export function validateLedger(input: {
  accounts: readonly Account[];
  categories: readonly Category[];
  txns: readonly Txn[];
}): LedgerValidationResult {
  const errors: LedgerValidationIssue[] = [];
  const push = (entity: LedgerValidationIssue['entity'], id: string, problem: string) =>
    errors.push({ entity, id, problem });

  const accountIds = new Set<string>();
  for (const a of input.accounts) {
    if (typeof a.id !== 'string' || a.id.length === 0) {
      push('account', String(a.id), 'id missing or empty');
      continue;
    }
    if (accountIds.has(a.id)) push('account', a.id, 'duplicate id');
    accountIds.add(a.id);
    if (typeof a.name !== 'string' || a.name.trim().length === 0) push('account', a.id, 'name must be non-empty');
    if (!isAccountType(a.type)) push('account', a.id, 'type must be one of cash | bank | investment | credit | other');
    if (!isMinorUnits(a.openingBalance)) push('account', a.id, 'openingBalance must be a signed integer in minor units');
  }

  const categoryIds = new Set<string>();
  const categoriesById = new Map<string, Category>();
  for (const c of input.categories) {
    if (typeof c.id !== 'string' || c.id.length === 0) {
      push('category', String(c.id), 'id missing or empty');
      continue;
    }
    if (categoryIds.has(c.id)) push('category', c.id, 'duplicate id');
    categoryIds.add(c.id);
    categoriesById.set(c.id, c);
    if (typeof c.name !== 'string' || c.name.trim().length === 0) push('category', c.id, 'name must be non-empty');
    if (c.kind !== 'income' && c.kind !== 'expense') push('category', c.id, 'kind must be income or expense');
  }

  const txnIds = new Set<string>();
  for (const t of input.txns) {
    if (typeof t.id !== 'string' || t.id.length === 0) {
      push('txn', String(t.id), 'id missing or empty');
      continue;
    }
    if (txnIds.has(t.id)) push('txn', t.id, 'duplicate id');
    txnIds.add(t.id);

    if (!isPositiveMinor(t.amount)) push('txn', t.id, 'amount must be a positive integer in minor units');
    if (!isValidDate(t.date)) push('txn', t.id, 'date must be a valid YYYY-MM-DD string');
    if (!accountIds.has(t.accountId)) push('txn', t.id, `accountId "${t.accountId}" does not exist`);

    if (t.type === 'transfer') {
      if (typeof t.toAccountId !== 'string' || t.toAccountId.length === 0) {
        push('txn', t.id, 'transfer requires toAccountId');
      } else {
        if (t.toAccountId === t.accountId) push('txn', t.id, 'transfer source and destination must differ');
        if (!accountIds.has(t.toAccountId)) push('txn', t.id, `toAccountId "${t.toAccountId}" does not exist`);
      }
      if (t.categoryId !== undefined && t.categoryId !== null && t.categoryId.length > 0) {
        push('txn', t.id, 'transfers are not classified (remove categoryId)');
      }
    } else {
      if (t.toAccountId !== undefined && t.toAccountId !== null) {
        push('txn', t.id, 'toAccountId is only valid on transfers');
      }
      if (typeof t.categoryId !== 'string' || t.categoryId.length === 0) {
        push('txn', t.id, `${t.type} requires a categoryId`);
      } else if (!categoryIds.has(t.categoryId)) {
        push('txn', t.id, `categoryId "${t.categoryId}" does not exist`);
      } else {
        const cat = categoriesById.get(t.categoryId) as Category;
        if (cat.kind !== t.type) push('txn', t.id, `${t.type} needs a ${t.type} category (got ${cat.kind})`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
