import {
  CURRENT_VAULT_SCHEMA_VERSION,
  encryptBytes,
  decryptBytes,
} from '../security/crypto.js';
import { bytesToBase64, base64ToBytes, utf8Encode, utf8Decode } from '../security/encoding.js';
import { UnsupportedVaultVersionError, IntegrityError } from '../security/errors.js';
import type { ProfileData } from '../domain/types.js';

export interface VaultEnvelope {
  schemaVersion: number;
  profileId: string;
  data: ProfileData;
}

export interface VaultRecord {
  profileId: string;
  vaultSchemaVersion: number;
  revision: number;
  cipher: 'AES-GCM-256';
  nonceBase64: string;
  ciphertextBase64: string;
  updatedAt: string;
}

function makeAad(profileId: string, schemaVersion: number, revision: number): Uint8Array {
  const aadStr = `folio:vault:v${schemaVersion}:${profileId}:${revision}`;
  return utf8Encode(aadStr);
}

function migrateVaultEnvelope(raw: unknown): VaultEnvelope {
  if (typeof raw !== 'object' || raw === null) {
    throw new IntegrityError('Invalid envelope');
  }
  const env = raw as any;
  if (typeof env.schemaVersion !== 'number' || typeof env.profileId !== 'string' || typeof env.data !== 'object') {
    throw new IntegrityError('Malformed envelope');
  }
  const schemaVersion = env.schemaVersion;
  if (schemaVersion !== CURRENT_VAULT_SCHEMA_VERSION) {
    if (schemaVersion > CURRENT_VAULT_SCHEMA_VERSION) {
      throw new UnsupportedVaultVersionError(schemaVersion);
    }
    // v1 only for now
    throw new IntegrityError('Unsupported schema version');
  }
  return env as VaultEnvelope;
}

export async function encryptVault(
  encryptionKey: CryptoKey,
  profileId: string,
  revision: number,
  data: ProfileData
): Promise<Omit<VaultRecord, 'profileId'>> {
  const envelope: VaultEnvelope = {
    schemaVersion: CURRENT_VAULT_SCHEMA_VERSION,
    profileId,
    data,
  };
  const plaintext = utf8Encode(JSON.stringify(envelope));
  const aad = makeAad(profileId, CURRENT_VAULT_SCHEMA_VERSION, revision);
  const { nonce, ciphertext } = await encryptBytes(encryptionKey, plaintext, aad);
  const now = new Date().toISOString();
  return {
    vaultSchemaVersion: CURRENT_VAULT_SCHEMA_VERSION,
    revision,
    cipher: 'AES-GCM-256',
    nonceBase64: bytesToBase64(nonce),
    ciphertextBase64: bytesToBase64(ciphertext),
    updatedAt: now,
  };
}

export async function decryptVault(
  encryptionKey: CryptoKey,
  profileId: string,
  record: VaultRecord
): Promise<ProfileData> {
  if (record.profileId !== profileId) {
    throw new IntegrityError('Profile ID mismatch');
  }
  if (record.vaultSchemaVersion !== CURRENT_VAULT_SCHEMA_VERSION) {
    if (record.vaultSchemaVersion > CURRENT_VAULT_SCHEMA_VERSION) {
      throw new UnsupportedVaultVersionError(record.vaultSchemaVersion);
    }
    throw new IntegrityError('Unsupported schema version');
  }
  if (!Number.isSafeInteger(record.revision) || record.revision <= 0) {
    throw new IntegrityError('Invalid revision');
  }
  if (record.cipher !== 'AES-GCM-256') {
    throw new IntegrityError('Unsupported cipher');
  }
  const nonce = base64ToBytes(record.nonceBase64);
  if (nonce.length !== 12) {
    throw new IntegrityError('Invalid nonce length');
  }
  const ciphertext = base64ToBytes(record.ciphertextBase64);
  const aad = makeAad(profileId, record.vaultSchemaVersion, record.revision);
  const plain = await decryptBytes(encryptionKey, nonce, ciphertext, aad);
  const json = utf8Decode(plain);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new IntegrityError('Invalid JSON in vault');
  }
  const envelope = migrateVaultEnvelope(parsed);
  if (envelope.profileId !== profileId) {
    throw new IntegrityError('Profile ID mismatch in envelope');
  }
  return envelope.data;
}
