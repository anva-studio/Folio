import { describe, it, expect } from 'vitest';
import {
  GoalError,
  assertValidGoal,
  goalSavedSoFar,
  remainingGoalAmount,
  projectGoal,
} from '../../src/domain/goal';
import type { Goal } from '../../src/domain/types';

function makeGoal(over: Partial<Goal> & { id: string; name: string }): Goal {
  return {
    id: over.id,
    name: over.name,
    targetAmount: over.targetAmount ?? 100000,
    method: over.method ?? 'fixed',
    monthlyContribution: over.monthlyContribution ?? 5000,
    targetDate: over.targetDate,
    annualRatePct: over.annualRatePct,
    linkedAccountId: over.linkedAccountId,
    manualSaved: over.manualSaved,
    active: over.active ?? true,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
  };
}

describe('assertValidGoal validation', () => {
  it('valid fixed', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g1', name: 'Vacation', method: 'fixed' }))).not.toThrow();
  });
  it('valid target-date', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g1', name: 'House', method: 'target-date', targetDate: '2027-12-31' }))).not.toThrow();
  });
  it('valid growth', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g1', name: 'Retire', method: 'growth', annualRatePct: 7 }))).not.toThrow();
  });
  it('rejects empty id', () => {
    expect(() => assertValidGoal(makeGoal({ id: '', name: 'x' } as any))).toThrow(GoalError);
  });
  it('rejects empty name', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: '' }))).toThrow(GoalError);
  });
  it('rejects zero target', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', targetAmount: 0 }))).toThrow(GoalError);
  });
  it('rejects negative target', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', targetAmount: -1 }))).toThrow(GoalError);
  });
  it('rejects non-integer target', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', targetAmount: 1.5 as any }))).toThrow(GoalError);
  });
  it('rejects invalid method', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'unknown' as any }))).toThrow(GoalError);
  });
  it('fixed zero contribution rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'fixed', monthlyContribution: 0 }))).toThrow(GoalError);
  });
  it('growth zero contribution rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'growth', monthlyContribution: 0, annualRatePct: 5 }))).toThrow(GoalError);
  });
  it('target-date permits zero contribution field', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'target-date', targetDate: '2027-01-01', monthlyContribution: 0 }))).not.toThrow();
  });
  it('fixed carrying targetDate rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'fixed', targetDate: '2027-01-01' }))).toThrow(GoalError);
  });
  it('growth carrying targetDate rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'growth', annualRatePct: 5, targetDate: '2027-01-01' }))).toThrow(GoalError);
  });
  it('fixed carrying annualRate rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'fixed', annualRatePct: 5 }))).toThrow(GoalError);
  });
  it('growth missing annualRate rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'growth' }))).toThrow(GoalError);
  });
  it('invalid annualRate', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'growth', annualRatePct: 101 }))).toThrow(GoalError);
  });
  it('target-date missing targetDate', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'target-date' }))).toThrow(GoalError);
  });
  it('invalid targetDate', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', method: 'target-date', targetDate: '2026-13-01' }))).toThrow(GoalError);
  });
  it('malformed createdAt', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', createdAt: '2026-01-01' }))).toThrow(GoalError);
  });
  it('createdAt invalid calendar date rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', createdAt: '2026-02-31T00:00:00Z' }))).toThrow(GoalError);
  });
  it('linked + manualSaved rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', linkedAccountId: 'a1', manualSaved: 100 }))).toThrow(GoalError);
  });
  it('negative manualSaved rejected', () => {
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', manualSaved: -1 }))).toThrow(GoalError);
  });
  it('unknown linked account when ctx supplied', () => {
    const ctx = { accountBalances: new Map() };
    expect(() => assertValidGoal(makeGoal({ id: 'g', name: 'x', linkedAccountId: 'missing' }), ctx)).toThrow(GoalError);
  });
});

describe('saved / remaining', () => {
  it('default saved = 0', () => {
    const g = makeGoal({ id: 'g', name: 'x' });
    expect(goalSavedSoFar(g)).toBe(0);
  });
  it('manual saved', () => {
    const g = makeGoal({ id: 'g', name: 'x', manualSaved: 5000 });
    expect(goalSavedSoFar(g)).toBe(5000);
  });
  it('linked live balance', () => {
    const g = makeGoal({ id: 'g', name: 'x', linkedAccountId: 'a1' });
    const ctx = { accountBalances: new Map([['a1', 12345]]) };
    expect(goalSavedSoFar(g, ctx)).toBe(12345);
  });
  it('linked requires context', () => {
    const g = makeGoal({ id: 'g', name: 'x', linkedAccountId: 'a1' });
    expect(() => goalSavedSoFar(g)).toThrow(GoalError);
  });
  it('negative linked live balance preserved', () => {
    const g = makeGoal({ id: 'g', name: 'x', linkedAccountId: 'a1' });
    const ctx = { accountBalances: new Map([['a1', -1000]]) };
    expect(goalSavedSoFar(g, ctx)).toBe(-1000);
  });
  it('already-funded goal remaining = 0', () => {
    const g = makeGoal({ id: 'g', name: 'x', manualSaved: 200000 });
    const r = remainingGoalAmount(g);
    expect(r).toBe(0);
  });
});

