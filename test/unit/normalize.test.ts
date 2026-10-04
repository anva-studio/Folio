// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { normalizeProfileData } from '../../src/application/profileData';

const base = {
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

describe('normalizeProfileData strict legacy', () => {
  it('normalizes valid Phase-D legacy missing Phase-E fields', () => {
    const data = { ...base };
    const out = normalizeProfileData(data);
    expect(out.debts).toEqual([]);
    expect(out.goals).toEqual([]);
    expect(out.health).toBeDefined();
  });
  it('rejects missing accounts', () => {
    const data = { ...base, accounts: undefined };
    expect(() => normalizeProfileData(data)).toThrow();
  });
  it('rejects missing txns', () => {
    const data = { ...base, txns: undefined };
    expect(() => normalizeProfileData(data)).toThrow();
  });
  it('rejects missing recurring', () => {
    const data = { ...base, recurring: undefined };
    expect(() => normalizeProfileData(data)).toThrow();
  });
  it('rejects missing version', () => {
    const { version, ...rest } = base;
    expect(() => normalizeProfileData(rest)).toThrow();
  });
  it('rejects missing onboardingDone', () => {
    const { onboardingDone, ...rest } = base;
    expect(() => normalizeProfileData(rest)).toThrow();
  });
  it('rejects unsupported version', () => {
    const data = { ...base, version: 2 };
    expect(() => normalizeProfileData(data)).toThrow();
  });
});
