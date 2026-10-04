// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('Lock semantics', () => {
  it('keeps session unlocked on save conflict, requires explicit discard', async () => {
    const { repo } = makeUiRepo('lock-conflict');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    const selector = await repo.createProfile({ label: 'ConflictTest', password: 'pw', data });
    const profileId = selector.profileId;

    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /ConflictTest/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /ConflictTest/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));

    // external revision advance
    const { ProfileSession } = await import('../../src/application/profileSession.js');
    const extSession = new ProfileSession(repo);
    await extSession.unlock(profileId, 'pw');
    extSession.update(d => { d.health.targetEmergencyMonths = 999; return d; });
    await extSession.flush();
    await extSession.lock();


    // The UI retains its earlier revision; mutate only after the external commit.
    const accountsTab = screen.getAllByRole('button', { name: /Accounts/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Accounts/ })[0];
    fireEvent.click(accountsTab);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));
    // create account to make dirty
    fireEvent.click(screen.getByRole('button', { name: /Add account/ }));
    await waitFor(() => screen.getByText(/New account/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'TestAcc' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '100.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/TestAcc/));

    // click NORMAL Lock (should raise conflict)
    const lockBtn = screen.getAllByRole('button', { name: /Lock/ })[0];
    fireEvent.click(lockBtn);

    await waitFor(() => screen.getByRole('heading', { name: 'Save conflict' }));
    // AppShell remains visible
    expect(screen.getByText(/Accounts/i, { selector: '.screen-title' })).toBeTruthy();
    // ProfileGate does NOT appear
    expect(screen.queryByText(/Select a profile/i)).toBeNull();

    // conflict UI appears
    const discardBtn = await screen.findByRole('button', { name: /Discard local changes & lock/i });
    expect(discardBtn).toBeTruthy();
    // session remains unlocked/dirty -> still on screen
    expect(screen.getByText(/TestAcc/)).toBeTruthy();

    fireEvent.click(discardBtn);
    await waitFor(() => screen.getByText(/Select a profile/i));
    // ProfileGate appears
    expect(screen.getByText(/Select a profile/i)).toBeTruthy();

    await cleanupUiRepo(repo, unmount);
  });
});


