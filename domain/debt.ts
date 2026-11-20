// Debt domain engine
import { Debt } from './types';
import { isValidDate } from './dates';
import { addMinor, subMinor, scaleMinor, pctToFraction } from './money';

export class DebtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebtError';
  }
}

export interface DebtPaymentBreakdown {
  openingBalance: number;
  interestCharged: number;
  scheduledPayment: number;
  paymentApplied: number;
  principalReduction: number;
  uncoveredInterest: number;
  closingBalance: number;
  amortizes: boolean;
}

export interface DebtProjection {
  openingBalance: number;
  firstMonthInterest: number;
  firstMonthPrincipal: number;
  amortizes: boolean;
  monthsToPayoff: number | null;
  totalInterest: number | null;
  totalPaid: number | null;
  finalPayment: number | null;
  truncated: boolean;
}

export interface DebtPortfolioSummary {
  totalBalance: number;
  totalMonthlyPayment: number;
  activeCount: number;
  nonAmortizingCount: number;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}



export function assertValidDebt(debt: Debt): void {
  if (!isNonEmptyString(debt.id)) {
    throw new DebtError('debt: id must be a non-empty string');
  }
  if (!isNonEmptyString(debt.name)) {
    throw new DebtError(`debt "${debt.id}": name must be non-empty`);
  }
  const validKinds = new Set(['emi', 'credit-card', 'personal', 'other']);
  if (!validKinds.has(debt.kind)) {
    throw new DebtError(`debt "${debt.id}": kind must be emi|credit-card|personal|other`);
  }
  if (typeof debt.balance !== 'number' || !Number.isSafeInteger(debt.balance) || debt.balance <= 0) {
    throw new DebtError(`debt "${debt.id}": balance must be a positive safe integer in minor units`);
  }
  if (typeof debt.annualRatePct !== 'number' || !Number.isFinite(debt.annualRatePct)) {
    throw new DebtError(`debt "${debt.id}": annualRatePct must be a finite number`);
  }
  if (debt.annualRatePct < 0 || debt.annualRatePct > 100) {
    throw new DebtError(`debt "${debt.id}": annualRatePct must be 0..100`);
  }
  try {
    pctToFraction(debt.annualRatePct);
  } catch {
    throw new DebtError(`debt "${debt.id}": annualRatePct must be exactly representable`);
  }
  if (typeof debt.monthlyPayment !== 'number' || !Number.isSafeInteger(debt.monthlyPayment) || debt.monthlyPayment <= 0) {
    throw new DebtError(`debt "${debt.id}": monthlyPayment must be a positive safe integer in minor units`);
  }
  if (debt.dueDay !== undefined) {
    if (typeof debt.dueDay !== 'number' || !Number.isSafeInteger(debt.dueDay) || debt.dueDay < 1 || debt.dueDay > 28) {
      throw new DebtError(`debt "${debt.id}": dueDay must be 1..28`);
    }
  }
  if (debt.startDate !== undefined) {
    if (!isValidDate(debt.startDate)) {
      throw new DebtError(`debt "${debt.id}": startDate must be valid YYYY-MM-DD`);
    }
  }
  if (typeof debt.active !== 'boolean') {
    throw new DebtError(`debt "${debt.id}": active must be boolean`);
  }
}

export function monthlyDebtInterest(balance: number, annualRatePct: number): number {
  if (typeof balance !== 'number' || !Number.isSafeInteger(balance) || balance <= 0) {
    throw new DebtError('monthlyDebtInterest: balance must be a positive safe integer');
  }
  if (typeof annualRatePct !== 'number' || !Number.isFinite(annualRatePct)) {
    throw new DebtError('monthlyDebtInterest: annualRatePct must be a finite number');
  }
  if (annualRatePct < 0 || annualRatePct > 100) {
    throw new DebtError('monthlyDebtInterest: annualRatePct must be 0..100');
  }
  const { num, den } = pctToFraction(annualRatePct);
  // monthly rate = num / (den * 100 * 12)
  const monthlyInterest = scaleMinor(balance, num, den * 100 * 12);
  return monthlyInterest;
}

