import { describe, it, expect } from 'vitest';
import { normalizeProfileData } from '../../src/application/profileData';
import { createEmptyProfileData } from '../../src/application/profileData';

describe('ProfileData backward compatibility', () => {
  it('normalizes missing Phase-E fields', () => {
    const legacy = {
      version: 1,
      currency: { code: 'INR', symbol: '₹', minorDigits: 2, indianGrouping: true },
      accounts: [],
      categories: [],
      txns: [],
      recurring: [],
      onboardingDone: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const normalized = normalizeProfileData(legacy);
    expect(normalized.debts).toEqual([]);
    expect(normalized.goals).toEqual([]);
    expect(normalized.health).toBeDefined();
    expect(normalized.health.targetEmergencyMonths).toBe(6);
  });

  it('preserves existing Phase-E fields when present', () => {
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    data.debts = [{ id: 'd1', name: 'Test', kind: 'emi', balance: 10000, annualRatePct: 12, monthlyPayment: 5000, active: true }];
    data.goals = [{ id: 'g1', name: 'Goal', targetAmount: 100000, method: 'fixed', monthlyContribution: 10000, active: true, createdAt: '2026-09-26T00:00:00.000Z' }];
    data.health = { targetEmergencyMonths: 3, maxDebtToIncome: 3, minSavingsRate: 0.2 };
    const normalized = normalizeProfileData(data);
    expect(normalized.debts).toHaveLength(1);
    expect(normalized.goals).toHaveLength(1);
    expect(normalized.health.targetEmergencyMonths).toBe(3);
  });

  it('throws on unsupported version', () => {
    expect(() => normalizeProfileData({ version: 2 } as any)).toThrow(/Unsupported profile version/);
  });
});
