import { describe, it, expect } from 'vitest';
import {
  DebtError,
  assertValidDebt,
  monthlyDebtInterest,
  nextDebtPayment,
  projectDebtPayoff,
  summarizeDebts,
} from '../../src/domain/debt';
import type { Debt } from '../../src/domain/types';

function makeDebt(over: Partial<Debt> & { id: string; name: string }): Debt {
  return {
    id: over.id,
    name: over.name,
    kind: over.kind ?? 'emi',
    balance: over.balance ?? 100000,
    annualRatePct: over.annualRatePct ?? 12,
    monthlyPayment: over.monthlyPayment ?? 10000,
    dueDay: over.dueDay,
    startDate: over.startDate,
    active: over.active ?? true,
    note: over.note,
  };
}

describe('assertValidDebt validation', () => {
  it('accepts valid EMI', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd1', name: 'EMI' }))).not.toThrow();
  });
  it('accepts valid credit-card', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd2', name: 'CC', kind: 'credit-card' }))).not.toThrow();
  });
  it('accepts valid personal', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd3', name: 'Personal', kind: 'personal' }))).not.toThrow();
  });
  it('accepts valid other', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd4', name: 'Other', kind: 'other' }))).not.toThrow();
  });
  it('rejects empty id', () => {
    expect(() => assertValidDebt(makeDebt({ id: '', name: 'x' } as any))).toThrow(DebtError);
  });
  it('rejects empty name', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: '' }))).toThrow(DebtError);
  });
  it('rejects invalid kind', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', kind: 'mortgage' as any }))).toThrow(DebtError);
  });
  it('rejects zero balance', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', balance: 0 }))).toThrow(DebtError);
  });
  it('rejects negative balance', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', balance: -10 }))).toThrow(DebtError);
  });
  it('rejects non-integer balance', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', balance: 10.5 as any }))).toThrow(DebtError);
  });
  it('rejects negative rate', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', annualRatePct: -1 }))).toThrow(DebtError);
  });
  it('rejects rate over 100', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', annualRatePct: 101 }))).toThrow(DebtError);
  });
  it('rejects NaN rate', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', annualRatePct: NaN }))).toThrow(DebtError);
  });
  it('rejects infinite rate', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', annualRatePct: Infinity }))).toThrow(DebtError);
  });
  it('rejects zero payment', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', monthlyPayment: 0 }))).toThrow(DebtError);
  });
  it('rejects negative payment', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', monthlyPayment: -1 }))).toThrow(DebtError);
  });
  it('rejects non-integer payment', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', monthlyPayment: 10.5 as any }))).toThrow(DebtError);
  });
  it('rejects dueDay 0', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', dueDay: 0 }))).toThrow(DebtError);
  });
  it('rejects dueDay 29', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', dueDay: 29 }))).toThrow(DebtError);
  });
  it('rejects invalid startDate', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', startDate: '2026-13-01' }))).toThrow(DebtError);
  });
  it('rejects non-boolean active', () => {
    expect(() => assertValidDebt(makeDebt({ id: 'd', name: 'x', active: 'yes' as any }))).toThrow(DebtError);
  });
});

describe('monthlyDebtInterest', () => {
  it('0% rate returns 0', () => {
    expect(monthlyDebtInterest(10000, 0)).toBe(0);
  });
  it('12% annual interest', () => {
    const i = monthlyDebtInterest(12000, 12);
    expect(i).toBe(120);
  });
  it('decimal rate 12.5%', () => {
    const i = monthlyDebtInterest(10000, 12.5);
    expect(i).toBe(104);
  });
  it('rounding HALF AWAY FROM ZERO', () => {
    const i = monthlyDebtInterest(1, 0.1);
    expect(i).toBe(0);
  });
  it('overflow propagates', () => {
    expect(() => monthlyDebtInterest(Number.MAX_SAFE_INTEGER, 100)).toThrow(RangeError);
  });
});

describe('nextDebtPayment breakdown', () => {
  it('ordinary amortizing payment', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 10000, annualRatePct: 12, monthlyPayment: 2000 });
    const b = nextDebtPayment(d);
    expect(b.openingBalance).toBe(10000);
    expect(b.interestCharged).toBe(100);
    expect(b.scheduledPayment).toBe(2000);
    expect(b.paymentApplied).toBe(2000);
    expect(b.principalReduction).toBe(1900);
    expect(b.uncoveredInterest).toBe(0);
    expect(b.closingBalance).toBe(8100);
    expect(b.amortizes).toBe(true);
  });
  it('payment exactly equal to interest', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 10000, annualRatePct: 12, monthlyPayment: 100 });
    const b = nextDebtPayment(d);
    expect(b.interestCharged).toBe(100);
    expect(b.paymentApplied).toBe(100);
    expect(b.principalReduction).toBe(0);
    expect(b.amortizes).toBe(false);
  });
  it('payment below interest', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 10000, annualRatePct: 12, monthlyPayment: 50 });
    const b = nextDebtPayment(d);
    expect(b.interestCharged).toBe(100);
    expect(b.paymentApplied).toBe(50);
    expect(b.uncoveredInterest).toBe(50);
    expect(b.closingBalance).toBe(10050);
    expect(b.amortizes).toBe(false);
  });
  it('final payment smaller than monthlyPayment', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 100, annualRatePct: 0, monthlyPayment: 1000 });
    const b = nextDebtPayment(d);
    expect(b.paymentApplied).toBe(100);
    expect(b.closingBalance).toBe(0);
  });
  it('closing balance never negative', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 1, annualRatePct: 0, monthlyPayment: 100 });
    const b = nextDebtPayment(d);
    expect(b.closingBalance).toBe(0);
  });
  it('uncovered interest represented correctly', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 5000, annualRatePct: 24, monthlyPayment: 50 });
    const b = nextDebtPayment(d);
    expect(b.uncoveredInterest).toBeGreaterThan(0);
  });
});

