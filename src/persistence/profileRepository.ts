import {
  DuplicateProfileError,
  IntegrityError,
  ProfileConflictError,
  ProfileNotFoundError,
  UnsupportedVaultVersionError,
} from '../security/errors.js';
import {
  randomBytes,
  generateProfileId,
  deriveProfileKeys,
  createPasswordVerifier,
  verifyPasswordVerifier,
} from '../security/crypto.js';
import { bytesToBase64, base64ToBytes } from '../security/encoding.js';
import { IDBWrapper } from './idb.js';
import { encryptVault, decryptVault, type VaultRecord } from './vault.js';
import type { ProfileData } from '../domain/types.js';

export interface ProfileSelector {
  profileId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfileIndexRecord {
  writeEpoch?: string;
  profileId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  kdf: {
    algorithm: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    saltBase64: string;
  };
  authVerifierBase64: string;
}

interface CreateProfileInput {
  label: string;
  password: string;
  data: ProfileData;
}

interface UnlockedMaterial {
  profileId: string;
  revision: number;
  data: ProfileData;
  encryptionKey: CryptoKey;
}

interface Clock {
  now: () => string;
}

// Revision numbers can recur after backup restore. Bind each unlocked key to
// the exact vault it read, so stale windows cannot overwrite a restored vault.
const unlockedVaults = new WeakMap<CryptoKey, { identity: string; epoch: string }>();
const vaultIdentity = (vault: VaultRecord) => `${vault.profileId}:${vault.nonceBase64}:${vault.ciphertextBase64}`;

export class ProfileRepository {
  private idb: IDBWrapper;
  private clock: Clock;
  private testHooks?: {
    beforePasswordChangeCommit?: () => Promise<void>;
    beforeBackupVaultWrite?: () => Promise<void>;
  };

  constructor(options: { dbName?: string; clock?: Clock; testHooks?: { beforePasswordChangeCommit?: () => Promise<void>; beforeBackupVaultWrite?: () => Promise<void> } } = {}) {
    this.idb = new IDBWrapper({ dbName: options.dbName });
    this.clock = options.clock ?? { now: () => new Date().toISOString() };
    this.testHooks = options.testHooks;
  }

  async open(): Promise<void> {
    await this.idb.open();
  }

  async close(): Promise<void> {
    await this.idb.close();
  }

  async deleteDatabase(): Promise<void> {
    await this.idb.deleteDatabase();
  }

