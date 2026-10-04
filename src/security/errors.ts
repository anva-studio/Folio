export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class AuthenticationError extends SecurityError {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class IntegrityError extends SecurityError {
  constructor(message = 'Integrity check failed') {
    super(message);
    this.name = 'IntegrityError';
  }
}

export class UnsupportedVaultVersionError extends SecurityError {
  constructor(version: number) {
    super(`Unsupported vault schema version: ${version}`);
    this.name = 'UnsupportedVaultVersionError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor(profileId: string) {
    super(`Profile not found: ${profileId}`);
    this.name = 'ProfileNotFoundError';
  }
}

export class ProfileConflictError extends Error {
  constructor(profileId: string, expected: number, actual: number) {
    super(`Profile conflict for ${profileId}: expected revision ${expected}, actual ${actual}`);
    this.name = 'ProfileConflictError';
  }
}

export class DuplicateProfileError extends Error {
  constructor(profileId: string) {
    super(`Duplicate profile: ${profileId}`);
    this.name = 'DuplicateProfileError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class SessionLockedError extends Error {
  constructor(message = 'Session is locked') {
    super(message);
    this.name = 'SessionLockedError';
  }
}
