import { BackupValidationError, UnsupportedBackupVersionError, BackupCollisionError } from './backupErrors.js';

export function mapBackupErrorToUserMessage(e: any): string {
  // JSON parse errors or malformed files
  if (e?.name === 'SyntaxError' || e instanceof SyntaxError) {
    return 'This backup file is incomplete or invalid.';
  }
  if (e instanceof BackupValidationError) {
    return 'This backup file is incomplete or invalid.';
  }
  if (e instanceof UnsupportedBackupVersionError || e?.name === 'UnsupportedVaultVersionError') {
    return 'This backup was created by a newer version of Folio.';
  }
  if (e instanceof BackupCollisionError) {
    return 'This profile already exists on this device.';
  }
  // Fallback
  return e?.message ?? 'Import failed';
}
