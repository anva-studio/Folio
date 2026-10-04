import type { ProfileData } from '../domain/types.js';
import { ProfileRepository } from '../persistence/profileRepository.js';
import { SessionLockedError } from '../security/errors.js';
import { normalizeProfileData } from './profileData.js';

interface UnlockedSessionState {
  profileId: string;
  revision: number;
  data: ProfileData;
  encryptionKey: CryptoKey;
  dirty: boolean;
  mutationGen: number;
  saveGen?: number;
  inFlight: Promise<void> | null;
  autosaveTimer?: ReturnType<typeof setTimeout> | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string;
  saveErrorName?: string;
}

function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}

export class ProfileSession {
  private repo: ProfileRepository;
  private state?: UnlockedSessionState;
  private autosaveDelay: number;

  constructor(repo: ProfileRepository, options?: { autosaveDelayMs?: number }) {
    this.repo = repo;
    this.autosaveDelay = options?.autosaveDelayMs ?? 300;
    this.state = undefined;
  }

  get profileId(): string | undefined {
    return this.state?.profileId;
  }

  get revision(): number | undefined {
    return this.state?.revision;
  }

  get isLocked(): boolean {
    return !this.state;
  }

  get isDirty(): boolean {
    return this.state?.dirty ?? false;
  }

  get saveStatus(): 'idle' | 'saving' | 'saved' | 'error' {
    return this.state?.saveStatus ?? 'idle';
  }

  get saveError(): string | undefined {
    return this.state?.saveError;
  }

  get saveErrorName(): string | undefined {
    return this.state?.saveErrorName;
  }

  async unlock(profileId: string, password: string): Promise<void> {
    if (this.state) throw new Error('Session already unlocked');
    const unlocked = await this.repo.unlockProfile(profileId, password);
    const normalized = normalizeProfileData(unlocked.data);
    this.state = {
      profileId: unlocked.profileId,
      revision: unlocked.revision,
      data: deepClone(normalized),
      encryptionKey: unlocked.encryptionKey,
      dirty: false,
      mutationGen: 0,
      inFlight: null,
      autosaveTimer: null,
      saveStatus: 'saved',
    };
  }

  getSnapshot(): ProfileData {
    this.assertUnlocked();
    return deepClone(this.state!.data);
  }

  update(updater: (current: ProfileData) => ProfileData): void {
    this.assertUnlocked();
    const current = deepClone(this.state!.data);
    const updated = updater(current);
    const newData = deepClone(updated);
    const changed = JSON.stringify(newData) !== JSON.stringify(this.state!.data);
    this.state!.data = newData;
    if (changed) {
      this.state!.mutationGen += 1;
      this.state!.dirty = true;
      this.state!.saveStatus = 'saving';
      this.scheduleAutosave();
    }
  }

  replaceData(data: ProfileData): void {
    this.update(() => deepClone(data));
  }

  private assertUnlocked(): void {
    if (!this.state) throw new SessionLockedError();
  }

  private scheduleAutosave(): void {
    if (!this.state) return;
    if (this.state.autosaveTimer) {
      clearTimeout(this.state.autosaveTimer);
    }
    this.state.autosaveTimer = setTimeout(() => {
      this.state!.autosaveTimer = null;
      if (this.state?.dirty) {
        this.flush().catch(() => {});
      }
    }, this.autosaveDelay);
  }

  async flush(): Promise<void> {
    this.assertUnlocked();
    const s = this.state!;

    if (!s.dirty) {
      if (s.saveStatus === 'saving') s.saveStatus = 'saved';
      return;
    }

    if (s.inFlight) {
      await s.inFlight;
      return this.flush();
    }

    const gen = s.mutationGen;
    const dataSnapshot = deepClone(s.data);
    const expectedRevision = s.revision;

    s.saveStatus = 'saving';
    s.inFlight = (async () => {
      let saveSucceeded = false;
      try {
        const newRev = await this.repo.saveUnlockedProfile(
          s.profileId,
          expectedRevision,
          s.encryptionKey,
          dataSnapshot
        );
        s.revision = newRev;
        if (s.mutationGen === gen) {
          s.dirty = false;
          s.saveStatus = 'saved';
        }
        saveSucceeded = true;
      } catch (e: any) {
        s.saveStatus = 'error';
        s.saveError = e?.message ?? 'Save failed';
        s.saveErrorName = e?.name;
        throw e;
      } finally {
        s.inFlight = null;
        if (saveSucceeded && s.dirty) {
          this.scheduleAutosave();
        }
      }
    })();

    await s.inFlight;
  }

  async lock(): Promise<void> {
    if (!this.state) return;
    if (this.state.autosaveTimer) {
      clearTimeout(this.state.autosaveTimer);
      this.state.autosaveTimer = null;
    }
    await this.flush();
    this.clearSensitive();
  }

  discardAndLock(): void {
    if (!this.state) return;
    if (this.state.autosaveTimer) {
      clearTimeout(this.state.autosaveTimer);
      this.state.autosaveTimer = null;
    }
    this.state.dirty = false;
    this.state.saveStatus = 'idle';
    this.state.saveError = undefined;
    this.state.saveErrorName = undefined;
    this.clearSensitive();
  }

  private clearSensitive(): void {
    if (this.state) {
      if (this.state.autosaveTimer) {
        clearTimeout(this.state.autosaveTimer);
      }
      this.state = undefined;
    }
  }
}
