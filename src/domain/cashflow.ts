// Module 4: Cash Flow
import { Txn, Recurring } from './types';
import { isValidMonthKey, isValidDate } from './dates';
import { addMinor, subMinor } from './money';
import { summarizeRecurringMonth } from './recurring';

export class CashFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CashFlowError';
  }
}

export interface TransactionCashFlowSummary {
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
}

export interface CommitmentCashFlowSummary {
  income: number;
  expense: number;
  net: number;
  occurrenceCount: number;
}

export interface MonthlyCashFlowSummary {
  monthKey: string;
  actual: TransactionCashFlowSummary;
  committed: CommitmentCashFlowSummary;
}

function isPositiveMinor(v: number): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function validateTxnForCashFlow(txn: Txn, monthKey: string): boolean {
  // Structural checks for rows that could affect cash flow
  if (!isNonEmptyString(txn.id)) {
    throw new CashFlowError(`txn "${String(txn.id)}": id must be non-empty`);
  }
  if (txn.type !== 'income' && txn.type !== 'expense' && txn.type !== 'transfer') {
    throw new CashFlowError(`txn "${txn.id}": type must be income|expense|transfer`);
  }
  if (!isValidDate(txn.date)) {
    throw new CashFlowError(`txn "${txn.id}": date must be valid YYYY-MM-DD`);
  }
  // If date is outside requested month, we can skip further checks after date validation
  const txnMonth = txn.date.slice(0, 7);
  if (txnMonth !== monthKey) return false;

  if (txn.archived === true) return false;

  if (!isPositiveMinor(txn.amount)) {
    throw new CashFlowError(`txn "${txn.id}": amount must be a positive integer in minor units`);
  }

  if (txn.type === 'transfer') {
    if (!isNonEmptyString(txn.accountId)) {
      throw new CashFlowError(`txn "${txn.id}": transfer requires accountId`);
    }
    if (!isNonEmptyString(txn.toAccountId)) {
      throw new CashFlowError(`txn "${txn.id}": transfer requires toAccountId`);
    }
    if (txn.accountId === txn.toAccountId) {
      throw new CashFlowError(`txn "${txn.id}": transfer source and destination must differ`);
    }
    if (txn.categoryId !== undefined) {
      throw new CashFlowError(`txn "${txn.id}": transfers are not classified (remove categoryId)`);
    }
    // transfers contribute nothing to cash flow
    return false;
  }

  // income/expense: no account/category lookup required for cash flow totals
  return true;
}

export function summarizeTransactionsMonth(txns: readonly Txn[], monthKey: string): TransactionCashFlowSummary {
  if (!isValidMonthKey(monthKey)) {
    throw new CashFlowError('invalid month key');
  }
  let income = 0;
  let expense = 0;
  let transactionCount = 0;

  for (const txn of txns) {
    const include = validateTxnForCashFlow(txn, monthKey);
    if (!include) continue;
    if (txn.type === 'income') {
      income = addMinor(income, txn.amount);
    } else if (txn.type === 'expense') {
      expense = addMinor(expense, txn.amount);
    }
    transactionCount += 1;
  }

  const net = subMinor(income, expense);
  return { income, expense, net, transactionCount };
}

export function summarizeCommitmentsMonth(recurring: readonly Recurring[], monthKey: string): CommitmentCashFlowSummary {
  if (!isValidMonthKey(monthKey)) {
    throw new CashFlowError('invalid month key');
  }
  const res = summarizeRecurringMonth(recurring, monthKey);
  return {
    income: res.income,
    expense: res.expense,
    net: res.net,
    occurrenceCount: res.occurrenceCount,
  };
}

export function summarizeMonthlyCashFlow(
  txns: readonly Txn[],
  recurring: readonly Recurring[],
  monthKey: string
): MonthlyCashFlowSummary {
  if (!isValidMonthKey(monthKey)) {
    throw new CashFlowError('invalid month key');
  }
  const actual = summarizeTransactionsMonth(txns, monthKey);
  const committed = summarizeCommitmentsMonth(recurring, monthKey);
  return { monthKey, actual, committed };
}
