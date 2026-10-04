import { ProfileSession } from './profileSession.js';
import type { ProfileData, Account, Category, Txn, Recurring, Debt, Goal, HealthConfig } from '../domain/types.js';
import {
  assertValidAccount,
  assertValidCategory,
  assertValidTxn,
  editAccount,
  editTxn,
  setAccountArchived,
  setTxnArchived,
  computeAccountBalances,
  consolidatedBalance,
} from '../domain/ledger.js';
import { assertValidRecurring } from '../domain/recurring.js';
import { summarizeMonthlyCashFlow } from '../domain/cashflow.js';
import { currentMonthKey } from '../domain/dates.js';
import { assertValidDebt, summarizeDebts, projectDebtPayoff } from '../domain/debt.js';
import { assertValidGoal, projectGoal } from '../domain/goal.js';
import { assertValidHealthConfig, evaluateFinancialHealth } from '../domain/health.js';
import { evaluateAffordabilityScenario } from '../domain/scenario.js';
import { isValidMonthKey } from '../domain/dates.js';

type Listener = () => void;

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const arr = new Uint8Array(16);
  const c = (globalThis as any).crypto;
  if (c && 'getRandomValues' in c) {
    c.getRandomValues(arr);
  } else {
    throw new Error('Secure random not available');
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function nowIso(): string {
  return new Date().toISOString();
}

export class ReferencedEntityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencedEntityError';
  }
}

export class CannotDeleteCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CannotDeleteCategoryError';
  }
}

export class CannotUseArchivedAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CannotUseArchivedAccountError';
  }
}

export class FolioController {
  private session: ProfileSession;
  private listeners = new Set<Listener>();

  constructor(session: ProfileSession) {
    this.session = session;
  }

  get snapshot(): ProfileData {
    return this.session.getSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  private runUpdate(updater: (data: ProfileData) => ProfileData) {
    this.session.update(updater);
    this.notify();
  }

  setProfileIdentity(identity: NonNullable<ProfileData["identity"]>) {
    this.runUpdate(data=>({...data, identity}));
  }

  // Selectors
  getAccountBalances(activeOnly = true) {
    const snap = this.snapshot;
    const balances = computeAccountBalances(snap.accounts, snap.txns);
    const accounts = activeOnly ? snap.accounts.filter(a => !a.archived) : snap.accounts;
    return {
      balances,
      consolidated: consolidatedBalance(accounts, balances),
      accounts,
    };
  }

  getMonthlyCashFlow(monthKey: string) {
    return summarizeMonthlyCashFlow(this.snapshot.txns, this.snapshot.recurring, monthKey);
  }

  getCurrentMonthKey(): string {
    return currentMonthKey();
  }

  getRecentTransactions(limit = 20) {
    const txns = this.snapshot.txns
      .filter(t => !t.archived)
      .slice()
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    return txns.slice(0, limit);
  }

  // Accounts
  createAccount(input: { name: string; type: Account['type']; openingBalance: number; color?: string }) {
    const id = uid();
    const now = nowIso();
    const account: Account = {
      id,
      name: input.name.trim(),
      type: input.type,
      openingBalance: input.openingBalance,
      archived: false,
      createdAt: now,
      color: input.color,
    };
    assertValidAccount(account);
    this.runUpdate(d => ({
      ...d,
      accounts: [...d.accounts, account],
      updatedAt: now,
    }));
    return id;
  }

  editAccount(id: string, patch: Partial<Account>) {
    const data = this.snapshot;
    const idx = data.accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);
    const account = data.accounts[idx];
    const merged = editAccount(account, patch, nowIso());
    this.runUpdate(d => {
      const accounts = [...d.accounts];
      accounts[idx] = merged;
      return { ...d, accounts, updatedAt: nowIso() };
    });
  }

