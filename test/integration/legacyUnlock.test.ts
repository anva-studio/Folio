// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileRepository } from '../../src/persistence/profileRepository.js';
import { ProfileSession } from '../../src/application/profileSession.js';
import { createBackup, importBackup } from '../../src/application/backupService.js';
import { createEmptyProfileData } from '../../src/application/profileData.js';

describe('Real encrypted legacy unlock', () => {
  it('restores a v1 encrypted backup with the old profile shape and preserves its ledger',async()=>{
    const source=new ProfileRepository({dbName:'legacy-backup-source-'+crypto.randomUUID()});
    const target=new ProfileRepository({dbName:'legacy-backup-target-'+crypto.randomUUID()});
    await source.open();await target.open();
    try {
      const data=createEmptyProfileData();data.accounts=[{id:'legacy-account',name:'Legacy bank',type:'bank',openingBalance:125000,archived:false,createdAt:'2026-01-01T00:00:00Z'}];
      const {debts: _debts,goals: _goals,health: _health,...oldShape}=data;
      const profile=await source.createProfile({label:'Old profile',password:'legacy-only',data:oldShape as typeof data});
      const backup=JSON.parse(JSON.stringify(await createBackup(source,profile.profileId)));
      expect(backup.backupVersion).toBe(1);expect(backup.profile.index.writeEpoch).toBeUndefined();
      await importBackup(target,backup,false);const session=new ProfileSession(target);await session.unlock(profile.profileId,'legacy-only');
      expect(session.getSnapshot().accounts).toEqual(data.accounts);expect(session.getSnapshot().txns).toEqual([]);expect(session.getSnapshot().goals).toEqual([]);expect(session.getSnapshot().debts).toEqual([]);expect(session.getSnapshot().health.targetEmergencyMonths).toBe(6);
      session.update(d=>{d.accounts[0].name='Still editable';return d;});await session.lock();
      expect((await target.unlockProfile(profile.profileId,'legacy-only')).data.accounts[0].name).toBe('Still editable');
    } finally {await source.close();await target.close();await source.deleteDatabase();await target.deleteDatabase();}
  });
  it('preserves old Phase-D shape and defaults Phase-E', async () => {
    const dbName = `folio_legacy_${Math.random().toString(36).slice(2)}`;
    const repo = new ProfileRepository({ dbName });
    await repo.open();
    const data = {
      version: 1,
      currency: { code: 'INR', symbol: '₹', minorDigits: 2, indianGrouping: true },
      accounts: [{ id: 'a1', name: 'A', type: 'bank', openingBalance: 0, archived: false, createdAt: '2026-01-01T00:00:00.000Z' }],
      categories: [{ id: 'c1', name: 'C', kind: 'income' }],
      txns: [{ id: 't1', type: 'income', date: '2026-01-01', amount: 100, accountId: 'a1', categoryId: 'c1', createdAt: '2026-01-01T00:00:00.000Z' }],
      recurring: [],
      onboardingDone: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as any;
    const sel = await repo.createProfile({ label: 'Legacy', password: 'pw', data });
    await repo.close();
    await repo.open();
    const session = new ProfileSession(repo);
    await session.unlock(sel.profileId, 'pw');
    const snap = session.getSnapshot();
    expect(snap.accounts).toHaveLength(1);
    expect(snap.debts).toEqual([]);
    expect(snap.goals).toEqual([]);
    expect(snap.health).toBeDefined();
    await session.lock();
    await repo.close();
    await repo.deleteDatabase();
  });
});
