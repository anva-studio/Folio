export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export class UnsupportedBackupVersionError extends Error {
  constructor(version: number) {
    super(`Unsupported backup version: ${version}`);
    this.name = 'UnsupportedBackupVersionError';
  }
}

export class BackupCollisionError extends Error {
  constructor(message = 'Profile already exists') {
    super(message);
    this.name = 'BackupCollisionError';
  }
}