function monthStep(balance: number, annualRatePct: number, monthlyPayment: number) {
  const interest = monthlyDebtInterest(balance, annualRatePct);
  const amountDue = addMinor(balance, interest);
  const paymentApplied = amountDue < monthlyPayment ? amountDue : monthlyPayment;
  const closingBalance = subMinor(amountDue, paymentApplied);
  const principalReduction = paymentApplied > interest ? subMinor(paymentApplied, interest) : 0;
  const uncoveredInterest = interest > paymentApplied ? subMinor(interest, paymentApplied) : 0;
  const amortizes = closingBalance < balance;
  return { interest, paymentApplied, closingBalance, principalReduction, uncoveredInterest, amortizes };
}

export function nextDebtPayment(debt: Debt): DebtPaymentBreakdown {
  assertValidDebt(debt);
  const openingBalance = debt.balance;
  const { interest, paymentApplied, closingBalance, principalReduction, uncoveredInterest, amortizes } = monthStep(openingBalance, debt.annualRatePct, debt.monthlyPayment);
  const scheduledPayment = debt.monthlyPayment;
  return {
    openingBalance,
    interestCharged: interest,
    scheduledPayment,
    paymentApplied,
    principalReduction,
    uncoveredInterest,
    closingBalance,
    amortizes,
  };
}

export function projectDebtPayoff(debt: Debt, options?: { maxMonths?: number }): DebtProjection {
  assertValidDebt(debt);
  let maxMonths = 1200;
  if (options?.maxMonths !== undefined) {
    const m = options.maxMonths;
    if (typeof m !== 'number' || !Number.isSafeInteger(m) || m <= 0) {
      throw new DebtError('projectDebtPayoff: maxMonths must be a positive safe integer');
    }
    maxMonths = m;
  }
  const openingBalance = debt.balance;
  const firstStep = monthStep(openingBalance, debt.annualRatePct, debt.monthlyPayment);
  const firstMonthInterest = firstStep.interest;
  const firstMonthPrincipal = firstStep.principalReduction;
  const amortizes = firstStep.amortizes;

  if (!amortizes) {
    return {
      openingBalance,
      firstMonthInterest,
      firstMonthPrincipal,
      amortizes: false,
      monthsToPayoff: null,
      totalInterest: null,
      totalPaid: null,
      finalPayment: null,
      truncated: false,
    };
  }

  let balance = openingBalance;
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;
  let finalPayment: number | null = null;

  while (balance > 0 && months < maxMonths) {
    const step = monthStep(balance, debt.annualRatePct, debt.monthlyPayment);
    months += 1;
    totalInterest = addMinor(totalInterest, step.interest);
    totalPaid = addMinor(totalPaid, step.paymentApplied);
    balance = step.closingBalance;
    if (balance === 0) {
      finalPayment = step.paymentApplied;
      break;
    }
  }

  if (balance > 0) {
    return {
      openingBalance,
      firstMonthInterest,
      firstMonthPrincipal,
      amortizes: true,
      monthsToPayoff: null,
      totalInterest: null,
      totalPaid: null,
      finalPayment: null,
      truncated: true,
    };
  }

  return {
    openingBalance,
    firstMonthInterest,
    firstMonthPrincipal,
    amortizes: true,
    monthsToPayoff: months,
    totalInterest,
    totalPaid,
    finalPayment,
    truncated: false,
  };
}

export function summarizeDebts(debts: readonly Debt[]): DebtPortfolioSummary {
  let totalBalance = 0;
  let totalMonthlyPayment = 0;
  let activeCount = 0;
  let nonAmortizingCount = 0;

  for (const d of debts) {
    assertValidDebt(d);
    if (!d.active) continue;
    activeCount += 1;
    totalBalance = addMinor(totalBalance, d.balance);
    totalMonthlyPayment = addMinor(totalMonthlyPayment, d.monthlyPayment);
    const breakdown = nextDebtPayment(d);
    if (!breakdown.amortizes) {
      nonAmortizingCount += 1;
    }
  }

  return { totalBalance, totalMonthlyPayment, activeCount, nonAmortizingCount };
}