  async listProfiles(): Promise<ProfileSelector[]> {
    const records = await this.idb.getAll<ProfileIndexRecord>('profileIndex');
    const selectors: ProfileSelector[] = records.map(r => ({
      profileId: r.profileId,
      label: r.label,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    selectors.sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      return a.profileId.localeCompare(b.profileId);
    });
    return selectors;
  }

  async createProfile(input: CreateProfileInput): Promise<ProfileSelector> {
    const label = input.label.trim();
    if (!label) throw new Error('Label must be non-empty');
    if (!input.password || input.password.length === 0) throw new Error('Password required');

    const profileId = generateProfileId();
    const salt = randomBytes(16);
    const { authKey, encryptionKey } = await deriveProfileKeys(input.password, salt);
    const verifier = await createPasswordVerifier(authKey);
    const now = this.clock.now();

    const indexRecord: ProfileIndexRecord = {
      profileId,
      label,
      createdAt: now,
      updatedAt: now,
      kdf: {
        algorithm: 'PBKDF2',
        hash: 'SHA-256',
        iterations: 310_000,
        saltBase64: bytesToBase64(salt),
      },
      authVerifierBase64: bytesToBase64(verifier),
    };

    const vaultRec = await encryptVault(encryptionKey, profileId, 1, input.data);
    const vaultRecord: VaultRecord = { profileId, ...vaultRec };

    await this.idb.withReadwriteTransaction(['profileIndex', 'vaults'], async (stores) => {
      // get returns IDBRequest; need to wait via promise
      const existingRecord = await new Promise<ProfileIndexRecord | undefined>((resolve, reject) => {
        const req = (stores.profileIndex as IDBObjectStore).get(profileId);
        req.onsuccess = () => resolve(req.result as ProfileIndexRecord | undefined);
        req.onerror = () => reject(new Error('get failed'));
      });
      if (existingRecord) throw new DuplicateProfileError(profileId);

      await new Promise<void>((resolve, reject) => {
        const req = stores.profileIndex.add(indexRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('add profileIndex failed'));
      });
      await new Promise<void>((resolve, reject) => {
        const req = stores.vaults.add(vaultRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('add vault failed'));
      });
    });

    return {
      profileId,
      label,
      createdAt: now,
      updatedAt: now,
    };
  }

  async unlockProfile(profileId: string, password: string): Promise<UnlockedMaterial> {
    const [index, vault] = await Promise.all([
      this.idb.get<ProfileIndexRecord>('profileIndex', profileId),
      this.idb.get<VaultRecord>('vaults', profileId),
    ]);
    if (!index && !vault) {
      throw new ProfileNotFoundError(profileId);
    }
    if (!index || !vault) {
      throw new IntegrityError('Profile index/vault mismatch');
    }

    // validate KDF metadata
    if (index.kdf.algorithm !== 'PBKDF2' || index.kdf.hash !== 'SHA-256' || index.kdf.iterations !== 310_000) {
      throw new UnsupportedVaultVersionError(1);
    }

    const salt = base64ToBytes(index.kdf.saltBase64);
    const { authKey, encryptionKey } = await deriveProfileKeys(password, salt);
    const storedVerifier = base64ToBytes(index.authVerifierBase64);
    await verifyPasswordVerifier(authKey, storedVerifier);

    const data = await decryptVault(encryptionKey, profileId, vault);
    unlockedVaults.set(encryptionKey, { identity: vaultIdentity(vault), epoch: index.writeEpoch ?? '' });
    return {
      profileId,
      revision: vault.revision,
      data,
      encryptionKey,
    };
  }

  async saveUnlockedProfile(
    profileId: string,
    expectedRevision: number,
    encryptionKey: CryptoKey,
    newData: ProfileData
  ): Promise<number> {
    const nextRevision = expectedRevision + 1;
    const newVaultRec = await encryptVault(encryptionKey, profileId, nextRevision, newData);
    const newVaultRecord: VaultRecord = { profileId, ...newVaultRec };
    const now = this.clock.now();

    const revision = await this.idb.withReadwriteTransaction(['vaults', 'profileIndex'], async (stores) => {
      const vaultStore = stores.vaults as IDBObjectStore;
      const indexStore = stores.profileIndex as IDBObjectStore;

      const existingVault = await new Promise<VaultRecord | undefined>((resolve, reject) => {
        const req = vaultStore.get(profileId);
        req.onsuccess = () => resolve(req.result as VaultRecord | undefined);
        req.onerror = () => reject(new Error('vault get failed'));
      });
      if (!existingVault) throw new ProfileNotFoundError(profileId);

      const existingIndex = await new Promise<ProfileIndexRecord | undefined>((resolve, reject) => {
        const req = indexStore.get(profileId);
        req.onsuccess = () => resolve(req.result as ProfileIndexRecord | undefined);
        req.onerror = () => reject(new Error('index get failed'));
      });
      if (!existingIndex) {
        throw new IntegrityError('Profile index missing for vault');
      }

      const lease = unlockedVaults.get(encryptionKey);
      if (existingVault.revision !== expectedRevision || lease?.identity !== vaultIdentity(existingVault) || lease.epoch !== (existingIndex.writeEpoch ?? '')) {
        throw new ProfileConflictError(profileId, expectedRevision, existingVault.revision);
      }

      await new Promise<void>((resolve, reject) => {
        const req = vaultStore.put(newVaultRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('vault put failed'));
      });

      existingIndex.updatedAt = now;
      await new Promise<void>((resolve, reject) => {
        const req = indexStore.put(existingIndex);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('index put failed'));
      });

      return nextRevision;
    });
    unlockedVaults.set(encryptionKey, { identity: vaultIdentity(newVaultRecord), epoch: unlockedVaults.get(encryptionKey)!.epoch });
    return revision;
  }

