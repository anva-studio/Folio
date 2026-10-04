import { subMinor, addMinor, mulMinor } from './money';

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

export interface AffordabilityScenarioInput {
  currentLiquidFunds: number;
  emergencyReserve: number;
  currentMonthlySurplus: number;
  upfrontCost: number;
  addedMonthlyCost: number;
  horizonMonths?: number;
}

export interface AffordabilityScenarioResult {
  postPurchaseLiquidFunds: number;
  reserveShortfall: number;
  postScenarioMonthlySurplus: number;
  upfrontAffordable: boolean;
  reserveProtected: boolean;
  monthlyAffordable: boolean;
  affordable: boolean;
  monthsToRecoverReserve: number | null;
  horizonMonths: number;
  totalAddedCostOverHorizon: number;
}

function isSafeIntegerNonNegative(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function isSafeIntegerSigned(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

export function assertValidScenarioInput(input: AffordabilityScenarioInput): void {
  if (!isSafeIntegerNonNegative(input.currentLiquidFunds)) {
    throw new ScenarioError('currentLiquidFunds must be a non-negative safe integer');
  }
  if (!isSafeIntegerNonNegative(input.emergencyReserve)) {
    throw new ScenarioError('emergencyReserve must be a non-negative safe integer');
  }
  if (!isSafeIntegerSigned(input.currentMonthlySurplus)) {
    throw new ScenarioError('currentMonthlySurplus must be a signed safe integer');
  }
  if (!isSafeIntegerNonNegative(input.upfrontCost)) {
    throw new ScenarioError('upfrontCost must be a non-negative safe integer');
  }
  if (!isSafeIntegerNonNegative(input.addedMonthlyCost)) {
    throw new ScenarioError('addedMonthlyCost must be a non-negative safe integer');
  }
  if (input.horizonMonths !== undefined) {
    if (!isSafeIntegerNonNegative(input.horizonMonths) || input.horizonMonths === 0) {
      throw new ScenarioError('horizonMonths must be a positive safe integer');
    }
  }
}

function ceilDiv(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || a < 0) throw new RangeError('ceilDiv: a must be a non-negative safe integer');
  if (!Number.isSafeInteger(b) || b <= 0) throw new RangeError('ceilDiv: b must be a positive safe integer');
  if (a === 0) return 0;
  return Math.floor((a - 1) / b) + 1;
}

export function evaluateAffordabilityScenario(input: AffordabilityScenarioInput): AffordabilityScenarioResult {
  assertValidScenarioInput(input);
  const horizonMonths = input.horizonMonths ?? 12;

  const postPurchaseLiquidFunds = subMinor(input.currentLiquidFunds, input.upfrontCost);
  const upfrontAffordable = input.currentLiquidFunds >= input.upfrontCost;
  const reserveProtected = postPurchaseLiquidFunds >= input.emergencyReserve;

  const reserveShortfall = postPurchaseLiquidFunds >= input.emergencyReserve ? 0 : subMinor(input.emergencyReserve, postPurchaseLiquidFunds);

  const postScenarioMonthlySurplus = subMinor(input.currentMonthlySurplus, input.addedMonthlyCost);
  const monthlyAffordable = postScenarioMonthlySurplus >= 0;

  const affordable = upfrontAffordable && reserveProtected && monthlyAffordable;

  let monthsToRecoverReserve: number | null = null;
  if (reserveShortfall === 0) {
    monthsToRecoverReserve = 0;
  } else if (postScenarioMonthlySurplus <= 0) {
    monthsToRecoverReserve = null;
  } else {
    monthsToRecoverReserve = ceilDiv(reserveShortfall, postScenarioMonthlySurplus);
  }

  const totalAddedCostOverHorizon = addMinor(input.upfrontCost, mulMinor(input.addedMonthlyCost, horizonMonths));

  return {
    postPurchaseLiquidFunds,
    reserveShortfall,
    postScenarioMonthlySurplus,
    upfrontAffordable,
    reserveProtected,
    monthlyAffordable,
    affordable,
    monthsToRecoverReserve,
    horizonMonths,
    totalAddedCostOverHorizon,
  };
}
