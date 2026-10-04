// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createBackup } from '../../src/application/backupService';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

import { ProfileRepository } from '../../src/persistence/profileRepository';

describe('Settings Phase F UI', () => {
  const createProfile = async (repo: ProfileRepository, label = 'Test', password = 'pw') => {
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label, password, data });
  };

  const unlockProfile = async (repo: ProfileRepository, label: string, password: string) => {
    const { unmount } = renderFolio(repo);
    await waitFor(() => screen.getByText(/Select a profile/i));
    const rowBtn = screen.getAllByRole('button', { name: new RegExp(label, 'i') }).find(b => b.className.includes('profile-row-btn')) ?? screen.getAllByRole('button', { name: new RegExp(label, 'i') })[0];
    fireEvent.click(rowBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    return { unmount };
  };

  it('Settings desktop + mobile navigation and bottom nav exactly 4', async () => {
    const { repo } = makeUiRepo('settings-nav');
    await createProfile(repo);
    const { unmount } = await unlockProfile(repo, 'Test', 'pw');

    // desktop nav
    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Settings/ })[0];
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));

    // bottom nav exactly 4
    const bottomNav = document.querySelector('.bottom-nav');
    const bottomButtons = bottomNav?.querySelectorAll('button') ?? [];
    expect(bottomButtons.length).toBe(4);

    // mobile menu
    const menuBtn = screen.getByRole('button', { name: /Menu/ });
    fireEvent.click(menuBtn);
    await waitFor(() => screen.getByText(/Navigation/i));
    const mobileSettingsList = screen.getAllByRole('button', { name: /Settings/ });
    const mobileSettings = mobileSettingsList.find(b => !b.className.includes('nav-item') && !b.closest('.bottom-nav'));
    expect(mobileSettings).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));

    await cleanupUiRepo(repo, unmount);
  });

  it('rename actually changes profile label', async () => {
    const { repo } = makeUiRepo('settings-rename');
    await createProfile(repo, 'OldName', 'pw');
    const { unmount } = await unlockProfile(repo, 'OldName', 'pw');

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Settings/ })[0];
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));

    fireEvent.click(screen.getByRole('button', { name: /Rename/ }));
    await waitFor(() => screen.getByText(/Rename profile/i));
    const input = screen.getByLabelText(/New name/i);
    fireEvent.change(input, { target: { value: 'NewName' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Rename/ })[1]);
    await waitFor(() => screen.getByText(/NewName/));

    await cleanupUiRepo(repo, unmount);
  });

  it('password required/mismatch validation', async () => {
    const { repo } = makeUiRepo('settings-pwd-validation');
    await createProfile(repo);
    const { unmount } = await unlockProfile(repo, 'Test', 'pw');

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Settings/ })[0];
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));

    const changeBtn = screen.getAllByRole('button', { name: /Change password/ }).find(b => b.className.includes('btn-secondary'));
    fireEvent.click(changeBtn!);
    await waitFor(() => screen.getByRole('dialog'));

    const changeModalBtn = screen.getAllByRole('button', { name: /Change/ }).find(b => b.className.includes('btn-primary'));
    const pwdCurrent = screen.getAllByLabelText(/Current password/i)[0];
    const pwdNew = screen.getAllByLabelText(/New password/i)[0];
    const pwdConfirm = screen.getAllByLabelText(/Confirm new password/i)[0];
    // missing current
    fireEvent.change(pwdCurrent, { target: { value: '' } });
    fireEvent.change(pwdNew, { target: { value: 'new' } });
    fireEvent.change(pwdConfirm, { target: { value: 'new' } });
    fireEvent.click(changeModalBtn!);
    await waitFor(() => screen.getByText(/Current password is required/i));

    // mismatch
    fireEvent.change(pwdCurrent, { target: { value: 'pw' } });
    fireEvent.change(pwdNew, { target: { value: 'new1' } });
    fireEvent.change(pwdConfirm, { target: { value: 'new2' } });
    fireEvent.click(changeModalBtn!);
    await waitFor(() => screen.getByText(/Passwords do not match/i));

    await cleanupUiRepo(repo, unmount);
  });

  it('no-password-recovery text visible', async () => {
    const { repo } = makeUiRepo('settings-recovery-text');
    await createProfile(repo);
    const { unmount } = await unlockProfile(repo, 'Test', 'pw');

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Settings/ })[0];
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));

    expect(screen.getByText(/If you lose your password, Folio cannot recover your encrypted profile/i)).toBeTruthy();

    await cleanupUiRepo(repo, unmount);
  });

  it('backup/CSV actions reachable and plaintext CSV warning visible', async () => {
    const { repo } = makeUiRepo('settings-backup-csv');
    await createProfile(repo);
    const { unmount } = await unlockProfile(repo, 'Test', 'pw');

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Settings/ })[0];
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));

    expect(screen.getByRole('button', { name: /Create encrypted backup/ })).toBeTruthy();
    expect(screen.getByLabelText(/Restore backup/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export transactions/ })).toBeTruthy();
    expect(screen.getByText(/CSV files are not encrypted/i)).toBeTruthy();

    await cleanupUiRepo(repo, unmount);
  });

  it('same-profile replace returns to ProfileGate', async () => {
    const { repo } = makeUiRepo('settings-same-replace');
    await createProfile(repo, 'SameProf', 'pw');
    const profiles = await repo.listProfiles();
    const profileId = profiles[0].profileId;
    const backup = await createBackup(repo, profileId);

    const { unmount } = await unlockProfile(repo, 'SameProf', 'pw');

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Settings/ })[0];
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));

    const fileInput = screen.getByLabelText(/Restore backup/i);
    const file = new File([JSON.stringify(backup)], 'backup.folio');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText(/Replace existing profile/i));
    const confirmInput = screen.getByLabelText(/Type the profile name to confirm/i);
    fireEvent.change(confirmInput, { target: { value: 'SameProf' } });
    fireEvent.click(screen.getByRole('button', { name: /Replace/ }));

    await waitFor(() => screen.getByText(/Select a profile/i));

    await cleanupUiRepo(repo, unmount);
  });
});

