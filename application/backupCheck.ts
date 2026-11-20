import { validateBackup } from './backupService';
import { deriveProfileKeys, verifyPasswordVerifier } from '../security/crypto';
import { base64ToBytes } from '../security/encoding';
import { decryptVault } from '../persistence/vault';
import { normalizeProfileData } from './profileData';
import {passwordDataKey,unwrapRecoveryDataKey,importDataKey} from '../security/keyEnvelope';
/** Authentication and decryption only. This function has no repository or write capability. */
export async function checkBackup(raw: unknown, password: string) {
    const backup = validateBackup(raw), index = backup.profile.index;
    const { authKey, encryptionKey:passwordKey } = await deriveProfileKeys(password, base64ToBytes(index.kdf.saltBase64), index.kdf.iterations);
    await verifyPasswordVerifier(authKey, base64ToBytes(index.authVerifierBase64));
    const encryptionKey=await passwordDataKey(index.keyEnvelope,passwordKey,index.profileId);
    const data = normalizeProfileData(await decryptVault(encryptionKey, index.profileId, backup.profile.vault));
    return { label: index.label, profileId: index.profileId, profileVersion: data.version, currency: data.currency.code, accounts: data.accounts.length, transactions: data.txns.length, exportedAt: backup.exportedAt };
}

/** Read-only verification using the credential that belonged to this backup. */
export async function checkBackupWithRecovery(raw: unknown, secret: string) {
    const backup = validateBackup(raw), index = backup.profile.index;
    const wrapper = index.keyEnvelope?.recovery;
    if (!wrapper) throw new Error('This backup has no configured recovery credential. Use its historical password.');
    const rawKey = await unwrapRecoveryDataKey(wrapper, secret, index.profileId);
    try {
        const key = await importDataKey(rawKey);
        const data = normalizeProfileData(await decryptVault(key, index.profileId, backup.profile.vault));
        return { label: index.label, profileId: index.profileId, profileVersion: data.version, currency: data.currency.code, accounts: data.accounts.length, transactions: data.txns.length, exportedAt: backup.exportedAt };
    } finally { rawKey.fill(0); }
}
