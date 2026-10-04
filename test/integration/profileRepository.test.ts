import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ProfileRepository } from '../../src/persistence/profileRepository.js';
import type { ProfileData } from '../../src/domain/types.js';
import { AuthenticationError, IntegrityError, ProfileConflictError, ProfileNotFoundError } from '../../src/security/errors.js';

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

describe('ProfileRepository integration', () => {
  let repo: ProfileRepository;
  let dbName: string;

  beforeEach(async () => {
    dbName = `folio_test_${Math.random().toString(36).slice(2)}`;
    repo = new ProfileRepository({ dbName });
    await repo.open();
  });

  afterEach(async () => {
    await repo.close();
  });

  it('empty list', async () => {
    const list = await repo.listProfiles();
    expect(list).toEqual([]);
  });

  it('create and list', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: '  My Profile  ', password: 'pw', data });
    expect(sel.label).toBe('My Profile');
    const list = await repo.listProfiles();
    expect(list).toHaveLength(1);
    expect(list[0].profileId).toBe(sel.profileId);
    expect(list[0].label).toBe('My Profile');
  });

  it('selector does not expose secrets', async () => {
    const data = makeProfileData();
    await repo.createProfile({ label: 'P', password: 'pw', data });
    const list = await repo.listProfiles();
    const sel = list[0];
    expect(sel).not.toHaveProperty('salt');
    expect(sel).not.toHaveProperty('verifier');
    expect(sel).not.toHaveProperty('ciphertext');
  });

  it('unlock correct password', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'A', password: 'correct', data });
    const unlocked = await repo.unlockProfile(sel.profileId, 'correct');
    expect(unlocked.profileId).toBe(sel.profileId);
    expect(unlocked.data).toEqual(data);
  });

  it('wrong password throws AuthenticationError', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'A', password: 'correct', data });
    await expect(repo.unlockProfile(sel.profileId, 'wrong')).rejects.toThrow(AuthenticationError);
  });

  it('rename profile', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'Old', password: 'pw', data });
    const renamed = await repo.renameProfile(sel.profileId, 'New');
    expect(renamed.label).toBe('New');
    const list = await repo.listProfiles();
    expect(list[0].label).toBe('New');
  });

  it('rename vs password change concurrency', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'Old', password: 'old', data });
    const unlocked = await repo.unlockProfile(sel.profileId, 'old');

    // Start rename and changePassword concurrently
    const renamePromise = repo.renameProfile(sel.profileId, 'NewLabel');
    const changePromise = repo.changePassword(sel.profileId, 'old', 'new');

    await Promise.allSettled([renamePromise, changePromise]);

    // Profile must remain unlockable
    const finalWithNew = await repo.unlockProfile(sel.profileId, 'new').catch(() => null);
    const finalWithOld = await repo.unlockProfile(sel.profileId, 'old').catch(() => null);
    expect(finalWithNew || finalWithOld).not.toBeNull();

    const password = finalWithNew ? 'new' : 'old';
    const final = await repo.unlockProfile(sel.profileId, password);
    // Label must be one of the two values
    const list = await repo.listProfiles();
    const finalLabel = list.find(p => p.profileId === sel.profileId)?.label;
    expect(['Old', 'NewLabel']).toContain(finalLabel);

    // Ensure cryptographic consistency: revision advanced by exactly 1 if password change won
    expect(final.revision).toBeGreaterThanOrEqual(unlocked.revision);
    expect(final.revision).toBeLessThanOrEqual(unlocked.revision + 1);
  });

  it('delete profile', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'X', password: 'pw', data });
    await repo.deleteProfile(sel.profileId);
    const list = await repo.listProfiles();
    expect(list).toHaveLength(0);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow();
  });

  it('profile isolation', async () => {
    const dataA = makeProfileData();
    dataA.accounts.push({ id: 'a1', name: 'A', type: 'cash', openingBalance: 1, archived: false, createdAt: '' });
    const dataB = makeProfileData();
    dataB.accounts.push({ id: 'b1', name: 'B', type: 'cash', openingBalance: 2, archived: false, createdAt: '' });

    const selA = await repo.createProfile({ label: 'A', password: 'pw', data: dataA });
    const selB = await repo.createProfile({ label: 'B', password: 'pw', data: dataB });

    const uA = await repo.unlockProfile(selA.profileId, 'pw');
    const uB = await repo.unlockProfile(selB.profileId, 'pw');
    expect(uA.data.accounts[0].name).toBe('A');
    expect(uB.data.accounts[0].name).toBe('B');
  });

  it('encryption at rest', async () => {
    const data = makeProfileData();
    const sentinel = 'VERY_PRIVATE_ACCOUNT_SENTINEL_9217';
    data.accounts.push({ id: 's', name: sentinel, type: 'cash', openingBalance: 0, archived: false, createdAt: '' });
    const sel = await repo.createProfile({ label: 'E', password: 'pw', data });

    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    const raw = JSON.stringify(rec);
    expect(raw).not.toContain(sentinel);
    expect(raw).toContain('nonceBase64');
    expect(raw).toContain('ciphertextBase64');
  });

  it('nonce freshness', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'N', password: 'pw', data });
    const unlocked = await repo.unlockProfile(sel.profileId, 'pw');
    const vaults1 = await repo['idb'].getAll<any>('vaults');
    const first = vaults1.find(v => v.profileId === sel.profileId);
    await repo.saveUnlockedProfile(sel.profileId, unlocked.revision, unlocked.encryptionKey, unlocked.data);
    const vaults2 = await repo['idb'].getAll<any>('vaults');
    const second = vaults2.find(v => v.profileId === sel.profileId);
    expect(second.nonceBase64).not.toBe(first.nonceBase64);
  });

  it('tamper detection', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'T', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    const bytes = atob(rec.ciphertextBase64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    arr[0] ^= 1;
    const tamperedB64 = btoa(String.fromCharCode(...arr));
    rec.ciphertextBase64 = tamperedB64;
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('password change', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'C', password: 'old', data });
    await repo.changePassword(sel.profileId, 'old', 'new');
    await expect(repo.unlockProfile(sel.profileId, 'old')).rejects.toThrow(AuthenticationError);
    const unlocked = await repo.unlockProfile(sel.profileId, 'new');
    expect(unlocked.data).toEqual(data);
  });

  it('reopen persistence', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'R', password: 'pw', data });
    await repo.close();
    const repo2 = new ProfileRepository({ dbName });
    await repo2.open();
    const unlocked = await repo2.unlockProfile(sel.profileId, 'pw');
    expect(unlocked.data).toEqual(data);
    await repo2.close();
  });

  it('optimistic concurrency conflict', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'X', password: 'pw', data });
    const u1 = await repo.unlockProfile(sel.profileId, 'pw');
    const u2 = await repo.unlockProfile(sel.profileId, 'pw');
    await repo.saveUnlockedProfile(sel.profileId, u1.revision, u1.encryptionKey, u1.data);
    await expect(repo.saveUnlockedProfile(sel.profileId, u2.revision, u2.encryptionKey, u2.data)).rejects.toThrow(ProfileConflictError);
  });

  it('atomic create failure leaves no partial', async () => {
    const data = makeProfileData();
    await repo.createProfile({ label: 'A', password: 'pw', data });
    const idxBefore = await repo['idb'].getAll<any>('profileIndex');
    const vaultBefore = await repo['idb'].getAll<any>('vaults');
    const idxCountBefore = idxBefore.length;
    const vaultCountBefore = vaultBefore.length;

    // validation failure before transaction - still verifies no partial writes
    await expect(repo.createProfile({ label: '', password: 'pw', data })).rejects.toThrow();
    const idxAfter = await repo['idb'].getAll<any>('profileIndex');
    const vaultAfter = await repo['idb'].getAll<any>('vaults');
    expect(idxAfter.length).toBe(idxCountBefore);
    expect(vaultAfter.length).toBe(vaultCountBefore);
  });

  it('index vault consistency missing vault', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'C', password: 'pw', data });
    await repo['idb'].delete('vaults', sel.profileId);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('index vault consistency missing index', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'D', password: 'pw', data });
    await repo['idb'].delete('profileIndex', sel.profileId);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('index vault consistency neither exists', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'N', password: 'pw', data });
    await repo['idb'].delete('vaults', sel.profileId);
    await repo['idb'].delete('profileIndex', sel.profileId);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(ProfileNotFoundError);
  });

  it('atomic delete removes both stores', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'E', password: 'pw', data });
    await repo.deleteProfile(sel.profileId);
    const idx = await repo['idb'].get<any>('profileIndex', sel.profileId);
    const vault = await repo['idb'].get<any>('vaults', sel.profileId);
    expect(idx).toBeUndefined();
    expect(vault).toBeUndefined();
  });

  it('save requires both index and vault', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'S', password: 'pw', data });
    const unlocked = await repo.unlockProfile(sel.profileId, 'pw');
    await repo['idb'].delete('profileIndex', sel.profileId);
    await expect(repo.saveUnlockedProfile(sel.profileId, unlocked.revision, unlocked.encryptionKey, unlocked.data)).rejects.toThrow(IntegrityError);
    const vaultAfter = await repo['idb'].get<any>('vaults', sel.profileId);
    expect(vaultAfter?.revision).toBe(unlocked.revision);
  });

  it('true simultaneous save race', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'R', password: 'pw', data });
    const uA = await repo.unlockProfile(sel.profileId, 'pw');
    const uB = await repo.unlockProfile(sel.profileId, 'pw');

    const dataA = JSON.parse(JSON.stringify(uA.data));
    dataA.health.targetEmergencyMonths = 7;
    const dataB = JSON.parse(JSON.stringify(uB.data));
    dataB.health.targetEmergencyMonths = 8;

    const saveA = repo.saveUnlockedProfile(sel.profileId, uA.revision, uA.encryptionKey, dataA);
    const saveB = repo.saveUnlockedProfile(sel.profileId, uB.revision, uB.encryptionKey, dataB);
    const results = await Promise.allSettled([saveA, saveB]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ProfileConflictError);

    const final = await repo.unlockProfile(sel.profileId, 'pw');
    expect(final.revision).toBe(uA.revision + 1);
    expect([7, 8]).toContain(final.data.health.targetEmergencyMonths);
  });

  it('vault tamper detection ciphertext', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'T', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    const bytes = atob(rec.ciphertextBase64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    arr[0] ^= 1;
    const tamperedB64 = btoa(String.fromCharCode(...arr));
    rec.ciphertextBase64 = tamperedB64;
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('vault tamper detection nonce', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'T2', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    rec.nonceBase64 = rec.nonceBase64.slice(0, -2) + 'AA';
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('vault schema version unsupported', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'V', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    rec.vaultSchemaVersion = 999;
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow();
  });

  it('cross profile vault swap fails', async () => {
    const dataA = makeProfileData();
    dataA.health.targetEmergencyMonths = 1;
    const dataB = makeProfileData();
    dataB.health.targetEmergencyMonths = 2;
    const selA = await repo.createProfile({ label: 'A', password: 'pw', data: dataA });
    const selB = await repo.createProfile({ label: 'B', password: 'pw', data: dataB });

    const vaults = await repo['idb'].getAll<any>('vaults');
    const recA = vaults.find(v => v.profileId === selA.profileId);
    const recB = vaults.find(v => v.profileId === selB.profileId);
    // swap ciphertexts
    const tmp = recA.ciphertextBase64;
    recA.ciphertextBase64 = recB.ciphertextBase64;
    recB.ciphertextBase64 = tmp;
    await repo['idb'].put('vaults', recA);
    await repo['idb'].put('vaults', recB);

    await expect(repo.unlockProfile(selA.profileId, 'pw')).rejects.toThrow(IntegrityError);
    await expect(repo.unlockProfile(selB.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('KDF metadata tamper iterations', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'K', password: 'pw', data });
    const indexes = await repo['idb'].getAll<any>('profileIndex');
    const rec = indexes.find(i => i.profileId === sel.profileId);
    rec.kdf.iterations = 1;
    await repo['idb'].put('profileIndex', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow();
  });

  it('KDF metadata tamper algorithm', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'KAlg', password: 'pw', data });
    const indexes = await repo['idb'].getAll<any>('profileIndex');
    const rec = indexes.find(i => i.profileId === sel.profileId);
    rec.kdf.algorithm = 'UNSUPPORTED';
    await repo['idb'].put('profileIndex', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow();
  });

  it('KDF metadata tamper hash', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'KHash', password: 'pw', data });
    const indexes = await repo['idb'].getAll<any>('profileIndex');
    const rec = indexes.find(i => i.profileId === sel.profileId);
    rec.kdf.hash = 'SHA-1';
    await repo['idb'].put('profileIndex', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow();
  });

  it('vault cipher tamper', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'Cipher', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    rec.cipher = 'AES-CBC';
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('vault revision AAD tamper', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'RevAAD', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    rec.revision = rec.revision + 1;
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('vault nonce length invalid', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'NonceLen', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    // 11 bytes base64
    rec.nonceBase64 = btoa(String.fromCharCode(...Array(11).fill(0)));
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow(IntegrityError);
  });

  it('vault schema version future', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'FutureSchema', password: 'pw', data });
    const vaults = await repo['idb'].getAll<any>('vaults');
    const rec = vaults.find(v => v.profileId === sel.profileId);
    rec.vaultSchemaVersion = 2;
    await repo['idb'].put('vaults', rec);
    await expect(repo.unlockProfile(sel.profileId, 'pw')).rejects.toThrow();
  });

  it('profile AAD binding same key', async () => {
    const dataA = makeProfileData();
    dataA.health.targetEmergencyMonths = 1;
    const dataB = makeProfileData();
    dataB.health.targetEmergencyMonths = 2;
    const selA = await repo.createProfile({ label: 'A', password: 'same', data: dataA });
    const selB = await repo.createProfile({ label: 'B', password: 'same', data: dataB });

    const indexes = await repo['idb'].getAll<any>('profileIndex');
    const vaults = await repo['idb'].getAll<any>('vaults');
    const idxA = indexes.find(i => i.profileId === selA.profileId);
    const idxB = indexes.find(i => i.profileId === selB.profileId);
    const vaultA = vaults.find(v => v.profileId === selA.profileId);
    const vaultB = vaults.find(v => v.profileId === selB.profileId);

    // Make B use A's KDF material so keys match
    idxB.kdf = idxA.kdf;
    idxB.authVerifierBase64 = idxA.authVerifierBase64;
    await repo['idb'].put('profileIndex', idxB);

    // Transplant A's encrypted vault into B's record (keeping B's profileId)
    const transplantedVault = { ...vaultB, nonceBase64: vaultA.nonceBase64, ciphertextBase64: vaultA.ciphertextBase64, revision: vaultA.revision };
    await repo['idb'].put('vaults', transplantedVault);

    // Unlock B should fail due to AAD profileId binding
    await expect(repo.unlockProfile(selB.profileId, 'same')).rejects.toThrow(IntegrityError);
  });

  it('save vs password change concurrency', async () => {
    const data = makeProfileData();
    const sel = await repo.createProfile({ label: 'C', password: 'old', data });
    const unlocked = await repo.unlockProfile(sel.profileId, 'old');

    const dataMod = JSON.parse(JSON.stringify(unlocked.data));
    dataMod.health.targetEmergencyMonths = 9;

    let releaseBarrier = () => {};
    const barrierPromise = new Promise<void>(resolve => {
      releaseBarrier = () => { resolve(); };
    });

    const repoWithHook = new ProfileRepository({ 
      dbName,
      testHooks: { 
        beforePasswordChangeCommit: async () => {
          await barrierPromise;
        }
      }
    });
    await repoWithHook.open();

    const savePromise = repoWithHook.saveUnlockedProfile(sel.profileId, unlocked.revision, unlocked.encryptionKey, dataMod);
    const changePromise = repoWithHook.changePassword(sel.profileId, 'old', 'new');

    // wait a tick to ensure changePassword has captured revision
    await new Promise(r => setTimeout(r, 0));
    releaseBarrier();

    const results = await Promise.allSettled([savePromise, changePromise]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ProfileConflictError);

    const finalUnlocked = await repoWithHook.unlockProfile(sel.profileId, 'new').catch(() => null);
    const oldUnlocked = await repoWithHook.unlockProfile(sel.profileId, 'old').catch(() => null);
    const canUnlockNew = !!finalUnlocked;
    const canUnlockOld = !!oldUnlocked;
    expect(canUnlockNew !== canUnlockOld).toBe(true);

    const password = canUnlockNew ? 'new' : 'old';
    const final = await repoWithHook.unlockProfile(sel.profileId, password);
    expect(final.revision).toBe(unlocked.revision + 1);

    await repoWithHook.close();
  });
});
