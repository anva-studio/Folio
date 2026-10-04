import { describe, it, expect } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  deriveProfileKeys,
  createPasswordVerifier,
  verifyPasswordVerifier,
  encryptBytes,
  decryptBytes,
  randomBytes,
} from '../../src/security/crypto.js';
import { bytesToBase64, base64ToBytes, utf8Encode, utf8Decode } from '../../src/security/encoding.js';
import { AuthenticationError, IntegrityError } from '../../src/security/errors.js';

describe('encoding', () => {
  it('base64 roundtrip', () => {
    const bytes = new Uint8Array([0, 1, 255, 128, 64]);
    const b64 = bytesToBase64(bytes);
    const decoded = base64ToBytes(b64);
    expect(decoded).toEqual(bytes);
  });

  it('utf8 roundtrip', () => {
    const s = 'Hello 🌍';
    const bytes = utf8Encode(s);
    const decoded = utf8Decode(bytes);
    expect(decoded).toBe(s);
  });
});

describe('randomness', () => {
  it('randomBytes length', () => {
    const b = randomBytes(32);
    expect(b.length).toBe(32);
  });
});

describe('KDF', () => {
  it('derive keys with PBKDF2', async () => {
    const salt = randomBytes(16);
    const { authKey, encryptionKey } = await deriveProfileKeys('password', salt);
    expect(authKey).toBeDefined();
    expect(encryptionKey).toBeDefined();
  });

  it('password normalization consistent', async () => {
    const salt = randomBytes(16);
    const pw1 = 'a\u0301'; // a + combining acute
    const pw2 = '\u00e1'; // á precomposed
    const k1 = await deriveProfileKeys(pw1, salt);
    const k2 = await deriveProfileKeys(pw2, salt);
    const v1 = await createPasswordVerifier(k1.authKey);
    const v2 = await createPasswordVerifier(k2.authKey);
    expect(v1).toEqual(v2);
  });
});

describe('auth verifier', () => {
  it('correct password succeeds', async () => {
    const salt = randomBytes(16);
    const { authKey } = await deriveProfileKeys('secret', salt);
    const verifier = await createPasswordVerifier(authKey);
    await expect(verifyPasswordVerifier(authKey, verifier)).resolves.toBe(true);
  });

  it('wrong password fails', async () => {
    const salt = randomBytes(16);
    const { authKey: auth1 } = await deriveProfileKeys('secret', salt);
    const { authKey: auth2 } = await deriveProfileKeys('wrong', salt);
    const verifier = await createPasswordVerifier(auth1);
    await expect(verifyPasswordVerifier(auth2, verifier)).rejects.toThrow(AuthenticationError);
  });
});

describe('AES-GCM', () => {
  it('encrypt/decrypt roundtrip', async () => {
    const salt = randomBytes(16);
    const { encryptionKey } = await deriveProfileKeys('pw', salt);
    const plaintext = utf8Encode('secret data');
    const aad = utf8Encode('aad');
    const { nonce, ciphertext } = await encryptBytes(encryptionKey, plaintext, aad);
    const decrypted = await decryptBytes(encryptionKey, nonce, ciphertext, aad);
    expect(decrypted).toEqual(plaintext);
  });

  it('different nonces', async () => {
    const salt = randomBytes(16);
    const { encryptionKey } = await deriveProfileKeys('pw', salt);
    const pt = utf8Encode('same');
    const aad = utf8Encode('aad');
    const e1 = await encryptBytes(encryptionKey, pt, aad);
    const e2 = await encryptBytes(encryptionKey, pt, aad);
    expect(e1.nonce).not.toEqual(e2.nonce);
    expect(e1.ciphertext).not.toEqual(e2.ciphertext);
  });

  it('nonce length 12', async () => {
    const salt = randomBytes(16);
    const { encryptionKey } = await deriveProfileKeys('pw', salt);
    const { nonce } = await encryptBytes(encryptionKey, utf8Encode('x'), utf8Encode('a'));
    expect(nonce.length).toBe(12);
  });

  it('tampered ciphertext fails', async () => {
    const salt = randomBytes(16);
    const { encryptionKey } = await deriveProfileKeys('pw', salt);
    const { nonce, ciphertext } = await encryptBytes(encryptionKey, utf8Encode('data'), utf8Encode('a'));
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 1;
    await expect(decryptBytes(encryptionKey, nonce, tampered, utf8Encode('a'))).rejects.toThrow(IntegrityError);
  });

  it('wrong AAD fails', async () => {
    const salt = randomBytes(16);
    const { encryptionKey } = await deriveProfileKeys('pw', salt);
    const { nonce, ciphertext } = await encryptBytes(encryptionKey, utf8Encode('data'), utf8Encode('aad1'));
    await expect(decryptBytes(encryptionKey, nonce, ciphertext, utf8Encode('aad2'))).rejects.toThrow(IntegrityError);
  });

  it('wrong key fails', async () => {
    const salt1 = randomBytes(16);
    const salt2 = randomBytes(16);
    const { encryptionKey: k1 } = await deriveProfileKeys('pw1', salt1);
    const { encryptionKey: k2 } = await deriveProfileKeys('pw2', salt2);
    const { nonce, ciphertext } = await encryptBytes(k1, utf8Encode('data'), utf8Encode('a'));
    await expect(decryptBytes(k2, nonce, ciphertext, utf8Encode('a'))).rejects.toThrow(IntegrityError);
  });
});

describe('constants', () => {
  it('iterations', () => {
    expect(PBKDF2_ITERATIONS).toBe(310_000);
  });
});

describe('KDF downgrade protection', () => {
  it('rejects non-standard iterations', async () => {
    const salt = randomBytes(16);
    await expect(deriveProfileKeys('pw', salt, 1)).rejects.toThrow();
  });

  it('rejects zero iterations', async () => {
    const salt = randomBytes(16);
    await expect(deriveProfileKeys('pw', salt, 0)).rejects.toThrow();
  });
});

