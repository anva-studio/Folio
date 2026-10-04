// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { ProfileRepository } from '../../src/persistence/profileRepository';
import { ProfileSession } from '../../src/application/profileSession';
import { FolioController } from '../../src/application/folioController';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

const clock = { now: () => '2026-09-26T00:00:00.000Z' };

describe('Persistence integration', () => {
  it('persists data through lock/unlock', async () => {
    const repo = new ProfileRepository({ dbName: 'test-ui-persistence', clock });
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    const data = createEmptyProfileData(clock);
    await repo.createProfile({ label: 'PersistUI', password: 'pw', data });
    const pid = (await repo.listProfiles())[0].profileId;

    const session1 = new ProfileSession(repo);
    await session1.unlock(pid, 'pw');
    const ctrl1 = new FolioController(session1);
    const acc = ctrl1.createAccount({ name: 'Bank', type: 'bank', openingBalance: 50000 });
    await session1.flush();
    await session1.lock();

    const session2 = new ProfileSession(repo);
    await session2.unlock(pid, 'pw');
    const ctrl2 = new FolioController(session2);
    expect(ctrl2.snapshot.accounts.find(a => a.id === acc)?.name).toBe('Bank');
    await session2.lock();
  });
});
