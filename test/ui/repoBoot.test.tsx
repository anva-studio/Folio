// @vitest-environment jsdom
import { describe, it, afterEach } from 'vitest';
import { screen, waitFor, cleanup, within } from '@testing-library/react';
import { RepoProvider, SessionProvider } from '../../src/application/FolioProvider';
import { ProfileGate } from '../../src/ui/profile/ProfileGate';
import { useSession } from '../../src/application/FolioProvider';
import { render } from '@testing-library/react';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

function AppRoot() {
  const { controller } = useSession();
  return controller ? <div>AppShell</div> : <div data-testid="profile-gate"><ProfileGate /></div>;
}

describe('RepoProvider async readiness', () => {
  it('renders ProfileGate after repository initializes without injection', async () => {
    const dbName = `folio-boot-${Math.random().toString(36).slice(2)}`;
    const { unmount } = render(
      <RepoProvider dbName={dbName}>
        <SessionProvider>
          <AppRoot />
        </SessionProvider>
      </RepoProvider>
    );

    // Should eventually show ProfileGate, not throw Repository not ready
    await waitFor(() => {
      const gate = screen.getByTestId('profile-gate');
      within(gate).getByText(/Your private financial notebook/i);
    });

    unmount();
  });
});

