// FOLIO domain entity types.
// All monetary values are INTEGER MINOR UNITS (e.g. paise for INR) — never floats.

export type AccountType = 'cash' | 'bank' | 'investment' | 'credit' | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /**
   * Signed as "money owned". Asset accounts start >= 0; liability accounts
   * (credit cards, loans) start negative (you owe).
   */
  openingBalance: number;
  archived: boolean;
  /** ISO datetime. */
  createdAt: string;
  /** ISO datetime (stamped on edit). */
  updatedAt?: string;
  /** Optional display color (hex). */
  color?: string;
}

export type TxnType = 'income' | 'expense' | 'transfer';

export interface Txn {
  id: string;
  type: TxnType;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** Positive integer minor units. */
  amount: number;
  /** Primary account; for transfers this is the SOURCE. */
  accountId: string;
  /** Transfer destination (required for transfers, must differ from accountId). */
  toAccountId?: string;
  /**
   * Required for income/expense (and must match the txn type);
   * must be absent for transfers.
   */
  categoryId?: string;
  note?: string;
  /** ISO datetime. */
  createdAt: string;
  updatedAt?: string;
  /** Soft-deleted: retained in the record, excluded from all ledger math. */
  archived?: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  color?: string;
}

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Recurring {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  /** Per-occurrence amount, positive minor units. */
  amount: number;
  frequency: RecurringFrequency;
  /** 1..28 — anchor day for monthly/quarterly/yearly. */
  dayOfMonth: number;
  /** 0..6 (0 = Sunday) — required for weekly. */
  dayOfWeek?: number;
  accountId?: string;
  categoryId?: string;
  /** 'YYYY-MM-DD'. */
  startDate: string;
  endDate?: string;
  active: boolean;
  note?: string;
}

export type DebtKind = 'emi' | 'credit-card' | 'personal' | 'other';

export interface Debt {
  id: string;
  name: string;
  kind: DebtKind;
  /** Outstanding, positive minor units. */
  balance: number;
  /** 0..100, e.g. 12.5 for 12.5% p.a. */
  annualRatePct: number;
  /** Positive minor units. */
  monthlyPayment: number;
  /** 1..28. */
  dueDay?: number;
  startDate?: string;
  active: boolean;
  note?: string;
}

export type GoalMethod = 'fixed' | 'target-date' | 'growth';

export interface Goal {
  id: string;
  name: string;
  /** Positive minor units. */
  targetAmount: number;
  method: GoalMethod;
  /** Monthly contribution for 'fixed' and 'growth' methods. */
  monthlyContribution: number;
  /** 'YYYY-MM-DD' — required for 'target-date'. */
  targetDate?: string;
  /** 0..100 annual return % — used by 'growth' (and optionally 'target-date'). */
  annualRatePct?: number;
  /** When set, "saved so far" = that account's live balance. */
  linkedAccountId?: string;
  /** Manual "saved so far" when no account is linked. */
  manualSaved?: number;
  active: boolean;
  /** ISO datetime. */
  createdAt: string;
}

export interface HealthConfig {
  /** Target months of expenses to hold as a liquid buffer, e.g. 6. */
  targetEmergencyMonths: number;
  /** Max acceptable debt / annual income, e.g. 4. */
  maxDebtToIncome: number;
  /** Target savings rate, e.g. 0.1 for 10%. */
  minSavingsRate: number;
}

export interface CurrencyConfig {
  code: string;
  symbol: string;
  /** Decimal places the currency uses (2 for INR, 0 for JPY). */
  minorDigits: number;
  /** Use 1,23,456 grouping (Indian style) instead of 123,456. */
  indianGrouping: boolean;
}

/**
 * One profile's entire financial record. Persisted as ONE encrypted blob in
 * IndexedDB, so every write is an atomic replacement of the whole record.
 */
export interface ProfileData {
  /** Optional encrypted presentation metadata; no accounting semantics. */
  identity?: { photo?: string };
  example?: { datasetVersion: number; anchorMonth: string };
  version: 1;
  currency: CurrencyConfig;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  recurring: Recurring[];
  debts: Debt[];
  goals: Goal[];
  health: HealthConfig;
  onboardingDone: boolean;
  createdAt: string;
  updatedAt: string;
}
