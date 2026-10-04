import { formatMinor, INR } from '../domain/money';
import type { Goal, ProfileData } from '../domain/types';
import { projectGoal } from '../domain/goal';
export const money = (value: number) => formatMinor(value, { symbol: INR.symbol, minorDigits: INR.minorDigits, indianGrouping: INR.indianGrouping });
export const monthLabel = (value: string) => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
export const dateLabel = (value: string) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
export const goalMethod = (method: Goal['method']) => ({ fixed: 'Fixed monthly contribution', 'target-date': 'Target date', growth: 'Assumed growth' })[method];
export function combinedGoalDemand(data: ProfileData, balances: ReadonlyMap<string, number>, asOf: string) {
  let total = 0;
  const unavailable: string[] = [];
  for (const goal of data.goals.filter(goal => goal.active)) {
    const projection = projectGoal(goal, asOf, 0, { accountBalances: balances });
    const contribution = projection.requiredMonthlyContribution;
    if (contribution === null || !Number.isSafeInteger(total + contribution)) unavailable.push(goal.name);
    else total += contribution;
  }
  return { total, unavailable };
}