  async renameProfile(profileId: string, newLabel: string): Promise<ProfileSelector> {
    const label = newLabel.trim();
    if (!label) throw new Error('Label must be non-empty');
    const now = this.clock.now();
    return await this.idb.withReadwriteTransaction(['profileIndex', 'vaults'], async (stores) => {
      const indexStore = stores.profileIndex as IDBObjectStore;
      const vaultStore = stores.vaults as IDBObjectStore;

      const existingIndex = await new Promise<ProfileIndexRecord | undefined>((resolve, reject) => {
        const req = indexStore.get(profileId);
        req.onsuccess = () => resolve(req.result as ProfileIndexRecord | undefined);
        req.onerror = () => reject(new Error('index get failed'));
      });

      const existingVault = await new Promise<VaultRecord | undefined>((resolve, reject) => {
        const req = vaultStore.get(profileId);
        req.onsuccess = () => resolve(req.result as VaultRecord | undefined);
        req.onerror = () => reject(new Error('vault get failed'));
      });

      if (!existingIndex && !existingVault) {
        throw new ProfileNotFoundError(profileId);
      }
      if (!existingIndex || !existingVault) {
        throw new IntegrityError('Profile index/vault mismatch');
      }

      const updatedIndex = { ...existingIndex, label, updatedAt: now };
      await new Promise<void>((resolve, reject) => {
        const req = indexStore.put(updatedIndex);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('index put failed'));
      });

      return {
        profileId,
        label,
        createdAt: existingIndex.createdAt,
        updatedAt: now,
      };
    });
  }

  async changePassword(
    profileId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!newPassword || newPassword.length === 0) throw new Error('New password required');
    const unlocked = await this.unlockProfile(profileId, oldPassword);
    const newSalt = randomBytes(16);
    const { authKey, encryptionKey } = await deriveProfileKeys(newPassword, newSalt);
    const verifier = await createPasswordVerifier(authKey);
    const nextRevision = unlocked.revision + 1;
    const newVaultRec = await encryptVault(encryptionKey, profileId, nextRevision, unlocked.data);
    const newVaultRecord: VaultRecord = { profileId, ...newVaultRec };
    const now = this.clock.now();

    if (this.testHooks?.beforePasswordChangeCommit) {
      await this.testHooks.beforePasswordChangeCommit();
    }

