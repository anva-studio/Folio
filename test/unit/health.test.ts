import { describe, it, expect } from 'vitest';
import {
  HealthError,
  assertValidHealthConfig,
  assertValidHealthInput,
  evaluateFinancialHealth,
} from '../../src/domain/health';
import type { HealthConfig } from '../../src/domain/types';

function makeConfig(over: Partial<HealthConfig> = {}): HealthConfig {
  return {
    targetEmergencyMonths: over.targetEmergencyMonths ?? 6,
    maxDebtToIncome: over.maxDebtToIncome ?? 4,
    minSavingsRate: over.minSavingsRate ?? 0.1,
  };
}

describe('Health config validation', () => {
  it('accepts valid config', () => {
    expect(() => assertValidHealthConfig(makeConfig())).not.toThrow();
  });
  it('zero thresholds allowed', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: 0, maxDebtToIncome: 0, minSavingsRate: 0 })).not.toThrow();
  });
  it('decimal emergency months', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: 2.5, maxDebtToIncome: 4, minSavingsRate: 0.1 })).not.toThrow();
  });
  it('negative emergency months rejected', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: -1, maxDebtToIncome: 4, minSavingsRate: 0.1 })).toThrow(HealthError);
  });
  it('negative DTI threshold rejected', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: 6, maxDebtToIncome: -0.1, minSavingsRate: 0.1 })).toThrow(HealthError);
  });
  it('savings target below 0 rejected', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: 6, maxDebtToIncome: 4, minSavingsRate: -0.01 })).toThrow(HealthError);
  });
  it('savings target above 1 rejected', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: 6, maxDebtToIncome: 4, minSavingsRate: 1.1 })).toThrow(HealthError);
  });
  it('NaN rejected', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: NaN, maxDebtToIncome: 4, minSavingsRate: 0.1 })).toThrow(HealthError);
  });
  it('Infinity rejected', () => {
    expect(() => assertValidHealthConfig({ targetEmergencyMonths: Infinity, maxDebtToIncome: 4, minSavingsRate: 0.1 })).toThrow(HealthError);
  });
});

describe('Health input validation', () => {
  it('valid input', () => {
    expect(() => assertValidHealthInput({ liquidFunds: 1000, monthlyIncome: 1000, monthlyExpenses: 1000, totalDebt: 1000, annualIncome: 1000 })).not.toThrow();
  });
  it('negative liquidFunds rejected', () => {
    expect(() => assertValidHealthInput({ liquidFunds: -1, monthlyIncome: 1, monthlyExpenses: 1, totalDebt: 1, annualIncome: 1 })).toThrow(HealthError);
  });
  it('negative income rejected', () => {
    expect(() => assertValidHealthInput({ liquidFunds: 1, monthlyIncome: -1, monthlyExpenses: 1, totalDebt: 1, annualIncome: 1 })).toThrow(HealthError);
  });
  it('negative expenses rejected', () => {
    expect(() => assertValidHealthInput({ liquidFunds: 1, monthlyIncome: 1, monthlyExpenses: -1, totalDebt: 1, annualIncome: 1 })).toThrow(HealthError);
  });
  it('negative debt rejected', () => {
    expect(() => assertValidHealthInput({ liquidFunds: 1, monthlyIncome: 1, monthlyExpenses: 1, totalDebt: -1, annualIncome: 1 })).toThrow(HealthError);
  });
  it('negative annual income rejected', () => {
    expect(() => assertValidHealthInput({ liquidFunds: 1, monthlyIncome: 1, monthlyExpenses: 1, totalDebt: 1, annualIncome: -1 })).toThrow(HealthError);
  });
  it('non-integer money rejected', () => {
    expect(() => assertValidHealthInput({ liquidFunds: 1.5 as any, monthlyIncome: 1, monthlyExpenses: 1, totalDebt: 1, annualIncome: 1 })).toThrow(HealthError);
  });
  it('unsafe integer rejected', () => {
    const big = Number.MAX_SAFE_INTEGER + 1;
    expect(() => assertValidHealthInput({ liquidFunds: big as any, monthlyIncome: 1, monthlyExpenses: 1, totalDebt: 1, annualIncome: 1 })).toThrow(HealthError);
  });
});

