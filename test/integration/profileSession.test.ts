import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileRepository } from '../../src/persistence/profileRepository.js';
import { ProfileSession } from '../../src/application/profileSession.js';
import type { ProfileData } from '../../src/domain/types.js';
import { SessionLockedError, ProfileConflictError } from '../../src/security/errors.js';

function makeProfileData(): ProfileData {
  const now = new Date().toISOString();
  return {
    version: 1,
    currency: { code: 'INR', symbol: '₹', minorDigits: 2, indianGrouping: true },
    accounts: [],
    categories: [],
    txns: [],
    recurring: [],
    debts: [],
    goals: [],
    health: { targetEmergencyMonths: 6, maxDebtToIncome: 4, minSavingsRate: 0.1 },
    onboardingDone: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe('ProfileSession', () => {
  let repo: ProfileRepository;
  let session: ProfileSession;
  const sessions: ProfileSession[] = [];
  const makeSession = (repository: ProfileRepository, options?: { autosaveDelayMs?: number }) => {
    const created = new ProfileSession(repository, options);
    sessions.push(created);
    return created;
  };

  beforeEach(async () => {
    const dbName = `folio_session_${Math.random().toString(36).slice(2)}`;
    repo = new ProfileRepository({ dbName });
    await repo.open();
    session = makeSession(repo, { autosaveDelayMs: 10 });
  });

  afterEach(async () => {
    for (const active of sessions.splice(0)) active.discardAndLock();
    await repo.close();
    await repo.deleteDatabase();
  });

  it('unlock and snapshot', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'S', password: 'pw', data });
    await session.unlock(sel.profileId, 'pw');
    expect(session.isLocked).toBe(false);
    const snap = session.getSnapshot();
    expect(snap).toEqual(data);
  });

  it('snapshot isolation', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'S', password: 'pw', data });
    await session.unlock(sel.profileId, 'pw');
    const snap = session.getSnapshot();
    snap.accounts.push({ id: 'x', name: 'x', type: 'cash', openingBalance: 0, archived: false, createdAt: '' });
    const snap2 = session.getSnapshot();
    expect(snap2.accounts).toHaveLength(0);
  });

  it('update marks dirty and autosaves', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'S', password: 'pw', data });
    await session.unlock(sel.profileId, 'pw');
    session.update(d => {
      d.accounts.push({ id: 'a', name: 'a', type: 'cash', openingBalance: 10, archived: false, createdAt: '' });
      return d;
    });
    expect(session.isDirty).toBe(true);
    await new Promise(r => setTimeout(r, 50));
    expect(session.isDirty).toBe(false);
    const unlocked = await repo.unlockProfile(sel.profileId, 'pw');
    expect(unlocked.data.accounts).toHaveLength(1);
  });

  it('lock flushes dirty', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'S', password: 'pw', data });
    await session.unlock(sel.profileId, 'pw');
    session.update(d => { d.health.targetEmergencyMonths = 12; return d; });
    await session.lock();
    expect(session.isLocked).toBe(true);
    const unlocked = await repo.unlockProfile(sel.profileId, 'pw');
    expect(unlocked.data.health.targetEmergencyMonths).toBe(12);
  });

  it('discard and lock drops changes', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'S', password: 'pw', data });
    await session.unlock(sel.profileId, 'pw');
    session.update(d => { d.health.targetEmergencyMonths = 12; return d; });
    session.discardAndLock();
    expect(session.isLocked).toBe(true);
    const unlocked = await repo.unlockProfile(sel.profileId, 'pw');
    expect(unlocked.data.health.targetEmergencyMonths).toBe(6);
  });

  it('methods throw after lock', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'S', password: 'pw', data });
    await session.unlock(sel.profileId, 'pw');
    await session.lock();
    expect(() => session.getSnapshot()).toThrow(SessionLockedError);
    expect(() => session.update(d => d)).toThrow(SessionLockedError);
  });

  it('conflict from two sessions', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'C', password: 'pw', data });
    const s1 = makeSession(repo, { autosaveDelayMs: 10000 });
    const s2 = makeSession(repo, { autosaveDelayMs: 10000 });
    await s1.unlock(sel.profileId, 'pw');
    await s2.unlock(sel.profileId, 'pw');
    s1.update(d => { d.health.targetEmergencyMonths = 7; return d; });
    await s1.flush();
    s2.update(d => { d.health.targetEmergencyMonths = 8; return d; });
    await expect(s2.flush()).rejects.toThrow(ProfileConflictError);
    expect(s2.isDirty).toBe(true);
  });

  it('lock rejects on flush failure and remains unlocked', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'L', password: 'pw', data });
    const sess = makeSession(repo, { autosaveDelayMs: 10000 });
    await sess.unlock(sel.profileId, 'pw');
    expect(sess.revision).toBe(1);
    sess.update(d => { d.health.targetEmergencyMonths = 12; return d; });
    const external = await repo.unlockProfile(sel.profileId, 'pw');
    const extData = JSON.parse(JSON.stringify(external.data));
    extData.health.targetEmergencyMonths = 99;
    await repo.saveUnlockedProfile(sel.profileId, external.revision, external.encryptionKey, extData);
    await expect(sess.lock()).rejects.toThrow(ProfileConflictError);
    expect(sess.isLocked).toBe(false);
    expect(sess.isDirty).toBe(true);
  });

  it('autosave debounce collapses rapid updates', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'D', password: 'pw', data });
    const sess = makeSession(repo, { autosaveDelayMs: 10 });
    await sess.unlock(sel.profileId, 'pw');
    sess.update(d => { d.health.targetEmergencyMonths = 7; return d; });
    sess.update(d => { d.health.targetEmergencyMonths = 8; return d; });
    sess.update(d => { d.health.targetEmergencyMonths = 9; return d; });
    // Wait for debounce to trigger autosave
    await new Promise(r => setTimeout(r, 50));
    // Ensure flush completed
    await sess.flush();
    expect(sess.isDirty).toBe(false);
    const unlocked = await repo.unlockProfile(sel.profileId, 'pw');
    expect(unlocked.data.health.targetEmergencyMonths).toBe(9);
  });

  it('update during in-flight save persists latest mutation', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'U', password: 'pw', data });

    // create a controllable repo wrapper to delay save
    let resolveSave: () => void;
    const saveDeferred = new Promise<void>(res => { resolveSave = res; });
    const originalSave = repo.saveUnlockedProfile.bind(repo);
    const repoWithDelay = {
      ...repo,
      saveUnlockedProfile: async (profileId: string, expectedRevision: number, encryptionKey: CryptoKey, newData: any) => {
        await saveDeferred;
        return originalSave(profileId, expectedRevision, encryptionKey, newData);
      },
      unlockProfile: repo.unlockProfile.bind(repo),
      open: repo.open.bind(repo),
      close: repo.close.bind(repo),
    } as any;

    const sessDelayed = makeSession(repoWithDelay, { autosaveDelayMs: 10000 });
    await sessDelayed.unlock(sel.profileId, 'pw');
    sessDelayed.update(d => { d.health.targetEmergencyMonths = 7; return d; });

    // start flush but don't await
    const flushPromise = sessDelayed.flush();
    // while save is deferred, mutate again
    sessDelayed.update(d => { d.health.targetEmergencyMonths = 9; return d; });

    // now allow first save to complete
    resolveSave!();
    await flushPromise;

    // session should remain dirty because mutation happened during flight
    expect(sessDelayed.isDirty).toBe(true);
    expect(sessDelayed.revision).toBeGreaterThan(1);

    // flush again to persist G2
    await sessDelayed.flush();
    expect(sessDelayed.isDirty).toBe(false);

    const unlocked = await repo.unlockProfile(sel.profileId, 'pw');
    expect(unlocked.data.health.targetEmergencyMonths).toBe(9);
  });

  it('autosave does not retry forever on persistent conflict', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'R', password: 'pw', data });
    
    let saveCallCount = 0;
    const repoStub = {
      ...repo,
      saveUnlockedProfile: async () => {
        saveCallCount++;
        throw new ProfileConflictError(sel.profileId, 1, 2);
      },
      unlockProfile: repo.unlockProfile.bind(repo),
      open: repo.open.bind(repo),
      close: repo.close.bind(repo),
    } as any;

    const sess = makeSession(repoStub, { autosaveDelayMs: 5 });
    await sess.unlock(sel.profileId, 'pw');

    sess.update(d => { d.health.targetEmergencyMonths = 7; return d; });

    // wait for autosave to attempt and fail
    await new Promise(r => setTimeout(r, 50));
    expect(saveCallCount).toBe(1);
    expect(sess.isDirty).toBe(true);

    // wait longer to ensure no automatic retry loop
    await new Promise(r => setTimeout(r, 100));
    expect(saveCallCount).toBe(1);
    expect(sess.isDirty).toBe(true);

    // manual flush should retry once
    try {
      await sess.flush();
    } catch {}
    expect(saveCallCount).toBe(2);
    expect(sess.isDirty).toBe(true);
  });
});