  setAccountArchived(id: string, archived: boolean) {
    const snap = this.snapshot;
    const idx = snap.accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);
    const account = snap.accounts[idx];
    const updated = setAccountArchived(account, archived, nowIso());
    this.runUpdate(d => {
      const accounts = [...d.accounts];
      accounts[idx] = updated;
      return { ...d, accounts, updatedAt: nowIso() };
    });
  }

  // Categories
  createCategory(input: { name: string; kind: Category['kind']; color?: string }) {
    const id = uid();
    const category: Category = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      color: input.color,
    };
    assertValidCategory(category);
    this.runUpdate(d => ({
      ...d,
      categories: [...d.categories, category],
      updatedAt: nowIso(),
    }));
    return id;
  }

  editCategory(id: string, patch: Partial<Category>) {
    const data = this.snapshot;
    const idx = data.categories.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Category ${id} not found`);
    const cat = data.categories[idx];
    const updated = { ...cat, ...patch };
    if (patch.name) updated.name = patch.name.trim();
    assertValidCategory(updated);
    this.runUpdate(d => {
      const categories = [...d.categories];
      categories[idx] = updated;
      return { ...d, categories, updatedAt: nowIso() };
    });
  }

  deleteCategory(id: string) {
    const data = this.snapshot;
    const usedInTxns = data.txns.some(t => t.categoryId === id);
    const usedInRecurring = data.recurring.some(r => r.categoryId === id);
    if (usedInTxns || usedInRecurring) {
      throw new CannotDeleteCategoryError(`Category ${id} is referenced by transactions or recurring commitments`);
    }
    this.runUpdate(d => ({
      ...d,
      categories: d.categories.filter(c => c.id !== id),
      updatedAt: nowIso(),
    }));
  }

  // Transactions
  private ensureAccountActive(id: string, data: ProfileData) {
    const acc = data.accounts.find(a => a.id === id);
    if (!acc) throw new Error(`Account ${id} not found`);
    if (acc.archived) throw new CannotUseArchivedAccountError(`Account ${id} is archived`);
    return acc;
  }

  createTransaction(input: {
    type: 'income' | 'expense' | 'transfer';
    date: string;
    amount: number;
    accountId: string;
    toAccountId?: string;
    categoryId?: string;
    note?: string;
  }) {
    const data = this.snapshot;
    this.ensureAccountActive(input.accountId, data);
    if (input.toAccountId) {
      this.ensureAccountActive(input.toAccountId, data);
      if (input.accountId === input.toAccountId) throw new Error('Source and destination must differ');
    }
    if (input.type === 'transfer') {
      if (!input.toAccountId) throw new Error('Transfer requires toAccountId');
      if (input.categoryId) throw new Error('Transfers cannot have category');
    } else {
      if (!input.categoryId) throw new Error(`${input.type} requires categoryId`);
    }
    const id = uid();
    const now = nowIso();
    const txn: Txn = {
      id,
      type: input.type,
      date: input.date,
      amount: input.amount,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      categoryId: input.categoryId,
      note: input.note,
      createdAt: now,
    };
    const ctx = {
      accountsById: new Map(data.accounts.map(a => [a.id, a])),
      categoriesById: new Map(data.categories.map(c => [c.id, c])),
    };
    assertValidTxn(txn, ctx);
    this.runUpdate(d => ({
      ...d,
      txns: [...d.txns, txn],
      updatedAt: now,
    }));
    return id;
  }

  editTransaction(id: string, patch: Partial<Txn>) {
    const snap = this.snapshot;
    const idx = snap.txns.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Txn ${id} not found`);
    const txn = snap.txns[idx];
    const ctx = {
      accountsById: new Map(snap.accounts.map(a => [a.id, a])),
      categoriesById: new Map(snap.categories.map(c => [c.id, c])),
    };
    const updated = editTxn(txn, patch, ctx, nowIso());
    // Enforce active account rule for new account references
    if (patch.accountId) this.ensureAccountActive(patch.accountId, snap);
    if (patch.toAccountId) this.ensureAccountActive(patch.toAccountId, snap);
    this.runUpdate(d => {
      const txns = [...d.txns];
      txns[idx] = updated;
      return { ...d, txns, updatedAt: nowIso() };
    });
  }

  setTxnArchived(id: string, archived: boolean) {
    const data = this.snapshot;
    const idx = data.txns.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Txn ${id} not found`);
    const txn = data.txns[idx];
    const updated = setTxnArchived(txn, archived, nowIso());
    this.runUpdate(d => {
      const txns = [...d.txns];
      txns[idx] = updated;
      return { ...d, txns, updatedAt: nowIso() };
    });
  }

  // Recurring
  createRecurring(input: {
    name: string;
    kind: 'income' | 'expense';
    amount: number;
    frequency: Recurring['frequency'];
    dayOfMonth: number;
    dayOfWeek?: number;
    accountId?: string;
    categoryId?: string;
    startDate: string;
    endDate?: string;
    active?: boolean;
    note?: string;
  }) {
    const data = this.snapshot;
    if (input.accountId) {
      this.ensureAccountActive(input.accountId, data);
    }
    const id = uid();
    const rec: Recurring = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      amount: input.amount,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      dayOfWeek: input.dayOfWeek,
      accountId: input.accountId,
      categoryId: input.categoryId,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active ?? true,
      note: input.note,
    };
    const ctx = {
      accountsById: new Map(data.accounts.map(a => [a.id, a])),
      categoriesById: new Map(data.categories.map(c => [c.id, c])),
    };
    assertValidRecurring(rec, ctx);
    this.runUpdate(d => ({
      ...d,
      recurring: [...d.recurring, rec],
      updatedAt: nowIso(),
    }));
    return id;
  }

  editRecurring(id: string, patch: Partial<Recurring>) {
    const data = this.snapshot;
    const idx = data.recurring.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Recurring ${id} not found`);
    const rec = data.recurring[idx];
    const updated = { ...rec, ...patch };
    if (patch.accountId && patch.accountId !== '') {
      this.ensureAccountActive(patch.accountId, data);
    }
    const ctx = {
      accountsById: new Map(data.accounts.map(a => [a.id, a])),
      categoriesById: new Map(data.categories.map(c => [c.id, c])),
    };
    assertValidRecurring(updated, ctx);
    this.runUpdate(d => {
      const recurring = [...d.recurring];
      recurring[idx] = updated;
      return { ...d, recurring, updatedAt: nowIso() };
    });
  }

  setRecurringActive(id: string, active: boolean) {
    this.editRecurring(id, { active });
  }

  deleteRecurring(id: string) {
    this.runUpdate(d => ({
      ...d,
      recurring: d.recurring.filter(r => r.id !== id),
      updatedAt: nowIso(),
    }));
  }

  // Debt operations
  createDebt(input: { name: string; kind: Debt['kind']; balance: number; annualRatePct: number; monthlyPayment: number; dueDay?: number; startDate?: string; active?: boolean; note?: string }) {
    const id = uid();
    const debt: Debt = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      balance: input.balance,
      annualRatePct: input.annualRatePct,
      monthlyPayment: input.monthlyPayment,
      dueDay: input.dueDay,
      startDate: input.startDate,
      active: input.active ?? true,
      note: input.note,
    };
    assertValidDebt(debt);
    this.runUpdate(d => ({
      ...d,
      debts: [...d.debts, debt],
      updatedAt: nowIso(),
    }));
    return id;
  }

  editDebt(id: string, patch: Partial<Debt>) {
    const data = this.snapshot;
    const idx = data.debts.findIndex(d => d.id === id);
    if (idx === -1) throw new Error(`Debt ${id} not found`);
    const debt = data.debts[idx];
    const merged = { ...debt, ...patch };
    if (patch.name) merged.name = patch.name.trim();
    assertValidDebt(merged);
    this.runUpdate(d => {
      const debts = [...d.debts];
      debts[idx] = merged;
      return { ...d, debts, updatedAt: nowIso() };
    });
  }

  setDebtActive(id: string, active: boolean) {
    this.editDebt(id, { active });
  }

  deleteDebt(id: string) {
    this.runUpdate(d => ({
      ...d,
      debts: d.debts.filter(debt => debt.id !== id),
      updatedAt: nowIso(),
    }));
  }

  // Goal operations
  createGoal(input: { name: string; targetAmount: number; method: Goal['method']; monthlyContribution: number; targetDate?: string; annualRatePct?: number; linkedAccountId?: string; manualSaved?: number; active?: boolean }) {
    const id = uid();
    const now = nowIso();
    let linkedAccountId = input.linkedAccountId;
    let manualSaved = input.manualSaved;
    if (linkedAccountId) {
      const data = this.snapshot;
      const acc = data.accounts.find(a => a.id === linkedAccountId);
      if (!acc) throw new Error(`Account ${linkedAccountId} not found`);
      if (acc.archived) throw new Error(`Account ${linkedAccountId} is archived`);
      manualSaved = undefined;
    }
    const goal: Goal = {
      id,
      name: input.name.trim(),
      targetAmount: input.targetAmount,
      method: input.method,
      monthlyContribution: input.monthlyContribution,
      targetDate: input.targetDate,
      annualRatePct: input.annualRatePct,
      linkedAccountId,
      manualSaved,
      active: input.active ?? true,
      createdAt: now,
    };
    assertValidGoal(goal);
    this.runUpdate(d => ({
      ...d,
      goals: [...d.goals, goal],
      updatedAt: now,
    }));
    return id;
  }

  editGoal(id: string, patch: Partial<Goal>) {
    const data = this.snapshot;
    const idx = data.goals.findIndex(g => g.id === id);
    if (idx === -1) throw new Error(`Goal ${id} not found`);
    const goal = data.goals[idx];
    // Clone to avoid mutation
    let merged = { ...goal };
    if (patch.name) merged.name = patch.name.trim();

    const hasLinked = Object.prototype.hasOwnProperty.call(patch, 'linkedAccountId');
    const hasManual = Object.prototype.hasOwnProperty.call(patch, 'manualSaved');

    // Apply patches for linked/manual with explicit presence
    if (hasLinked) {
      const targetId = patch.linkedAccountId;
      if (targetId) {
        const acc = data.accounts.find(a => a.id === targetId);
        if (!acc) throw new Error(`Account ${targetId} not found`);
        // Allow unchanged historical archived link when targetId equals current goal.linkedAccountId
        if (acc.archived && targetId !== goal.linkedAccountId) {
          throw new Error(`Account ${targetId} is archived`);
        }
      }
      merged.linkedAccountId = targetId || undefined;
    }
    if (hasManual) {
      merged.manualSaved = patch.manualSaved;
    }

    // Apply remaining patches (excluding linked/manual which already handled)
    const { linkedAccountId, manualSaved, ...rest } = patch;
    merged = { ...merged, ...rest };
    if (patch.name) merged.name = patch.name.trim();

    // Enforce mutual exclusion based on final requested source
    if (hasLinked && patch.linkedAccountId) {
      // non-empty linked explicitly selected -> clear manual
      merged.manualSaved = undefined;
    }
    if (hasManual && patch.manualSaved !== undefined) {
      // numeric manual explicitly selected -> clear linked
      merged.linkedAccountId = undefined;
    }
    // If both explicitly cleared (both present with undefined), both remain undefined

    // Method switch clearing
    if (patch.method) {
      if (patch.method === 'fixed') {
        merged.targetDate = undefined;
        merged.annualRatePct = undefined;
      } else if (patch.method === 'growth') {
        merged.targetDate = undefined;
      } else if (patch.method === 'target-date') {
        // targetDate required will be validated
      }
    }

    assertValidGoal(merged);
    this.runUpdate(d => {
      const goals = [...d.goals];
      goals[idx] = merged;
      return { ...d, goals, updatedAt: nowIso() };
    });
  }

  setGoalActive(id: string, active: boolean) {
    this.editGoal(id, { active });
  }

  deleteGoal(id: string) {
    this.runUpdate(d => ({
      ...d,
      goals: d.goals.filter(g => g.id !== id),
      updatedAt: nowIso(),
    }));
  }

  // Health config operations
  getHealthConfig(): HealthConfig {
    return this.snapshot.health;
  }

  updateHealthConfig(patch: Partial<HealthConfig>) {
    const data = this.snapshot;
    const merged = { ...data.health, ...patch };
    assertValidHealthConfig(merged);
    this.runUpdate(d => ({
      ...d,
      health: merged,
      updatedAt: nowIso(),
    }));
  }

  // Debt helpers
  getDebtSummary() {
    return summarizeDebts(this.snapshot.debts);
  }

  projectDebt(id: string, options?: { maxMonths?: number }) {
    const debt = this.snapshot.debts.find(d => d.id === id);
    if (!debt) throw new Error(`Debt ${id} not found`);
    return projectDebtPayoff(debt, options);
  }

  // Goal helpers
  projectGoal(id: string, asOfDate: string, availableMonthlySurplus: number) {
    const goal = this.snapshot.goals.find(g => g.id === id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    const balances = this.getAccountBalances(false);
    const ctx = { accountBalances: balances.balances };
    return projectGoal(goal, asOfDate, availableMonthlySurplus, ctx);
  }

  // Health evaluation
  evaluateHealth(input: { liquidFunds: number; monthlyIncome: number; monthlyExpenses: number; totalDebt: number; annualIncome: number }) {
    const config = this.getHealthConfig();
    return evaluateFinancialHealth(input, config);
  }

  // getEmergencyReserveTarget removed – Planner now delegates via evaluateHealth

  // Scenario evaluation
  evaluateScenario(input: { currentLiquidFunds: number; emergencyReserve: number; currentMonthlySurplus: number; upfrontCost: number; addedMonthlyCost: number; horizonMonths?: number }) {
    return evaluateAffordabilityScenario(input);
  }

  // Report helpers
  getMonthlyCategoryTotals(monthKey: string) {
    if (!isValidMonthKey(monthKey)) throw new Error('invalid month key');
    const snap = this.snapshot;
    const totals = new Map<string, { income: number; expense: number }>();
    for (const txn of snap.txns) {
      if (txn.archived) continue;
      if (txn.type === 'transfer') continue;
      const mk = txn.date.slice(0,7);
      if (mk !== monthKey) continue;
      const current = totals.get(txn.categoryId ?? 'uncategorized') ?? { income: 0, expense: 0 };
      if (txn.type === 'income') {
        current.income += txn.amount;
      } else {
        current.expense += txn.amount;
      }
      totals.set(txn.categoryId ?? 'uncategorized', current);
    }
    return totals;
  }
}
