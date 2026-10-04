import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileRepository } from '../../src/persistence/profileRepository';
import { createBackup, importBackup } from '../../src/application/backupService';
import { createEmptyProfileData } from '../../src/application/profileData';
import { ProfileConflictError } from '../../src/security/errors';

describe('Restore cannot be overwritten by stale windows', () => {
  it('invalidates existing sessions even when replacing with an identical backup', async () => {
    const repo = new ProfileRepository({ dbName: `restore-identical-${crypto.randomUUID()}` });
    await repo.open();
    try {
      const { profileId } = await repo.createProfile({ label: 'Test', password: 'pw', data: createEmptyProfileData() });
      const backup = await createBackup(repo, profileId);
      const stale = await repo.unlockProfile(profileId, 'pw');
      await importBackup(repo, backup, true);
      stale.data.health.targetEmergencyMonths = 99;
      await expect(repo.saveUnlockedProfile(profileId, stale.revision, stale.encryptionKey, stale.data)).rejects.toBeInstanceOf(ProfileConflictError);
      const fresh = await repo.unlockProfile(profileId, 'pw');
      expect(fresh.data.health.targetEmergencyMonths).not.toBe(99);
      fresh.data.health.targetEmergencyMonths = 7;
      await repo.saveUnlockedProfile(profileId, fresh.revision, fresh.encryptionKey, fresh.data);
      expect((await repo.unlockProfile(profileId, 'pw')).data.health.targetEmergencyMonths).toBe(7);
    } finally { await repo.close(); await repo.deleteDatabase(); }
  });
  it('rejects a stale key when a restored vault reuses the same revision', async () => {
    const dbName = `restore-cas-${crypto.randomUUID()}`;
    const repo = new ProfileRepository({ dbName });
    const otherWindow = new ProfileRepository({ dbName });
    await repo.open(); await otherWindow.open();
    try {
      const { profileId } = await repo.createProfile({ label: 'Test', password: 'old', data: createEmptyProfileData() });
      const oldBackup = await createBackup(repo, profileId);
      await repo.changePassword(profileId, 'old', 'new');
      const stale = await otherWindow.unlockProfile(profileId, 'new');
      // A restored backup can use any valid encrypted revision, including the
      // revision of the stale window, without changing its AAD.
      const source = new ProfileRepository({ dbName: `${dbName}-source` });
      await source.open();
      try {
        await importBackup(source, oldBackup);
        const original = await source.unlockProfile(profileId, 'old');
        original.data.health.targetEmergencyMonths = 12;
        await source.saveUnlockedProfile(profileId, original.revision, original.encryptionKey, original.data);
        const replacement = await createBackup(source, profileId);
        expect(replacement.profile.vault.revision).toBe(stale.revision);
        await importBackup(repo, replacement, true);
        stale.data.health.targetEmergencyMonths = 99;
        await expect(otherWindow.saveUnlockedProfile(profileId, stale.revision, stale.encryptionKey, stale.data)).rejects.toBeInstanceOf(ProfileConflictError);
        expect((await repo.unlockProfile(profileId, 'old')).data.health.targetEmergencyMonths).toBe(12);
        await expect(repo.unlockProfile(profileId, 'new')).rejects.toThrow();
      } finally { await source.close(); await source.deleteDatabase(); }
    } finally { await otherWindow.close(); await repo.close(); await repo.deleteDatabase(); }
  });
});

