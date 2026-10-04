// Goal domain engine
import { Goal } from './types';
import { isValidDate, monthKeyOf, addMonths, monthsBetween } from './dates';
import { addMinor, subMinor, scaleMinor, pctToFraction } from './money';

export class GoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoalError';
  }
}

export interface GoalContext {
  accountBalances: ReadonlyMap<string, number>;
}

export interface GoalProjection {
  savedSoFar: number;
  remaining: number;
  complete: boolean;
  requiredMonthlyContribution: number | null;
  availableMonthlySurplus: number;
  feasible: boolean;
  monthsToTarget: number | null;
  projectedTargetMonth: string | null;
  deadlinePassed: boolean;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isSafeIntegerNonNegative(n: number): boolean {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function isValidIsoUtcDatetime(s: string): boolean {
  if (typeof s !== 'string') return false;
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(s);
  if (!iso) return false;
  const datePart = `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (!isValidDate(datePart)) return false;
  const hour = Number(iso[4]);
  const minute = Number(iso[5]);
  const second = Number(iso[6]);
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;
  return true;
}

export function assertValidGoal(goal: Goal, ctx?: GoalContext): void {
  if (!isNonEmptyString(goal.id)) {
    throw new GoalError('goal: id must be a non-empty string');
  }
  if (!isNonEmptyString(goal.name)) {
    throw new GoalError(`goal "${goal.id}": name must be non-empty`);
  }
  if (typeof goal.targetAmount !== 'number' || !Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0) {
    throw new GoalError(`goal "${goal.id}": targetAmount must be positive safe integer`);
  }
  const validMethods = new Set(['fixed', 'target-date', 'growth']);
  if (!validMethods.has(goal.method)) {
    throw new GoalError(`goal "${goal.id}": method must be fixed|target-date|growth`);
  }
  if (typeof goal.monthlyContribution !== 'number' || !Number.isSafeInteger(goal.monthlyContribution)) {
    throw new GoalError(`goal "${goal.id}": monthlyContribution must be a safe integer`);
  }
  if (goal.method === 'fixed') {
    if (goal.monthlyContribution <= 0) {
      throw new GoalError(`goal "${goal.id}": fixed method requires monthlyContribution > 0`);
    }
    if (goal.targetDate !== undefined) {
      throw new GoalError(`goal "${goal.id}": fixed method must not have targetDate`);
    }
    if (goal.annualRatePct !== undefined) {
      throw new GoalError(`goal "${goal.id}": fixed method must not have annualRatePct`);
    }
  }
  if (goal.method === 'growth') {
    if (goal.monthlyContribution <= 0) {
      throw new GoalError(`goal "${goal.id}": growth method requires monthlyContribution > 0`);
    }
    if (goal.annualRatePct === undefined) {
      throw new GoalError(`goal "${goal.id}": growth method requires annualRatePct`);
    }
    if (typeof goal.annualRatePct !== 'number' || !Number.isFinite(goal.annualRatePct) || goal.annualRatePct < 0 || goal.annualRatePct > 100) {
      throw new GoalError(`goal "${goal.id}": annualRatePct must be 0..100`);
    }
    try {
      pctToFraction(goal.annualRatePct);
    } catch {
      throw new GoalError(`goal "${goal.id}": annualRatePct must be exactly representable`);
    }
    if (goal.targetDate !== undefined) {
      throw new GoalError(`goal "${goal.id}": growth method must not have targetDate`);
    }
  }
  if (goal.method === 'target-date') {
    if (!goal.targetDate || !isValidDate(goal.targetDate)) {
      throw new GoalError(`goal "${goal.id}": target-date method requires valid targetDate`);
    }
    if (goal.monthlyContribution < 0) {
      throw new GoalError(`goal "${goal.id}": monthlyContribution must be non-negative`);
    }
    if (goal.annualRatePct !== undefined) {
      if (typeof goal.annualRatePct !== 'number' || !Number.isFinite(goal.annualRatePct) || goal.annualRatePct < 0 || goal.annualRatePct > 100) {
        throw new GoalError(`goal "${goal.id}": annualRatePct must be 0..100`);
      }
      try {
        pctToFraction(goal.annualRatePct);
      } catch {
        throw new GoalError(`goal "${goal.id}": annualRatePct must be exactly representable`);
      }
    }
  }
  if (goal.linkedAccountId !== undefined) {
    if (!isNonEmptyString(goal.linkedAccountId)) {
      throw new GoalError(`goal "${goal.id}": linkedAccountId must be non-empty if present`);
    }
    if (ctx) {
      if (!ctx.accountBalances.has(goal.linkedAccountId)) {
        throw new GoalError(`goal "${goal.id}": linkedAccountId "${goal.linkedAccountId}" not found in context`);
      }
    }
  }
  if (goal.manualSaved !== undefined) {
    if (!isSafeIntegerNonNegative(goal.manualSaved)) {
      throw new GoalError(`goal "${goal.id}": manualSaved must be non-negative safe integer`);
    }
  }
  if (goal.linkedAccountId !== undefined && goal.manualSaved !== undefined) {
    throw new GoalError(`goal "${goal.id}": linkedAccountId and manualSaved are mutually exclusive`);
  }
  if (typeof goal.active !== 'boolean') {
    throw new GoalError(`goal "${goal.id}": active must be boolean`);
  }
  if (!isValidIsoUtcDatetime(goal.createdAt)) {
    throw new GoalError(`goal "${goal.id}": createdAt must be valid ISO UTC datetime ending with Z`);
  }
}

export function goalSavedSoFar(goal: Goal, ctx?: GoalContext): number {
  assertValidGoal(goal, ctx);
  if (goal.linkedAccountId) {
    if (!ctx) {
      throw new GoalError(`goal "${goal.id}": linkedAccountId requires GoalContext`);
    }
    const bal = ctx.accountBalances.get(goal.linkedAccountId);
    if (bal === undefined) {
      throw new GoalError(`goal "${goal.id}": linkedAccountId "${goal.linkedAccountId}" not found`);
    }
    if (!Number.isSafeInteger(bal)) {
      throw new GoalError(`goal "${goal.id}": account balance must be safe integer`);
    }
    return bal;
  }
  return goal.manualSaved ?? 0;
}

export function remainingGoalAmount(goal: Goal, ctx?: GoalContext): number {
  const saved = goalSavedSoFar(goal, ctx);
  const remaining = subMinor(goal.targetAmount, saved);
  return remaining < 0 ? 0 : remaining;
}

function ceilDiv(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || a < 0) throw new RangeError('ceilDiv: a must be a non-negative safe integer');
  if (!Number.isSafeInteger(b) || b <= 0) throw new RangeError('ceilDiv: b must be a positive safe integer');
  if (a === 0) return 0;
  return Math.floor((a - 1) / b) + 1;
}

function monthSimulation(balance: number, annualRatePct: number | undefined, monthlyContribution: number, months: number): number {
  let bal = balance;
  const { num, den } = annualRatePct !== undefined ? pctToFraction(annualRatePct) : { num: 0, den: 1 };
  const monthlyRateNum = num;
  const monthlyRateDen = den * 100 * 12;
  for (let i = 0; i < months; i++) {
    const growth = scaleMinor(bal, monthlyRateNum, monthlyRateDen);
    bal = addMinor(bal, growth);
    bal = addMinor(bal, monthlyContribution);
    if (bal >= Number.MAX_SAFE_INTEGER) {
      // Early exit to avoid further overflow; the caller already knows it exceeds target
      return Number.MAX_SAFE_INTEGER;
    }
  }
  return bal;
}

function findMinimalContributionToReachTarget(savedSoFar: number, targetAmount: number, annualRatePct: number | undefined, months: number): number {
  if (months <= 0) {
    throw new GoalError('months must be >0 for target-date simulation');
  }
  // initial lower bound
  let low = 0;
  // start from a safe, target-aware candidate
  const remaining = targetAmount - savedSoFar;
  const noGrowthNeeded = remaining > 0 ? ceilDiv(remaining, months) : 0;
  let high = Math.max(1, noGrowthNeeded);
  // Ensure high is safe
  if (high < 1) high = 1;
  // Find an upper bound safely
  while (true) {
    const finalBal = monthSimulation(savedSoFar, annualRatePct, high, months);
    if (finalBal >= targetAmount) break;
    if (high >= Number.MAX_SAFE_INTEGER) {
      // final attempt with max safe
      const finalCheck = monthSimulation(savedSoFar, annualRatePct, Number.MAX_SAFE_INTEGER, months);
      if (finalCheck >= targetAmount) break;
      throw new RangeError('required contribution exceeds safe integer range');
    }
    // double safely without overflow
    if (high > Number.MAX_SAFE_INTEGER / 2) {
      high = Number.MAX_SAFE_INTEGER;
    } else {
      high *= 2;
    }
  }
  // Binary search with overflow-safe midpoint
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    const finalBal = monthSimulation(savedSoFar, annualRatePct, mid, months);
    if (finalBal >= targetAmount) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

export function projectGoal(
  goal: Goal,
  asOfDate: string,
  availableMonthlySurplus: number,
  ctx?: GoalContext,
  options?: { maxMonths?: number }
): GoalProjection {
  if (!isValidDate(asOfDate)) {
    throw new GoalError('asOfDate must be valid YYYY-MM-DD');
  }
  if (typeof availableMonthlySurplus !== 'number' || !Number.isSafeInteger(availableMonthlySurplus)) {
    throw new GoalError('availableMonthlySurplus must be a safe integer');
  }
  assertValidGoal(goal, ctx);

  const savedSoFar = goalSavedSoFar(goal, ctx);
  const remainingRaw = subMinor(goal.targetAmount, savedSoFar);
  const remaining = remainingRaw < 0 ? 0 : remainingRaw;
  const asOfMonthKey = monthKeyOf(asOfDate);
  const deadlinePassed = goal.method === 'target-date' && goal.targetDate! < asOfDate && remaining > 0;

  if (remaining === 0) {
    return {
      savedSoFar,
      remaining: 0,
      complete: true,
      requiredMonthlyContribution: 0,
      availableMonthlySurplus,
      feasible: true,
      monthsToTarget: 0,
      projectedTargetMonth: asOfMonthKey,
      deadlinePassed: deadlinePassed || false,
    };
  }

  if (goal.method === 'fixed') {
    const monthlyContribution = goal.monthlyContribution;
    const monthsToTarget = ceilDiv(remaining, monthlyContribution);
    const projectedTargetMonth = addMonths(asOfMonthKey, monthsToTarget - 1);
    const feasible = monthlyContribution <= availableMonthlySurplus;
    return {
      savedSoFar,
      remaining,
      complete: false,
      requiredMonthlyContribution: monthlyContribution,
      availableMonthlySurplus,
      feasible,
      monthsToTarget,
      projectedTargetMonth,
      deadlinePassed: false,
    };
  }

  if (goal.method === 'growth') {
    const monthlyContribution = goal.monthlyContribution;
    const annualRatePct = goal.annualRatePct!;
    let maxMonths = 1200;
    if (options?.maxMonths !== undefined) {
      const m = options.maxMonths;
      if (typeof m !== 'number' || !Number.isSafeInteger(m) || m <= 0) {
        throw new GoalError('projectGoal: maxMonths must be positive safe integer');
      }
      maxMonths = m;
    }
    let balance = savedSoFar;
    const { num, den } = pctToFraction(annualRatePct);
    const monthlyRateNum = num;
    const monthlyRateDen = den * 100 * 12;
    let months = 0;
    let reached = false;
    while (months < maxMonths) {
      months += 1;
      const growth = scaleMinor(balance, monthlyRateNum, monthlyRateDen);
      balance = addMinor(balance, growth);
      balance = addMinor(balance, monthlyContribution);
      if (balance >= goal.targetAmount) {
        reached = true;
        break;
      }
    }
    const monthsToTarget = reached ? months : null;
    const projectedTargetMonth = reached ? addMonths(asOfMonthKey, months - 1) : null;
    const feasible = monthlyContribution <= availableMonthlySurplus;
    return {
      savedSoFar,
      remaining,
      complete: false,
      requiredMonthlyContribution: monthlyContribution,
      availableMonthlySurplus,
      feasible,
      monthsToTarget,
      projectedTargetMonth,
      deadlinePassed: false,
    };
  }

  // target-date method
  const targetDate = goal.targetDate!;
  if (targetDate < asOfDate && remaining > 0) {
    return {
      savedSoFar,
      remaining,
      complete: false,
      requiredMonthlyContribution: null,
      availableMonthlySurplus,
      feasible: false,
      monthsToTarget: null,
      projectedTargetMonth: null,
      deadlinePassed: true,
    };
  }
  const monthsAvailable = monthsBetween(asOfMonthKey, monthKeyOf(targetDate)) + 1;
  let requiredMonthlyContribution: number;
  if (goal.annualRatePct === undefined || goal.annualRatePct === 0) {
    requiredMonthlyContribution = ceilDiv(remaining, monthsAvailable);
  } else {
    requiredMonthlyContribution = findMinimalContributionToReachTarget(savedSoFar, goal.targetAmount, goal.annualRatePct, monthsAvailable);
  }
  const feasible = requiredMonthlyContribution <= availableMonthlySurplus;
  return {
    savedSoFar,
    remaining,
    complete: false,
    requiredMonthlyContribution,
    availableMonthlySurplus,
    feasible,
    monthsToTarget: monthsAvailable,
    projectedTargetMonth: monthKeyOf(targetDate),
    deadlinePassed: false,
  };
}