describe('Emergency fund', () => {
  it('exact integer-month target', () => {
    const input = { liquidFunds: 600000, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ targetEmergencyMonths: 6 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.emergencyFund.targetAmount).toBe(600000);
    expect(r.emergencyFund.meetsTarget).toBe(true);
  });
  it('decimal-month target', () => {
    const input = { liquidFunds: 250000, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ targetEmergencyMonths: 2.5 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.emergencyFund.targetAmount).toBe(250000);
    expect(r.emergencyFund.meetsTarget).toBe(true);
  });
  it('underfunded exact shortfall', () => {
    const input = { liquidFunds: 400000, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ targetEmergencyMonths: 6 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.emergencyFund.targetAmount).toBe(600000);
    expect(r.emergencyFund.shortfall).toBe(200000);
    expect(r.emergencyFund.meetsTarget).toBe(false);
  });
  it('overfunded', () => {
    const input = { liquidFunds: 700000, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ targetEmergencyMonths: 6 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.emergencyFund.meetsTarget).toBe(true);
    expect(r.emergencyFund.shortfall).toBe(0);
  });
  it('monthsCovered', () => {
    const input = { liquidFunds: 150000, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ targetEmergencyMonths: 6 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.emergencyFund.monthsCovered).toBe(1.5);
  });
  it('zero expenses special case', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 0, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ targetEmergencyMonths: 6 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.emergencyFund.targetAmount).toBe(0);
    expect(r.emergencyFund.shortfall).toBe(0);
    expect(r.emergencyFund.monthsCovered).toBeNull();
    expect(r.emergencyFund.meetsTarget).toBe(true);
  });
});

describe('Debt to income', () => {
  it('normal ratio below threshold', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 2000000, annualIncome: 1200000 };
    const cfg = makeConfig({ maxDebtToIncome: 4 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.debtToIncome.ratio).toBeCloseTo(1.6666, 3);
    expect(r.debtToIncome.meetsTarget).toBe(true);
  });
  it('ratio exactly at threshold', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 4800000, annualIncome: 1200000 };
    const cfg = makeConfig({ maxDebtToIncome: 4 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.debtToIncome.ratio).toBe(4);
    expect(r.debtToIncome.meetsTarget).toBe(true);
  });
  it('above threshold', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 5000000, annualIncome: 1200000 };
    const cfg = makeConfig({ maxDebtToIncome: 4 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.debtToIncome.meetsTarget).toBe(false);
  });
  it('zero income + zero debt', () => {
    const input = { liquidFunds: 0, monthlyIncome: 0, monthlyExpenses: 0, totalDebt: 0, annualIncome: 0 };
    const cfg = makeConfig();
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.debtToIncome.ratio).toBe(0);
    expect(r.debtToIncome.meetsTarget).toBe(true);
  });
  it('zero income + positive debt', () => {
    const input = { liquidFunds: 0, monthlyIncome: 0, monthlyExpenses: 0, totalDebt: 1000, annualIncome: 0 };
    const cfg = makeConfig();
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.debtToIncome.ratio).toBeNull();
    expect(r.debtToIncome.meetsTarget).toBe(false);
  });
});

describe('Savings', () => {
  it('positive savings', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 80000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ minSavingsRate: 0.1 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.savings.monthlySavings).toBe(20000);
    expect(r.savings.rate).toBeCloseTo(0.2);
    expect(r.savings.meetsTarget).toBe(true);
  });
  it('zero savings', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ minSavingsRate: 0.1 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.savings.rate).toBe(0);
    expect(r.savings.meetsTarget).toBe(false);
  });
  it('negative savings', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 120000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ minSavingsRate: 0.1 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.savings.monthlySavings).toBe(-20000);
    expect(r.savings.rate).toBeCloseTo(-0.2);
    expect(r.savings.meetsTarget).toBe(false);
  });
  it('exactly at target', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 90000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ minSavingsRate: 0.1 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.savings.meetsTarget).toBe(true);
  });
  it('above target', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 80000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ minSavingsRate: 0.1 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.savings.meetsTarget).toBe(true);
  });
  it('below target', () => {
    const input = { liquidFunds: 0, monthlyIncome: 100000, monthlyExpenses: 95000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ minSavingsRate: 0.1 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.savings.meetsTarget).toBe(false);
  });
  it('zero income => null rate/meetsTarget', () => {
    const input = { liquidFunds: 0, monthlyIncome: 0, monthlyExpenses: 0, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ minSavingsRate: 0.1 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.savings.rate).toBeNull();
    expect(r.savings.meetsTarget).toBeNull();
  });
});

describe('Report targets counts', () => {
  it('targets evaluated correct with zero income', () => {
    const input = { liquidFunds: 0, monthlyIncome: 0, monthlyExpenses: 0, totalDebt: 0, annualIncome: 0 };
    const cfg = makeConfig();
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.targetsEvaluated).toBe(2);
  });
  it('targets met correct', () => {
    const input = { liquidFunds: 600000, monthlyIncome: 100000, monthlyExpenses: 100000, totalDebt: 0, annualIncome: 1200000 };
    const cfg = makeConfig({ targetEmergencyMonths: 6, maxDebtToIncome: 4, minSavingsRate: 0 });
    const r = evaluateFinancialHealth(input, cfg);
    expect(r.targetsEvaluated).toBe(3);
    expect(r.targetsMet).toBe(3);
  });
  it('no composite score exists', () => {
    const input = { liquidFunds: 0, monthlyIncome: 1000, monthlyExpenses: 1000, totalDebt: 0, annualIncome: 12000 };
    const cfg = makeConfig();
    const r = evaluateFinancialHealth(input, cfg);
    expect('score' in r).toBe(false);
  });
});