describe('fixed method', () => {
  it('exact multiple', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 12000, monthlyContribution: 1000, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.monthsToTarget).toBe(12);
    expect(p.projectedTargetMonth).toBe('2026-12');
    expect(p.feasible).toBe(true);
  });
  it('ceiling contribution month', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 2500, monthlyContribution: 1000, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.monthsToTarget).toBe(3);
  });
  it('projection month semantics', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, monthlyContribution: 1000, manualSaved: 0 });
    const p = projectGoal(g, '2026-03-15', 2000);
    expect(p.monthsToTarget).toBe(1);
    expect(p.projectedTargetMonth).toBe('2026-03');
  });
  it('already complete', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, monthlyContribution: 1000, manualSaved: 1000 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.complete).toBe(true);
    expect(p.monthsToTarget).toBe(0);
  });
  it('feasible', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, monthlyContribution: 500, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 500);
    expect(p.feasible).toBe(true);
  });
  it('infeasible', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, monthlyContribution: 500, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 400);
    expect(p.feasible).toBe(false);
  });
  it('negative available surplus', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, monthlyContribution: 500, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', -100);
    expect(p.feasible).toBe(false);
  });
});

describe('growth method', () => {
  it('0% behaves like fixed', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 6000, monthlyContribution: 1000, method: 'growth', annualRatePct: 0, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.monthsToTarget).toBe(6);
  });
  it('positive growth', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 10000, monthlyContribution: 1000, method: 'growth', annualRatePct: 12, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.monthsToTarget).toBeGreaterThan(0);
    expect(p.projectedTargetMonth).toBeTruthy();
  });
  it('growth-first then contribution ordering', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 2000, monthlyContribution: 500, method: 'growth', annualRatePct: 12, manualSaved: 500 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.monthsToTarget).toBeGreaterThan(0);
  });
  it('maxMonths cap returns null target timing', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1_000_000, monthlyContribution: 1, method: 'growth', annualRatePct: 0, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000, undefined, { maxMonths: 10 });
    expect(p.monthsToTarget).toBeNull();
    expect(p.projectedTargetMonth).toBeNull();
  });
});

describe('target-date method', () => {
  it('same-month = 1 contribution', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, method: 'target-date', targetDate: '2026-01-31', manualSaved: 0 });
    const p = projectGoal(g, '2026-01-10', 1000);
    expect(p.monthsToTarget).toBe(1);
    expect(p.requiredMonthlyContribution).toBe(1000);
  });
  it('next month = 2 contributions', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 2000, method: 'target-date', targetDate: '2026-02-15', manualSaved: 0 });
    const p = projectGoal(g, '2026-01-10', 2000);
    expect(p.monthsToTarget).toBe(2);
    expect(p.requiredMonthlyContribution).toBe(1000);
  });
  it('exact division', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 3000, method: 'target-date', targetDate: '2026-03-01', manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.requiredMonthlyContribution).toBe(1000);
  });
  it('ceiling division', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 2500, method: 'target-date', targetDate: '2026-03-01', manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.requiredMonthlyContribution).toBe(834);
  });
  it('deadline inclusive', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, method: 'target-date', targetDate: '2026-01-01', manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.monthsToTarget).toBe(1);
  });
  it('deadline already passed unfinished', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, method: 'target-date', targetDate: '2025-12-01', manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.deadlinePassed).toBe(true);
    expect(p.feasible).toBe(false);
    expect(p.requiredMonthlyContribution).toBeNull();
  });
  it('already-complete despite past deadline', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, method: 'target-date', targetDate: '2025-12-01', manualSaved: 1000 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.complete).toBe(true);
  });
  it('no-growth requirement', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 3000, method: 'target-date', targetDate: '2026-03-01', manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.requiredMonthlyContribution).toBe(1000);
  });
  it('growth-assisted requirement', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 3000, method: 'target-date', targetDate: '2026-03-01', manualSaved: 0, annualRatePct: 12 });
    const p = projectGoal(g, '2026-01-01', 2000);
    expect(p.requiredMonthlyContribution).toBeLessThan(1000);
  });
  it('binary search returns minimum successful contribution', () => {
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: 3000, method: 'target-date', targetDate: '2026-03-01', manualSaved: 0, annualRatePct: 12 });
    const p = projectGoal(g, '2026-01-01', 2000);
    const req = p.requiredMonthlyContribution!;
    expect(req).toBeGreaterThan(0);
    expect(req).toBeLessThanOrEqual(1000);
  });
  it('negative starting balance still finds safe upper bound', () => {
    const ctx = { accountBalances: new Map([['a1', -500]]) };
    const g2 = makeGoal({ id: 'g', name: 'x', targetAmount: 1000, method: 'target-date', targetDate: '2026-03-01', linkedAccountId: 'a1', annualRatePct: 12 });
    const p = projectGoal(g2, '2026-01-01', 2000, ctx);
    expect(p.requiredMonthlyContribution).toBeGreaterThan(0);
  });
  it('large safe-integer target-date requires MAX contribution', () => {
    const target = Number.MAX_SAFE_INTEGER - 1000;
    const g = makeGoal({ id: 'g', name: 'x', targetAmount: target, method: 'target-date', targetDate: '2026-01-31', annualRatePct: 1, manualSaved: 0 });
    const p = projectGoal(g, '2026-01-01', Number.MAX_SAFE_INTEGER);
    expect(p.requiredMonthlyContribution).toBe(target);
  });
});