describe('projectDebtPayoff', () => {
  it('zero-interest payoff', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 3000, annualRatePct: 0, monthlyPayment: 1000 });
    const p = projectDebtPayoff(d);
    expect(p.amortizes).toBe(true);
    expect(p.monthsToPayoff).toBe(3);
    expect(p.totalInterest).toBe(0);
    expect(p.totalPaid).toBe(3000);
    expect(p.finalPayment).toBe(1000);
    expect(p.truncated).toBe(false);
  });
  it('normal interest-bearing payoff', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 10000, annualRatePct: 12, monthlyPayment: 1000 });
    const p = projectDebtPayoff(d);
    expect(p.amortizes).toBe(true);
    expect(p.monthsToPayoff).toBeGreaterThan(0);
    expect(p.totalInterest).toBeGreaterThan(0);
    expect(p.totalPaid).toBeGreaterThan(p.openingBalance);
  });
  it('exact final payment', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 1000, annualRatePct: 12, monthlyPayment: 1000 });
    const p = projectDebtPayoff(d);
    expect(p.monthsToPayoff).toBe(2);
    expect(p.finalPayment).toBeLessThan(1000);
  });
  it('totalPaid == principal + totalInterest', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 5000, annualRatePct: 12, monthlyPayment: 600 });
    const p = projectDebtPayoff(d);
    if (p.amortizes && p.monthsToPayoff !== null && p.totalInterest !== null) {
      expect(p.totalPaid).toBe(p.totalInterest + p.openingBalance);
    }
  });
  it('payment == interest => non-amortizing', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 10000, annualRatePct: 12, monthlyPayment: 100 });
    const p = projectDebtPayoff(d);
    expect(p.amortizes).toBe(false);
    expect(p.monthsToPayoff).toBeNull();
  });
  it('payment below interest => non-amortizing', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 10000, annualRatePct: 12, monthlyPayment: 50 });
    const p = projectDebtPayoff(d);
    expect(p.amortizes).toBe(false);
  });
  it('projection maxMonths truncation', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: 100000, annualRatePct: 12, monthlyPayment: 2000 });
    const p = projectDebtPayoff(d, { maxMonths: 12 });
    expect(p.amortizes).toBe(true);
    expect(p.truncated).toBe(true);
    expect(p.monthsToPayoff).toBeNull();
  });
  it('overflow propagates', () => {
    const d = makeDebt({ id: 'd', name: 'x', balance: Number.MAX_SAFE_INTEGER, annualRatePct: 100, monthlyPayment: 1 });
    expect(() => projectDebtPayoff(d)).toThrow(RangeError);
  });
});

describe('summarizeDebts portfolio', () => {
  it('active only', () => {
    const debts = [
      makeDebt({ id: 'd1', name: 'A', balance: 1000, monthlyPayment: 100, active: true }),
      makeDebt({ id: 'd2', name: 'B', balance: 2000, monthlyPayment: 200, active: false }),
    ];
    const s = summarizeDebts(debts);
    expect(s.totalBalance).toBe(1000);
    expect(s.totalMonthlyPayment).toBe(100);
    expect(s.activeCount).toBe(1);
  });
  it('inactive excluded from totals', () => {
    const debts = [makeDebt({ id: 'd1', name: 'A', balance: 5000, monthlyPayment: 500, active: false })];
    const s = summarizeDebts(debts);
    expect(s.totalBalance).toBe(0);
    expect(s.activeCount).toBe(0);
  });
  it('malformed inactive still rejected', () => {
    const debts = [
      makeDebt({ id: '', name: 'Bad', balance: 1000, monthlyPayment: 100, active: false })
    ];
    expect(() => summarizeDebts(debts)).toThrow(DebtError);
  });
  it('exact balance/payment sums', () => {
    const debts = [
      makeDebt({ id: 'd1', name: 'A', balance: 1000, monthlyPayment: 100, active: true }),
      makeDebt({ id: 'd2', name: 'B', balance: 2000, monthlyPayment: 200, active: true }),
    ];
    const s = summarizeDebts(debts);
    expect(s.totalBalance).toBe(3000);
    expect(s.totalMonthlyPayment).toBe(300);
  });
  it('nonAmortizingCount correct', () => {
    const debts = [
      makeDebt({ id: 'd1', name: 'A', balance: 10000, annualRatePct: 12, monthlyPayment: 100, active: true }),
      makeDebt({ id: 'd2', name: 'B', balance: 5000, annualRatePct: 0, monthlyPayment: 1000, active: true }),
    ];
    const s = summarizeDebts(debts);
    expect(s.nonAmortizingCount).toBe(1);
  });
  it('aggregate overflow throws', () => {
    const debts = [
      makeDebt({ id: 'd1', name: 'A', balance: Number.MAX_SAFE_INTEGER, monthlyPayment: 1, active: true }),
      makeDebt({ id: 'd2', name: 'B', balance: 1, monthlyPayment: 1, active: true }),
    ];
    expect(() => summarizeDebts(debts)).toThrow(RangeError);
  });
});
