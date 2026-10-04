import { HealthConfig } from './types';
import { scaleMinor, subMinor, pctToFraction } from './money';

export class HealthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HealthError';
  }
}

export interface HealthInput {
  liquidFunds: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  totalDebt: number;
  annualIncome: number;
}

export interface EmergencyFundHealth {
  targetAmount: number;
  shortfall: number;
  monthsCovered: number | null;
  targetMonths: number;
  meetsTarget: boolean;
}

export interface DebtToIncomeHealth {
  ratio: number | null;
  maximumRatio: number;
  meetsTarget: boolean;
}

export interface SavingsHealth {
  monthlySavings: number;
  rate: number | null;
  targetRate: number;
  meetsTarget: boolean | null;
}

export interface FinancialHealthReport {
  emergencyFund: EmergencyFundHealth;
  debtToIncome: DebtToIncomeHealth;
  savings: SavingsHealth;
  targetsEvaluated: number;
  targetsMet: number;
}

function isSafeIntegerNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function assertValidMoney(v: number, label: string): void {
  if (!isSafeIntegerNonNegative(v)) {
    throw new HealthError(`${label} must be a non-negative safe integer minor unit`);
  }
}

export function assertValidHealthConfig(config: HealthConfig): void {
  if (typeof config.targetEmergencyMonths !== 'number' || !Number.isFinite(config.targetEmergencyMonths)) {
    throw new HealthError('targetEmergencyMonths must be a finite number');
  }
  if (config.targetEmergencyMonths < 0) {
    throw new HealthError('targetEmergencyMonths must be >= 0');
  }
  // Reject scientific notation / non-exact decimal via pctToFraction
  try {
    pctToFraction(config.targetEmergencyMonths);
  } catch {
    throw new HealthError('targetEmergencyMonths must be an exactly representable decimal');
  }

  if (typeof config.maxDebtToIncome !== 'number' || !Number.isFinite(config.maxDebtToIncome)) {
    throw new HealthError('maxDebtToIncome must be a finite number');
  }
  if (config.maxDebtToIncome < 0) {
    throw new HealthError('maxDebtToIncome must be >= 0');
  }

  if (typeof config.minSavingsRate !== 'number' || !Number.isFinite(config.minSavingsRate)) {
    throw new HealthError('minSavingsRate must be a finite number');
  }
  if (config.minSavingsRate < 0 || config.minSavingsRate > 1) {
    throw new HealthError('minSavingsRate must be between 0 and 1 inclusive');
  }
}

export function assertValidHealthInput(input: HealthInput): void {
  assertValidMoney(input.liquidFunds, 'liquidFunds');
  assertValidMoney(input.monthlyIncome, 'monthlyIncome');
  assertValidMoney(input.monthlyExpenses, 'monthlyExpenses');
  assertValidMoney(input.totalDebt, 'totalDebt');
  assertValidMoney(input.annualIncome, 'annualIncome');
}

function calcEmergencyFund(input: HealthInput, config: HealthConfig): EmergencyFundHealth {
  const { num, den } = pctToFraction(config.targetEmergencyMonths);
  const targetAmount = scaleMinor(input.monthlyExpenses, num, den);
  let shortfall = 0;
  if (targetAmount > input.liquidFunds) {
    shortfall = subMinor(targetAmount, input.liquidFunds);
  }
  const monthsCovered = input.monthlyExpenses > 0 ? input.liquidFunds / input.monthlyExpenses : null;
  const meetsTarget = input.liquidFunds >= targetAmount;
  return {
    targetAmount,
    shortfall,
    monthsCovered,
    targetMonths: config.targetEmergencyMonths,
    meetsTarget,
  };
}

function calcDebtToIncome(input: HealthInput, config: HealthConfig): DebtToIncomeHealth {
  const annualIncome = input.annualIncome;
  const totalDebt = input.totalDebt;
  let ratio: number | null = null;
  let meetsTarget = false;

  if (annualIncome === 0 && totalDebt === 0) {
    ratio = 0;
    meetsTarget = true;
  } else if (annualIncome === 0) {
    ratio = null;
    meetsTarget = false;
  } else {
    ratio = totalDebt / annualIncome;
    meetsTarget = ratio <= config.maxDebtToIncome;
  }

  return {
    ratio,
    maximumRatio: config.maxDebtToIncome,
    meetsTarget,
  };
}

function calcSavings(input: HealthInput, config: HealthConfig): SavingsHealth {
  const monthlySavings = subMinor(input.monthlyIncome, input.monthlyExpenses);
  let rate: number | null = null;
  let meetsTarget: boolean | null = null;

  if (input.monthlyIncome > 0) {
    rate = monthlySavings / input.monthlyIncome;
    meetsTarget = rate >= config.minSavingsRate;
  }

  return {
    monthlySavings,
    rate,
    targetRate: config.minSavingsRate,
    meetsTarget,
  };
}

export function evaluateFinancialHealth(input: HealthInput, config: HealthConfig): FinancialHealthReport {
  assertValidHealthConfig(config);
  assertValidHealthInput(input);

  const emergencyFund = calcEmergencyFund(input, config);
  const debtToIncome = calcDebtToIncome(input, config);
  const savings = calcSavings(input, config);

  let targetsEvaluated = 2; // emergency + debt always
  let targetsMet = 0;
  if (emergencyFund.meetsTarget) targetsMet++;
  if (debtToIncome.meetsTarget) targetsMet++;

  if (savings.meetsTarget !== null) {
    targetsEvaluated += 1;
    if (savings.meetsTarget) targetsMet++;
  }

  return {
    emergencyFund,
    debtToIncome,
    savings,
    targetsEvaluated,
    targetsMet,
  };
}
