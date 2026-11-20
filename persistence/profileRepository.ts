import {assertKdfPolicy,assertNewPassword,CURRENT_KDF_ITERATIONS,CURRENT_KDF_VERSION} from '../security/credentialPolicy';
import {
  DuplicateProfileError,
  IntegrityError,
  ProfileConflictError,
  ProfileNotFoundError,
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
import {assertEnvelopeForVault,passwordDataKey,generateRecoverySecret,wrapDataKey,wrapRecoveryDataKey,unwrapDataKey,unwrapRecoveryDataKey,importDataKey,type KeyEnvelope} from '../security/keyEnvelope';
import {normalizeProfileData} from '../application/profileData';

export interface ProfileSelector {
  profileId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfileIndexRecord {
  keyEnvelope?:KeyEnvelope;
  writeEpoch?: string;
  profileId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  kdf: {
    version?: number;
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
  verifyPassword: (password: string) => Promise<void>;
}

interface Clock {
  now: () => string;
}
export interface RecoveryCredentialDraft {secret:string;fingerprint:string;commit:()=>Promise<void>;cancel:()=>void}
export type BackupCredential = {method: 'password' | 'recovery'; secret: string};
export type PreparedBackupImport = Readonly<{profileId: string; label: string; replacesExisting: boolean}>;
type BackupImportPayload = {profileId: string; index: ProfileIndexRecord; vault: VaultRecord};
const preparedImports = new WeakMap<PreparedBackupImport, {
  owner: ProfileRepository;
  payload: BackupImportPayload;
  destination: string;
}>();

// Revision numbers can recur after backup restore. Bind each unlocked key to
// the exact vault it read, so stale windows cannot overwrite a restored vault.
const unlockedVaults = new WeakMap<CryptoKey, { identity: string; epoch: string;schemaVersion:1|2 }>();
const vaultIdentity = (vault: VaultRecord) => `${vault.profileId}:${vault.nonceBase64}:${vault.ciphertextBase64}`;

// Retain only authentication metadata, independent of future stored credentials.
function credentialVerifier(salt: Uint8Array, iterations: number, verifier: Uint8Array) {
  return async (password: string): Promise<void> => {
    const keys = await deriveProfileKeys(password, salt, iterations);
    await verifyPasswordVerifier(keys.authKey, verifier);
  };
}

export class ProfileRepository {
  private idb: IDBWrapper;
  private clock: Clock;
  private testHooks?: {
    beforePasswordChangeCommit?: () => Promise<void>;
    beforeBackupVaultWrite?: () => Promise<void>;
    beforeCredentialVaultWrite?:()=>Promise<void>;
  };

  constructor(options: { dbName?: string; clock?: Clock; testHooks?: { beforePasswordChangeCommit?: () => Promise<void>; beforeBackupVaultWrite?: () => Promise<void>;beforeCredentialVaultWrite?:()=>Promise<void> } } = {}) {
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
    assertNewPassword(input.password);

    const profileId = generateProfileId();
    const salt = randomBytes(16);
    const { authKey, encryptionKey } = await deriveProfileKeys(input.password, salt, CURRENT_KDF_ITERATIONS);
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
        iterations: CURRENT_KDF_ITERATIONS,
        version: CURRENT_KDF_VERSION,
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
    const [index, vault] = await this.idb.getPair<ProfileIndexRecord, VaultRecord>('profileIndex', 'vaults', profileId);
    if (!index && !vault) {
      throw new ProfileNotFoundError(profileId);
    }
    if (!index || !vault) {
      throw new IntegrityError('Profile index/vault mismatch');
    }

    assertKdfPolicy(index.kdf);

    const salt = base64ToBytes(index.kdf.saltBase64);
    const { authKey, encryptionKey:passwordKey } = await deriveProfileKeys(password, salt, index.kdf.iterations);
    const storedVerifier = base64ToBytes(index.authVerifierBase64);
    await verifyPasswordVerifier(authKey, storedVerifier);
    assertEnvelopeForVault(index.keyEnvelope,vault.vaultSchemaVersion);
    const encryptionKey=await passwordDataKey(index.keyEnvelope,passwordKey,profileId);
    const data = await decryptVault(encryptionKey, profileId, vault);
    unlockedVaults.set(encryptionKey, { identity: vaultIdentity(vault), epoch: index.writeEpoch ?? '',schemaVersion:vault.vaultSchemaVersion as 1|2 });
    return {
      profileId,
      revision: vault.revision,
      data,
      encryptionKey,
      verifyPassword: credentialVerifier(salt, index.kdf.iterations, storedVerifier),
    };
  }

  async saveUnlockedProfile(
    profileId: string,
    expectedRevision: number,
    encryptionKey: CryptoKey,
    newData: ProfileData
  ): Promise<number> {
    const nextRevision = expectedRevision + 1;
    const newVaultRec = await encryptVault(encryptionKey, profileId, nextRevision, newData,unlockedVaults.get(encryptionKey)?.schemaVersion??1);
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
    unlockedVaults.set(encryptionKey, { identity: vaultIdentity(newVaultRecord), epoch: unlockedVaults.get(encryptionKey)!.epoch,schemaVersion:newVaultRecord.vaultSchemaVersion as 1|2 });
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
    assertNewPassword(newPassword);
    const unlocked = await this.unlockProfile(profileId, oldPassword);
    const records=await this.getProfileRecords(profileId),lease=unlockedVaults.get(unlocked.encryptionKey)!;
    if(vaultIdentity(records.vault)!==lease.identity||(records.index.writeEpoch??'')!==lease.epoch)throw new ProfileConflictError(profileId,unlocked.revision,records.vault.revision);
    const newSalt = randomBytes(16);
    const { authKey, encryptionKey } = await deriveProfileKeys(newPassword, newSalt, CURRENT_KDF_ITERATIONS);
    const verifier = await createPasswordVerifier(authKey);
    let keyEnvelope:KeyEnvelope|undefined;
    if(records.index.keyEnvelope){
      const oldKeys=await deriveProfileKeys(oldPassword,base64ToBytes(records.index.kdf.saltBase64),records.index.kdf.iterations);
      const raw=await unwrapDataKey(records.index.keyEnvelope.password,oldKeys.encryptionKey,profileId,'password');
      try{keyEnvelope={...records.index.keyEnvelope,password:await wrapDataKey(raw,encryptionKey,profileId,'password')};}finally{raw.fill(0);}
    }
    const nextRevision = unlocked.revision + 1;
    const newVaultRec = await encryptVault(keyEnvelope?unlocked.encryptionKey:encryptionKey, profileId, nextRevision, unlocked.data,keyEnvelope?2:1);
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

      existingIndex.kdf = {algorithm: 'PBKDF2', hash: 'SHA-256', version: CURRENT_KDF_VERSION, iterations: CURRENT_KDF_ITERATIONS, saltBase64: bytesToBase64(newSalt)};
      existingIndex.authVerifierBase64 = bytesToBase64(verifier);
      if(keyEnvelope)existingIndex.keyEnvelope=keyEnvelope;
      existingIndex.updatedAt = now;
      await new Promise<void>((resolve, reject) => {
        const req = indexStore.put(existingIndex);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('index put failed'));
      });
    });
  }

  async getRecoveryInfo(profileId:string){
    const {index,vault}=await this.getProfileRecords(profileId);assertEnvelopeForVault(index.keyEnvelope,vault.vaultSchemaVersion);
    return {enabled:!!index.keyEnvelope?.recovery,fingerprint:index.keyEnvelope?.recovery?.fingerprint};
  }

  private async commitCredentials(profileId:string,expected:{identity:string;epoch:string;revision:number},vault:VaultRecord,material:Pick<ProfileIndexRecord,'kdf'|'authVerifierBase64'|'keyEnvelope'>){
    await this.idb.withReadwriteTransaction(['profileIndex','vaults'],async stores=>{
      const read=<T>(store:IDBObjectStore)=>new Promise<T|undefined>((resolve,reject)=>{const req=store.get(profileId);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Credential record read failed'));});
      const index=await read<ProfileIndexRecord>(stores.profileIndex),current=await read<VaultRecord>(stores.vaults);
      if(!index||!current)throw new ProfileNotFoundError(profileId);
      if(vaultIdentity(current)!==expected.identity||(index.writeEpoch??'')!==expected.epoch||current.revision!==expected.revision)throw new ProfileConflictError(profileId,expected.revision,current.revision);
      const now=this.clock.now();const updated={...index,...material,updatedAt:now,writeEpoch:generateProfileId()};
      await new Promise<void>((resolve,reject)=>{const req=stores.profileIndex.put(updated);req.onsuccess=()=>resolve();req.onerror=()=>reject(new Error('Credential index write failed'));});
      await this.testHooks?.beforeCredentialVaultWrite?.();
      await new Promise<void>((resolve,reject)=>{const req=stores.vaults.put({...vault,updatedAt:now});req.onsuccess=()=>resolve();req.onerror=()=>reject(new Error('Credential vault write failed'));});
    });
  }

  async prepareRecoveryCredential(profileId:string,password:string):Promise<RecoveryCredentialDraft>{
    const unlocked=await this.unlockProfile(profileId,password),records=await this.getProfileRecords(profileId),lease=unlockedVaults.get(unlocked.encryptionKey)!;
    if(vaultIdentity(records.vault)!==lease.identity||(records.index.writeEpoch??'')!==lease.epoch)throw new ProfileConflictError(profileId,unlocked.revision,records.vault.revision);
    const data=normalizeProfileData(unlocked.data),secret=await generateRecoverySecret(),raw=randomBytes(32),salt=randomBytes(16);
    let envelope:KeyEnvelope,vault:VaultRecord,verifier:Uint8Array;
    try{
      const keys=await deriveProfileKeys(password,salt,CURRENT_KDF_ITERATIONS);verifier=await createPasswordVerifier(keys.authKey);
      envelope={version:2,password:await wrapDataKey(raw,keys.encryptionKey,profileId,'password'),recovery:await wrapRecoveryDataKey(raw,secret,profileId)};
      const key=await importDataKey(raw);vault={profileId,...await encryptVault(key,profileId,unlocked.revision+1,data,2)};
    }finally{raw.fill(0);}
    let consumed=false;
    return {secret,fingerprint:envelope.recovery!.fingerprint,cancel:()=>{consumed=true;},commit:async()=>{
      if(consumed)throw new Error('This recovery draft has already been used or canceled');consumed=true;
      await this.commitCredentials(profileId,{identity:lease.identity,epoch:lease.epoch,revision:unlocked.revision},vault,{kdf:{algorithm:'PBKDF2',hash:'SHA-256',iterations:CURRENT_KDF_ITERATIONS,version:CURRENT_KDF_VERSION,saltBase64:bytesToBase64(salt)},authVerifierBase64:bytesToBase64(verifier),keyEnvelope:envelope});
    }};
  }

  async recoverProfile(profileId:string,secret:string,newPassword:string):Promise<void>{
    assertNewPassword(newPassword);const {index,vault}=await this.getProfileRecords(profileId);assertEnvelopeForVault(index.keyEnvelope,vault.vaultSchemaVersion);
    const recovery=index.keyEnvelope?.recovery;if(!recovery)throw new Error('Recovery was not configured for this profile. ANVA cannot recover it');
    const oldRaw=await unwrapRecoveryDataKey(recovery,secret,profileId);let data:ProfileData;
    try{data=normalizeProfileData(await decryptVault(await importDataKey(oldRaw),profileId,vault));}finally{oldRaw.fill(0);}
    const raw=randomBytes(32),salt=randomBytes(16);
    try{
      const keys=await deriveProfileKeys(newPassword,salt,CURRENT_KDF_ITERATIONS),verifier=await createPasswordVerifier(keys.authKey);
      const keyEnvelope:KeyEnvelope={version:2,password:await wrapDataKey(raw,keys.encryptionKey,profileId,'password'),recovery:await wrapRecoveryDataKey(raw,secret,profileId)};
      const next={profileId,...await encryptVault(await importDataKey(raw),profileId,vault.revision+1,data,2)};
      await this.commitCredentials(profileId,{identity:vaultIdentity(vault),epoch:index.writeEpoch??'',revision:vault.revision},next,{kdf:{algorithm:'PBKDF2',hash:'SHA-256',iterations:CURRENT_KDF_ITERATIONS,version:CURRENT_KDF_VERSION,saltBase64:bytesToBase64(salt)},authVerifierBase64:bytesToBase64(verifier),keyEnvelope});
    }finally{raw.fill(0);}
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
    const [index, vault] = await this.idb.getPair<ProfileIndexRecord, VaultRecord>('profileIndex', 'vaults', profileId);
    if (!index && !vault) {
      throw new ProfileNotFoundError(profileId);
    }
    if (!index || !vault) {
      throw new IntegrityError('Profile index/vault mismatch');
    }
    return { index, vault };
  }

  async prepareBackupImport(payload: BackupImportPayload, credential: BackupCredential): Promise<PreparedBackupImport> {
    const copy = structuredClone(payload);
    const {profileId, index, vault} = copy;
    if (index.profileId !== profileId || vault.profileId !== profileId) {
      throw new IntegrityError('Profile ID mismatch between index and vault');
    }
    const destination = await this.idb.getPair<ProfileIndexRecord, VaultRecord>('profileIndex', 'vaults', profileId);
    const [destinationIndex, destinationVault] = destination;
    if (!!destinationIndex !== !!destinationVault) throw new IntegrityError('Profile index/vault mismatch');
    if (!credential?.secret) throw new Error('Enter the backup password or recovery credential');
    assertEnvelopeForVault(index.keyEnvelope, vault.vaultSchemaVersion);
    assertKdfPolicy(index.kdf);
    let key: CryptoKey;
    if (credential.method === 'password') {
      const keys = await deriveProfileKeys(credential.secret, base64ToBytes(index.kdf.saltBase64), index.kdf.iterations);
      await verifyPasswordVerifier(keys.authKey, base64ToBytes(index.authVerifierBase64));
      key = await passwordDataKey(index.keyEnvelope, keys.encryptionKey, profileId);
    } else if (credential.method === 'recovery' && index.keyEnvelope?.recovery) {
      const raw = await unwrapRecoveryDataKey(index.keyEnvelope.recovery, credential.secret, profileId);
      try { key = await importDataKey(raw); } finally { raw.fill(0); }
    } else {
      throw new Error('This backup has no supported recovery credential');
    }
    // Normalize and check all financial invariants before granting write authority.
    // Keep the original authenticated ciphertext and schema for legacy compatibility.
    normalizeProfileData(await decryptVault(key, profileId, vault));
    const candidate = Object.freeze({profileId, label: destinationIndex?.label ?? index.label, replacesExisting: !!destinationIndex});
    preparedImports.set(candidate, {owner: this, payload: copy, destination: JSON.stringify(destination)});
    return candidate;
  }

  async commitBackupImport(candidate: PreparedBackupImport, replace = false): Promise<void> {
    const prepared = preparedImports.get(candidate);
    if (!prepared || prepared.owner !== this) throw new Error('Verify the backup again before importing');
    preparedImports.delete(candidate);
    const {payload, destination} = prepared;
    const {profileId, index, vault} = payload;
    await this.writeBackupImport(profileId, index, vault, destination, replace);
  }

  async importProfileBackup(payload: {
    profileId: string;
    index: ProfileIndexRecord;
    vault: VaultRecord;
    replace?: boolean;
  }, credential: BackupCredential): Promise<void> {
    const candidate = await this.prepareBackupImport(payload, credential);
    await this.commitBackupImport(candidate, payload.replace);
  }

  private async writeBackupImport(profileId: string, index: ProfileIndexRecord, vault: VaultRecord, destination: string, replace = false): Promise<void> {
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
      if (JSON.stringify([existingIndex, existingVault]) !== destination) {
        throw new ProfileConflictError(profileId, 0, existingVault?.revision ?? 0);
      }

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

