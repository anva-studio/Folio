import { describe, it, expect } from 'vitest';
import { evaluateFinancialHealth } from '../../src/domain/health';
import { evaluateAffordabilityScenario } from '../../src/domain/scenario';
import { summarizeDebts } from '../../src/domain/debt';
import { projectGoal } from '../../src/domain/goal';
import { summarizeTransactionsMonth } from '../../src/domain/cashflow';
import { computeAccountBalances, consolidatedBalance } from '../../src/domain/ledger';
import type { Debt } from '../../src/domain/types';
import type { Txn } from '../../src/domain/types';

describe('Phase B Integration', () => {
  it('Health → Scenario reserve', () => {
    const monthlyExpenses = 100_000;
    const targetEmergencyMonths = 6;
    const healthInput = {
      liquidFunds: 700_000,
      monthlyIncome: 200_000,
      monthlyExpenses,
      totalDebt: 0,
      annualIncome: 2_400_000,
    };
    const healthCfg = { targetEmergencyMonths, maxDebtToIncome: 4, minSavingsRate: 0.1 };
    const healthReport = evaluateFinancialHealth(healthInput, healthCfg);
    const emergencyTarget = healthReport.emergencyFund.targetAmount;

    const scenario = evaluateAffordabilityScenario({
      currentLiquidFunds: healthInput.liquidFunds,
      emergencyReserve: emergencyTarget,
      currentMonthlySurplus: 100_000,
      upfrontCost: 50_000,
      addedMonthlyCost: 0,
    });

    expect(scenario.reserveProtected).toBe(true);
    expect(scenario.postPurchaseLiquidFunds).toBe(650_000);
    expect(scenario.reserveShortfall).toBe(0);
  });

  it('Debt portfolio → Health debt-to-income', () => {
    const debts: Debt[] = [
      {
        id: 'd1',
        name: 'Loan',
        kind: 'emi',
        balance: 1_200_000,
        annualRatePct: 10,
        monthlyPayment: 20_000,
        active: true,
      },
      {
        id: 'd2',
        name: 'CC',
        kind: 'credit-card',
        balance: 200_000,
        annualRatePct: 36,
        monthlyPayment: 15_000,
        active: true,
      },
    ];
    const summary = summarizeDebts(debts);
    expect(summary.totalBalance).toBe(1_400_000);

    const healthInput = {
      liquidFunds: 500_000,
      monthlyIncome: 200_000,
      monthlyExpenses: 150_000,
      totalDebt: summary.totalBalance,
      annualIncome: 2_400_000,
    };
    const healthReport = evaluateFinancialHealth(healthInput, { targetEmergencyMonths: 6, maxDebtToIncome: 4, minSavingsRate: 0.1 });
    expect(healthReport.debtToIncome.ratio).toBeCloseTo(1_400_000 / 2_400_000, 5);
  });

  it('Scenario → Goal feasibility', () => {
    const scenario = evaluateAffordabilityScenario({
      currentLiquidFunds: 1_000_000,
      emergencyReserve: 600_000,
      currentMonthlySurplus: 50_000,
      upfrontCost: 0,
      addedMonthlyCost: 20_000,
    });
    const available = scenario.postScenarioMonthlySurplus;

    const goal = {
      id: 'g1',
      name: 'Test',
      targetAmount: 1_200_000,
      method: 'fixed' as const,
      monthlyContribution: 40_000,
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
    };

    const projectionBefore = projectGoal(goal, '2026-01-01', 50_000);
    expect(projectionBefore.feasible).toBe(true);

    const projectionAfter = projectGoal(goal, '2026-01-01', available);
    expect(projectionAfter.feasible).toBe(false);
  });

  it('Cash flow baseline policy is explicit', () => {
    const txns: Txn[] = [
      { id: 't1', type: 'income', date: '2026-09-01', amount: 100_000, accountId: 'a1', categoryId: 'c1', createdAt: '2026-01-01T00:00:00Z' },
      { id: 't2', type: 'expense', date: '2026-09-10', amount: 60_000, accountId: 'a1', categoryId: 'c2', createdAt: '2026-01-01T00:00:00Z' },
    ];
    const actual = summarizeTransactionsMonth(txns, '2026-09');
    expect(actual.income).toBe(100_000);
    expect(actual.expense).toBe(60_000);
    expect(actual.net).toBe(40_000);
    expect(actual.transactionCount).toBe(2);

    const scenario = evaluateAffordabilityScenario({
      currentLiquidFunds: 500_000,
      emergencyReserve: 300_000,
      currentMonthlySurplus: 40_000,
      upfrontCost: 0,
      addedMonthlyCost: 10_000,
    });
    expect(scenario.postScenarioMonthlySurplus).toBe(30_000);
  });

  it('Transfers remain neutral', () => {
    const accounts = [
      { id: 'a1', name: 'Cash', type: 'cash' as const, openingBalance: 100_000, archived: false, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'a2', name: 'Bank', type: 'bank' as const, openingBalance: 200_000, archived: false, createdAt: '2026-01-01T00:00:00Z' },
    ];

    const txns = [
      { id: 't1', type: 'transfer' as const, date: '2026-09-01', amount: 50_000, accountId: 'a1', toAccountId: 'a2', createdAt: '2026-01-01T00:00:00Z' },
    ];

    const balances = computeAccountBalances(accounts, txns);
    expect(balances.get('a1')).toBe(50_000);
    expect(balances.get('a2')).toBe(250_000);
    const total = consolidatedBalance(accounts, balances);
    expect(total).toBe(300_000);

    const summary = summarizeTransactionsMonth(txns, '2026-09');
    expect(summary.income).toBe(0);
    expect(summary.expense).toBe(0);
    expect(summary.net).toBe(0);
    expect(summary.transactionCount).toBe(0);
  });
});
