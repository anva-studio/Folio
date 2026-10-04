// @vitest-environment jsdom
import { render, cleanup } from '@testing-library/react';
import { RepoProvider, SessionProvider, useSession } from '../../src/application/FolioProvider';
import { ProfileRepository } from '../../src/persistence/profileRepository';
import { ProfileGate } from '../../src/ui/profile/ProfileGate';
import { AppShell } from '../../src/ui/AppShell';
import 'fake-indexeddb/auto';

let dbCounter = 0;
export function uniqueDbName(name: string) {
  return `folio-ui-${name}-${++dbCounter}`;
}

export function makeUiRepo(testName: string) {
  const dbName = uniqueDbName(testName);
  const clock = { now: () => '2026-09-26T00:00:00.000Z' };
  const repo = new ProfileRepository({ dbName, clock });
  return { repo, dbName, clock };
}

export function AppRoot() {
  const { controller } = useSession();
  return controller ? <AppShell /> : <ProfileGate />;
}

export function renderFolio(repo: ProfileRepository) {
  const { container, unmount } = render(
    <RepoProvider repo={repo}>
      <SessionProvider>
        <AppRoot />
      </SessionProvider>
    </RepoProvider>
  );
  return { container, unmount };
}

export async function cleanupUiRepo(repo: ProfileRepository, unmount: () => void) {
  unmount();
  cleanup();
  await repo.close();
  await repo.deleteDatabase();
}

