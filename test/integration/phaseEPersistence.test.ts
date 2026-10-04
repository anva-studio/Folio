// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileRepository } from '../../src/persistence/profileRepository.js';
import { ProfileSession } from '../../src/application/profileSession.js';
import { createEmptyProfileData } from '../../src/application/profileData.js';

describe('Phase-E persistence lifecycle', () => {
  it('preserves Debt, Goal, HealthConfig and ignores scenario', async () => {
    const dbName = `folio_phasee_${Math.random().toString(36).slice(2)}`;
    const repo = new ProfileRepository({ dbName });
    await repo.open();
    const data = createEmptyProfileData();
    const sel = await repo.createProfile({ label: 'PE', password: 'pw', data });
    const session = new ProfileSession(repo);
    await session.unlock(sel.profileId, 'pw');
    session.update(d => {
      d.debts.push({ id: 'd1', name: 'Loan', kind: 'personal', balance: 1000, annualRatePct: 10, monthlyPayment: 100, active: true });
      d.goals.push({ id: 'g1', name: 'Car', targetAmount: 5000, method: 'fixed', monthlyContribution: 200, active: true, createdAt: new Date().toISOString() });
      d.health.targetEmergencyMonths = 8;
      return d;
    });
    await session.flush();
    await session.lock();

    await repo.close();
    await repo.open();
    const session2 = new ProfileSession(repo);
    await session2.unlock(sel.profileId, 'pw');
    const snap = session2.getSnapshot();
    expect(snap.debts).toHaveLength(1);
    expect(snap.debts[0].name).toBe('Loan');
    expect(snap.goals).toHaveLength(1);
    expect(snap.goals[0].name).toBe('Car');
    expect(snap.health.targetEmergencyMonths).toBe(8);
    // scenario field must not exist
    expect((snap as any).scenario).toBeUndefined();
    await session2.lock();
    await repo.close();
    await repo.deleteDatabase();
  });
});
