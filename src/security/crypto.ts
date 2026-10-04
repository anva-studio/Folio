import { SecurityError, AuthenticationError, IntegrityError } from './errors.js';

export const PBKDF2_ITERATIONS = 310_000;
export const CURRENT_VAULT_SCHEMA_VERSION = 1;

const AUTH_DOMAIN = 'FOLIO_PROFILE_AUTH_V1';

function normalizePassword(pw: string): string {
  return pw.normalize('NFC');
}

export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError('length must be a positive integer');
  }
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

export function generateProfileId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = randomBytes(16);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  // format as UUID-like
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function deriveProfileKeys(
  password: string,
  salt: Uint8Array,
  iterations?: number
): Promise<{ authKey: CryptoKey; encryptionKey: CryptoKey }> {
  const normalized = normalizePassword(password);
  const iters = iterations ?? PBKDF2_ITERATIONS;

  if (iters !== PBKDF2_ITERATIONS) {
    throw new SecurityError(`Unsupported PBKDF2 iterations: ${iters}`);
  }

  const pwBytes = new TextEncoder().encode(normalized);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    pwBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: iters,
      hash: 'SHA-256',
    },
    baseKey,
    512
  );

  const material = new Uint8Array(bits);
  const authBytes = material.slice(0, 32);
  const encBytes = material.slice(32, 64);

  const authKey = await crypto.subtle.importKey(
    'raw',
    authBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign', 'verify']
  );

  const encryptionKey = await crypto.subtle.importKey(
    'raw',
    encBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // zero temp
  material.fill(0);
  return { authKey, encryptionKey };
}

export async function createPasswordVerifier(authKey: CryptoKey): Promise<Uint8Array> {
  const msg = new TextEncoder().encode(AUTH_DOMAIN);
  const sig = await crypto.subtle.sign('HMAC', authKey, msg.buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

export async function verifyPasswordVerifier(authKey: CryptoKey, stored: Uint8Array): Promise<boolean> {
  const msg = new TextEncoder().encode(AUTH_DOMAIN);
  const ok = await crypto.subtle.verify('HMAC', authKey, stored.buffer as ArrayBuffer, msg.buffer as ArrayBuffer);
  if (!ok) throw new AuthenticationError('Invalid password');
  return true;
}

export async function encryptBytes(
  encryptionKey: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array
): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> {
  const nonce = randomBytes(12);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer },
      encryptionKey,
      plaintext.buffer as ArrayBuffer
    )
  );
  return { nonce, ciphertext };
}

export async function decryptBytes(
  encryptionKey: CryptoKey,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer },
      encryptionKey,
      ciphertext.buffer as ArrayBuffer
    );
    return new Uint8Array(plain);
  } catch {
    throw new IntegrityError('AES-GCM authentication failed');
  }
}