    await this.idb.withReadwriteTransaction(['vaults', 'profileIndex'], async (stores) => {
      const vaultStore = stores.vaults as IDBObjectStore;
      const indexStore = stores.profileIndex as IDBObjectStore;

      const existingVault = await new Promise<VaultRecord | undefined>((resolve, reject) => {
        const req = vaultStore.get(profileId);
        req.onsuccess = () => resolve(req.result as VaultRecord | undefined);
        req.onerror = () => reject(new Error('vault get failed'));
      });
      if (!existingVault) throw new ProfileNotFoundError(profileId);

      const existingIndex = await new Promise<ProfileIndexRecord | undefined>((resolve, reject) => {
        const req = indexStore.get(profileId);
        req.onsuccess = () => resolve(req.result as ProfileIndexRecord | undefined);
        req.onerror = () => reject(new Error('index get failed'));
      });
      if (!existingIndex) throw new ProfileNotFoundError(profileId);

      const lease = unlockedVaults.get(unlocked.encryptionKey);
      if (existingVault.revision !== unlocked.revision || lease?.identity !== vaultIdentity(existingVault) || lease.epoch !== (existingIndex.writeEpoch ?? '')) {
        throw new ProfileConflictError(profileId, unlocked.revision, existingVault.revision);
      }

      await new Promise<void>((resolve, reject) => {
        const req = vaultStore.put(newVaultRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('vault put failed'));
      });

      existingIndex.kdf.saltBase64 = bytesToBase64(newSalt);
      existingIndex.authVerifierBase64 = bytesToBase64(verifier);
      existingIndex.updatedAt = now;
      await new Promise<void>((resolve, reject) => {
        const req = indexStore.put(existingIndex);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('index put failed'));
      });
    });
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.idb.withReadwriteTransaction(['profileIndex', 'vaults'], async (stores) => {
      const indexStore = stores.profileIndex as IDBObjectStore;
      const vaultStore = stores.vaults as IDBObjectStore;

      const existingIndex = await new Promise<ProfileIndexRecord | undefined>((resolve, reject) => {
        const req = indexStore.get(profileId);
        req.onsuccess = () => resolve(req.result as ProfileIndexRecord | undefined);
        req.onerror = () => reject(new Error('index get failed'));
      });
      if (!existingIndex) throw new ProfileNotFoundError(profileId);

      await new Promise<void>((resolve, reject) => {
        const req = indexStore.delete(profileId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('index delete failed'));
      });
      await new Promise<void>((resolve, reject) => {
        const req = vaultStore.delete(profileId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('vault delete failed'));
      });
    });
  }

  async getProfileRecords(profileId: string): Promise<{ index: ProfileIndexRecord; vault: VaultRecord }> {
    const [index, vault] = await Promise.all([
      this.idb.get<ProfileIndexRecord>('profileIndex', profileId),
      this.idb.get<VaultRecord>('vaults', profileId),
    ]);
    if (!index && !vault) {
      throw new ProfileNotFoundError(profileId);
    }
    if (!index || !vault) {
      throw new IntegrityError('Profile index/vault mismatch');
    }
    return { index, vault };
  }

  async importProfileBackup(payload: {
    profileId: string;
    index: ProfileIndexRecord;
    vault: VaultRecord;
    replace?: boolean;
  }): Promise<void> {
    const { profileId, index, vault, replace } = payload;
    if (index.profileId !== profileId || vault.profileId !== profileId) {
      throw new IntegrityError('Profile ID mismatch between index and vault');
    }
    await this.idb.withReadwriteTransaction(['profileIndex', 'vaults'], async (stores) => {
      const indexStore = stores.profileIndex as IDBObjectStore;
      const vaultStore = stores.vaults as IDBObjectStore;

      const existingIndex = await new Promise<ProfileIndexRecord | undefined>((resolve, reject) => {
        const req = indexStore.get(profileId);
        req.onsuccess = () => resolve(req.result as ProfileIndexRecord | undefined);
        req.onerror = () => reject(new Error('index get failed'));
      });

      const existingVault = await new Promise<VaultRecord | undefined>((resolve, reject) => {
        const req = vaultStore.get(profileId);
        req.onsuccess = () => resolve(req.result as VaultRecord | undefined);
        req.onerror = () => reject(new Error('vault get failed'));
      });

      const hasIndex = !!existingIndex;
      const hasVault = !!existingVault;

      if (!hasIndex && !hasVault) {
        if (replace) {
          throw new ProfileNotFoundError(profileId);
        }
        // allow insert
      } else if (hasIndex && hasVault) {
        if (!replace) {
          throw new DuplicateProfileError(profileId);
        }
        // replace allowed
      } else {
        // one exists, one missing
        throw new IntegrityError('Profile index/vault mismatch');
      }

      // Write index and vault atomically
      await new Promise<void>((resolve, reject) => {
        const req = indexStore.put({ ...index, writeEpoch: generateProfileId() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('index put failed'));
      });

      if (this.testHooks?.beforeBackupVaultWrite) {
        await this.testHooks.beforeBackupVaultWrite();
      }

      await new Promise<void>((resolve, reject) => {
        const req = vaultStore.put(vault);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('vault put failed'));
      });
    });
  }
}
