import { ProfileRepository } from '../persistence/profileRepository.js';
import { DuplicateProfileError, UnsupportedVaultVersionError } from '../security/errors.js';
import { PBKDF2_ITERATIONS, CURRENT_VAULT_SCHEMA_VERSION } from '../security/crypto.js';
import { base64ToBytes } from '../security/encoding.js';
import { BackupValidationError, UnsupportedBackupVersionError, BackupCollisionError } from './backupErrors.js';
import type { VaultRecord } from '../persistence/vault.js';

export interface BackupProfilePayload {
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

export interface BackupFile {
  format: 'folio-encrypted-backup';
  backupVersion: number;
  exportedAt: string;
  profile: {
    index: BackupProfilePayload;
    vault: VaultRecord;
  };
}

const BACKUP_VERSION = 1;
const FORMAT = 'folio-encrypted-backup';

function nowIso(): string {
  return new Date().toISOString();
}

export function validateBackup(raw: unknown): BackupFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new BackupValidationError('Backup must be an object');
  }
  const obj = raw as any;

  if (obj.format !== FORMAT) {
    throw new BackupValidationError('Invalid backup format');
  }
  if (typeof obj.backupVersion !== 'number' || !Number.isInteger(obj.backupVersion)) {
    throw new BackupValidationError('Invalid backup version');
  }
  if (obj.backupVersion < BACKUP_VERSION) {
    throw new BackupValidationError('Backup version too old');
  }
  if (obj.backupVersion > BACKUP_VERSION) {
    throw new UnsupportedBackupVersionError(obj.backupVersion);
  }
  if (typeof obj.exportedAt !== 'string' || obj.exportedAt.length === 0) {
    throw new BackupValidationError('Missing exportedAt');
  }
  if (typeof obj.profile !== 'object' || obj.profile === null) {
    throw new BackupValidationError('Missing profile');
  }

  const profile = obj.profile;
  const index = profile.index;
  const vault = profile.vault;

  if (typeof index !== 'object' || index === null) {
    throw new BackupValidationError('Missing index');
  }
  if (typeof vault !== 'object' || vault === null) {
    throw new BackupValidationError('Missing vault');
  }

  // Index validation
  if (typeof index.profileId !== 'string' || index.profileId.length === 0) {
    throw new BackupValidationError('Invalid index profileId');
  }
  if (typeof index.label !== 'string') {
    throw new BackupValidationError('Invalid index label');
  }
  if (typeof index.createdAt !== 'string' || index.createdAt.length === 0) {
    throw new BackupValidationError('Invalid index createdAt');
  }
  if (typeof index.updatedAt !== 'string' || index.updatedAt.length === 0) {
    throw new BackupValidationError('Invalid index updatedAt');
  }
  if (typeof index.kdf !== 'object' || index.kdf === null) {
    throw new BackupValidationError('Missing index kdf');
  }
  const kdf = index.kdf;
  if (kdf.algorithm !== 'PBKDF2') {
    throw new BackupValidationError('Unsupported KDF algorithm');
  }
  if (kdf.hash !== 'SHA-256') {
    throw new BackupValidationError('Unsupported KDF hash');
  }
  if (kdf.iterations !== PBKDF2_ITERATIONS) {
    throw new BackupValidationError('Invalid KDF iterations');
  }
  if (typeof kdf.saltBase64 !== 'string') {
    throw new BackupValidationError('Missing salt');
  }
  try {
    const saltBytes = base64ToBytes(kdf.saltBase64);
    if (saltBytes.length !== 16) {
      throw new BackupValidationError('Invalid salt length');
    }
  } catch {
    throw new BackupValidationError('Invalid salt base64');
  }
  if (typeof index.authVerifierBase64 !== 'string') {
    throw new BackupValidationError('Missing auth verifier');
  }
  try {
    const verifierBytes = base64ToBytes(index.authVerifierBase64);
    if (verifierBytes.length !== 32) {
      throw new BackupValidationError('Invalid auth verifier length');
    }
  } catch {
    throw new BackupValidationError('Invalid auth verifier base64');
  }

  // Vault validation
  if (typeof vault.profileId !== 'string' || vault.profileId.length === 0) {
    throw new BackupValidationError('Invalid vault profileId');
  }
  if (vault.profileId !== index.profileId) {
    throw new BackupValidationError('Profile ID mismatch between index and vault');
  }
  if (vault.vaultSchemaVersion !== CURRENT_VAULT_SCHEMA_VERSION) {
    if (vault.vaultSchemaVersion > CURRENT_VAULT_SCHEMA_VERSION) {
      throw new UnsupportedVaultVersionError(vault.vaultSchemaVersion);
    }
    throw new BackupValidationError('Unsupported vault schema version');
  }
  if (!Number.isSafeInteger(vault.revision) || vault.revision <= 0) {
    throw new BackupValidationError('Invalid vault revision');
  }
  if (vault.cipher !== 'AES-GCM-256') {
    throw new BackupValidationError('Unsupported cipher');
  }
  if (typeof vault.nonceBase64 !== 'string') {
    throw new BackupValidationError('Missing nonce');
  }
  try {
    const nonceBytes = base64ToBytes(vault.nonceBase64);
    if (nonceBytes.length !== 12) {
      throw new BackupValidationError('Invalid nonce length');
    }
  } catch {
    throw new BackupValidationError('Invalid nonce base64');
  }
  if (typeof vault.ciphertextBase64 !== 'string' || vault.ciphertextBase64.length === 0) {
    throw new BackupValidationError('Missing ciphertext');
  }
  try {
    const ctBytes = base64ToBytes(vault.ciphertextBase64);
    if (ctBytes.length < 16) {
      throw new BackupValidationError('Ciphertext is shorter than the AES-GCM authentication tag');
    }
  } catch {
    throw new BackupValidationError('Invalid ciphertext base64');
  }
  if (typeof vault.updatedAt !== 'string' || vault.updatedAt.length === 0) {
    throw new BackupValidationError('Invalid vault updatedAt');
  }

  return obj as BackupFile;
}

export async function createBackup(repo: ProfileRepository, profileId: string): Promise<BackupFile> {
  const records = await repo.getProfileRecords(profileId);
  const index = records.index;
  const vault = records.vault;

  const payloadIndex: BackupProfilePayload = {
    profileId: index.profileId,
    label: index.label,
    createdAt: index.createdAt,
    updatedAt: index.updatedAt,
    kdf: {
      algorithm: index.kdf.algorithm,
      hash: index.kdf.hash,
      iterations: index.kdf.iterations,
      saltBase64: index.kdf.saltBase64,
    },
    authVerifierBase64: index.authVerifierBase64,
  };

  return {
    format: FORMAT,
    backupVersion: BACKUP_VERSION,
    exportedAt: nowIso(),
    profile: {
      index: payloadIndex,
      vault,
    },
  };
}

export async function importBackup(repo: ProfileRepository, file: BackupFile, replace = false): Promise<void> {
  const validated = validateBackup(file as unknown);
  const index = validated.profile.index;
  const vault = validated.profile.vault;

  const internalIndex = {
    profileId: index.profileId,
    label: index.label,
    createdAt: index.createdAt,
    updatedAt: index.updatedAt,
    kdf: index.kdf,
    authVerifierBase64: index.authVerifierBase64,
  };

  try {
    await repo.importProfileBackup({
      profileId: index.profileId,
      index: internalIndex,
      vault,
      replace,
    });
  } catch (err: any) {
    if (err instanceof DuplicateProfileError) {
      throw new BackupCollisionError();
    }
    throw err;
  }
}
