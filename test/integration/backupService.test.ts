import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileRepository } from '../../src/persistence/profileRepository.js';
import { createBackup, importBackup } from '../../src/application/backupService.js';
import { BackupValidationError, UnsupportedBackupVersionError, BackupCollisionError } from '../../src/application/backupErrors.js';
import { createEmptyProfileData } from '../../src/application/profileData.js';
import type { ProfileData } from '../../src/domain/types.js';

describe('backupService integration', () => {
  let repo: ProfileRepository;
  const dbName = `test-backup-${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    repo = new ProfileRepository({ dbName });
    await repo.open();
  });

  afterEach(async () => {
    await repo.close();
    await repo.deleteDatabase();
  });

  it('round-trip backup and import', async () => {
    const data: ProfileData = createEmptyProfileData();
    data.accounts.push({ id: 'a1', name: 'Cash', type: 'cash', openingBalance: 1000, archived: false, createdAt: new Date().toISOString() });
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data });
    const backup = await createBackup(repo, created.profileId);
    const repo2 = new ProfileRepository({ dbName: dbName + '-2' });
    await repo2.open();
    await importBackup(repo2, backup, false);
    const { data: imported } = await repo2.unlockProfile(created.profileId, 'pass123');
    expect(imported.accounts[0].name).toBe('Cash');
    await repo2.close();
    await repo2.deleteDatabase();
  });

  it('wrong password fails unlock', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    const repo2 = new ProfileRepository({ dbName: dbName + '-3' });
    await repo2.open();
    await importBackup(repo2, backup, false);
    await expect(repo2.unlockProfile(created.profileId, 'wrong')).rejects.toThrow();
    await repo2.close();
    await repo2.deleteDatabase();
  });

  it('backup does not contain secrets', async () => {
    const data: ProfileData = createEmptyProfileData();
    data.accounts.push({ id: 'a1', name: 'PRIVATE_ACCOUNT_MARKER', type: 'cash', openingBalance: 1000, archived: false, createdAt: new Date().toISOString() });
    data.categories.push({ id: 'c-secret', name: 'Secret Category', kind: 'expense' });
    data.txns.push({ id: 't1', accountId: 'a1', type: 'expense', amount: 10, categoryId: 'c-secret', note: 'FOLIO_BACKUP_SECRET_123', date: '2026-01-01', createdAt: new Date().toISOString() });
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data });
    const backup = await createBackup(repo, created.profileId);
    const json = JSON.stringify(backup);
    expect(json).not.toContain('PRIVATE_ACCOUNT_MARKER');
    expect(json).not.toContain('FOLIO_BACKUP_SECRET_123');
  });

  it('malformed backup rejected', async () => {
    const bad = { format: 'folio-encrypted-backup' };
    await expect(importBackup(repo, bad as any, false)).rejects.toThrow(BackupValidationError);
  });

  it('future backupVersion rejected', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    (backup as any).backupVersion = 999;
    await expect(importBackup(repo, backup, false)).rejects.toThrow(UnsupportedBackupVersionError);
  });

  it('collision throws BackupCollisionError', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    await expect(importBackup(repo, backup, false)).rejects.toThrow(BackupCollisionError);
  });

  it('explicit replacement works', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    await importBackup(repo, backup, true);
    const rec = await repo.getProfileRecords(created.profileId);
    expect(rec.index.profileId).toBe(created.profileId);
  });

  // orphan index rejected test removed - superseded by index-only and vault-only orphan tests

  it('beforeBackupVaultWrite hook aborts transaction', async () => {
    const repoHook = new ProfileRepository({
      dbName: dbName + '-hook',
      testHooks: { beforeBackupVaultWrite: async () => { throw new Error('abort'); } }
    });
    await repoHook.open();
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    await expect(importBackup(repoHook, backup, false)).rejects.toThrow('abort');
    // original repo unchanged
    const rec = await repo.getProfileRecords(created.profileId);
    expect(rec.index.label).toBe('Test');
    // destination unchanged
    const list = await repoHook.listProfiles();
    expect(list).toHaveLength(0);
    await repoHook.close();
    await repoHook.deleteDatabase();
  });

  it('index-only orphan rejected', async () => {
    const repo2 = new ProfileRepository({ dbName: dbName + '-index-orphan' });
    await repo2.open();
    // create profile then delete vault manually to create index-only orphan
    const created = await repo.createProfile({ label: 'IdxOnly', password: 'pw', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    // Manually insert index only into repo2
    const idb = (repo2 as any).idb;
    await idb.withReadwriteTransaction(['profileIndex'], async (stores: Record<string, IDBObjectStore>) => {
      const idxStore = stores.profileIndex as IDBObjectStore;
      await new Promise<void>((resolve, reject) => {
        const req = idxStore.put({
          profileId: created.profileId,
          label: 'IdxOnly',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 310000, saltBase64: 'AAAAAAAAAAAAAAAAAAAAAA==' },
          authVerifierBase64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('put failed'));
      });
    });
    await expect(importBackup(repo2, backup, false)).rejects.toThrow();
    await repo2.close();
    await repo2.deleteDatabase();
  });

  it('vault-only orphan rejected', async () => {
    const repo2 = new ProfileRepository({ dbName: dbName + '-vault-orphan' });
    await repo2.open();
    const created = await repo.createProfile({ label: 'VaultOnly', password: 'pw', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    // Manually insert vault only
    const idb = (repo2 as any).idb;
    await idb.withReadwriteTransaction(['vaults'], async (stores: Record<string, IDBObjectStore>) => {
      const vaultStore = stores.vaults as IDBObjectStore;
      await new Promise<void>((resolve, reject) => {
        const req = vaultStore.put(backup.profile.vault);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('put failed'));
      });
    });
    await expect(importBackup(repo2, backup, false)).rejects.toThrow();
    await repo2.close();
    await repo2.deleteDatabase();
  });

  it('replacement rollback preserves previous destination', async () => {
    const dbNameDst = dbName + '-replace-rollback-dst';
    const repoDst = new ProfileRepository({ dbName: dbNameDst });
    await repoDst.open();
    const existingData = createEmptyProfileData();
    existingData.accounts.push({ id: 'e1', name: 'Existing', type: 'cash', openingBalance: 100, archived: false, createdAt: new Date().toISOString() });
    const existing = await repoDst.createProfile({ label: 'Existing', password: 'pw', data: existingData });
    const before = await repoDst.getProfileRecords(existing.profileId);

    const backup = await createBackup(repoDst, existing.profileId);
    // modify backup to change label
    const backupCopy = JSON.parse(JSON.stringify(backup));
    backupCopy.profile.index.label = 'Changed';

    // attempt import with failing hook on SAME dbName
    const repoFail = new ProfileRepository({
      dbName: dbNameDst,
      testHooks: { beforeBackupVaultWrite: async () => { throw new Error('abort'); } }
    });
    await repoFail.open();
    await expect(importBackup(repoFail, backupCopy, true)).rejects.toThrow('abort');
    await repoFail.close();

    // verify unchanged
    const after = await repoDst.getProfileRecords(existing.profileId);
    expect(after.index).toEqual(before.index);
    expect(after.vault).toEqual(before.vault);

    await repoDst.close();
    await repoDst.deleteDatabase();
  });

  it('profileId mismatch rejected', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    backup.profile.vault.profileId = 'different-id';
    await expect(importBackup(repo, backup, false)).rejects.toThrow();
  });

  it('rejects truncated ciphertext before replacing the existing profile', async () => {
    const { profileId } = await repo.createProfile({ label: 'Safe', password: 'pw', data: createEmptyProfileData() });
    const before = await repo.getProfileRecords(profileId);
    const backup = await createBackup(repo, profileId);
    backup.profile.vault.ciphertextBase64 = btoa('truncated');
    await expect(importBackup(repo, backup, true)).rejects.toBeInstanceOf(BackupValidationError);
    expect(await repo.getProfileRecords(profileId)).toEqual(before);
  });
  it('bad nonce rejected', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    backup.profile.vault.nonceBase64 = '!!invalid!!';
    await expect(importBackup(repo, backup, false)).rejects.toThrow(BackupValidationError);
  });

  it('bad salt rejected', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    backup.profile.index.kdf.saltBase64 = '!!';
    await expect(importBackup(repo, backup, false)).rejects.toThrow(BackupValidationError);
  });

  it('future vault version rejected', async () => {
    const created = await repo.createProfile({ label: 'Test', password: 'pass123', data: createEmptyProfileData() });
    const backup = await createBackup(repo, created.profileId);
    backup.profile.vault.vaultSchemaVersion = 999;
    await expect(importBackup(repo, backup, false)).rejects.toThrow();
  });
});

