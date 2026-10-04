// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createBackup } from '../../src/application/backupService';
import { createEmptyProfileData } from '../../src/application/profileData';
import { ProfileRepository } from '../../src/persistence/profileRepository';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('ProfileGate restore Phase F', () => {
  const createProfile = async (repo: ProfileRepository, label = 'Test', password = 'pw') => {
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label, password, data });
  };

  it('zero-profile Restore button opens dialog/file input', async () => {
    const { repo } = makeUiRepo('restore-zero');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Your private financial notebook/i));
    const restoreBtn = screen.getByRole('button', { name: /Restore from backup/i });
    fireEvent.click(restoreBtn);
    await waitFor(() => screen.getByLabelText(/Select \.folio file/i));
    const fileInput = screen.getByLabelText(/Select \.folio file/i);
    expect(fileInput).toBeTruthy();
    await cleanupUiRepo(repo, unmount);
  });

  it('valid .folio import adds profile to list', async () => {
    const { repo: srcRepo } = makeUiRepo('restore-valid-src');
    await srcRepo.open();
    await srcRepo.deleteDatabase();
    await srcRepo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    const created = await srcRepo.createProfile({ label: 'ImportMe', password: 'secret', data });
    const backup = await createBackup(srcRepo, created.profileId);

    const { repo } = makeUiRepo('restore-valid-dst');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Your private financial notebook/i));
    const restoreBtn = screen.getByRole('button', { name: /Restore from backup/i });
    fireEvent.click(restoreBtn);
    await waitFor(() => screen.getByLabelText(/Select \.folio file/i));
    const fileInput = screen.getByLabelText(/Select \.folio file/i);
    const file = new File([JSON.stringify(backup)], 'backup.folio', { type: 'application/octet-stream' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText(/Backup imported/i));
    await waitFor(() => screen.getByText(/ImportMe/));
    await cleanupUiRepo(repo, unmount);
    await srcRepo.close();
    await srcRepo.deleteDatabase();
  });

  it('imported profile appears locked and wrong password fails', async () => {
    const { repo: srcRepo } = makeUiRepo('restore-wrong-pw-src');
    await srcRepo.open();
    await srcRepo.deleteDatabase();
    await srcRepo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    const created = await srcRepo.createProfile({ label: 'LockedProf', password: 'right', data });
    const backup = await createBackup(srcRepo, created.profileId);

    const { repo } = makeUiRepo('restore-wrong-pw-dst');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Your private financial notebook/i));
    const restoreBtn = screen.getByRole('button', { name: /Restore from backup/i });
    fireEvent.click(restoreBtn);
    const fileInput = await waitFor(() => screen.getByLabelText(/Select \.folio file/i));
    const file = new File([JSON.stringify(backup)], 'backup.folio');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => screen.getByText(/Backup imported/i));
    await waitFor(() => screen.getByText(/Select a profile/i));

    const profileBtn = screen.getAllByRole('button', { name: /LockedProf/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /LockedProf/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'wrong' } });
    const unlockBtn = screen.getAllByRole('button', { name: /Unlock/ }).find(b => b.className.includes('btn-primary'));
    fireEvent.click(unlockBtn!);
    await waitFor(() => screen.getByText(/Incorrect password/i));

    await cleanupUiRepo(repo, unmount);
    await srcRepo.close();
    await srcRepo.deleteDatabase();
  });

  it('backup password unlocks imported profile', async () => {
    const { repo: srcRepo } = makeUiRepo('restore-unlock-src');
    await srcRepo.open();
    await srcRepo.deleteDatabase();
    await srcRepo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    const created = await srcRepo.createProfile({ label: 'UnlockMe', password: 'correctpw', data });
    const backup = await createBackup(srcRepo, created.profileId);

    const { repo } = makeUiRepo('restore-unlock-dst');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Your private financial notebook/i));
    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }));
    const fileInput = await waitFor(() => screen.getByLabelText(/Select \.folio file/i));
    const file = new File([JSON.stringify(backup)], 'backup.folio');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => screen.getByText(/Backup imported/i));

    const profileBtn = screen.getAllByRole('button', { name: /UnlockMe/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /UnlockMe/ });
    fireEvent.click(profileBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'correctpw' } });
    const unlockBtn = screen.getAllByRole('button', { name: /Unlock/ }).find(b => b.className.includes('btn-primary'));
    fireEvent.click(unlockBtn!);
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));

    await cleanupUiRepo(repo, unmount);
    await srcRepo.close();
    await srcRepo.deleteDatabase();
  });

  it('collision requires exact typed label', async () => {
    const { repo } = makeUiRepo('restore-collision');
    await createProfile(repo, 'Existing', 'pw1');
    const profiles = await repo.listProfiles();
    const profileId = profiles[0].profileId;
    // Actually we need same profileId, so create backup of existing
    const backup = await createBackup(repo, profileId);

    const { unmount } = renderFolio(repo);
    await waitFor(() => screen.getByText(/Select a profile/i));
    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }));
    const fileInput = await waitFor(() => screen.getByLabelText(/Select \.folio file/i));
    const file = new File([JSON.stringify(backup)], 'backup.folio');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText(/Replace existing profile/i, { selector: '.modal-title' }));
    const confirmInput = screen.getByLabelText(/Type the profile name to confirm/i);
    const replaceBtn = screen.getAllByRole('button', { name: /Replace/ }).find(b => b.className.includes('btn-primary'))!;
    expect(replaceBtn.hasAttribute('disabled')).toBe(true);
    fireEvent.change(confirmInput, { target: { value: 'Wrong' } });
    expect(replaceBtn.hasAttribute('disabled')).toBe(true);
    fireEvent.change(confirmInput, { target: { value: 'Existing' } });
    await waitFor(() => expect(replaceBtn.hasAttribute('disabled')).toBe(false));
    await cleanupUiRepo(repo, unmount);
  });

  it('replacement works after exact label', async () => {
    const { repo } = makeUiRepo('restore-replace');
    await createProfile(repo, 'ToReplace', 'oldpw');
    const profiles = await repo.listProfiles();
    const profileId = profiles[0].profileId;
    const backup = await createBackup(repo, profileId);

    // modify backup label? replacement uses same profileId
    const { unmount } = renderFolio(repo);
    await waitFor(() => screen.getByText(/Select a profile/i));
    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }));
    const fileInput = await waitFor(() => screen.getByLabelText(/Select \.folio file/i));
    const file = new File([JSON.stringify(backup)], 'backup.folio');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => screen.getByText(/Replace existing profile/i, { selector: '.modal-title' }));
    const confirmInput = screen.getByLabelText(/Type the profile name to confirm/i);
    fireEvent.change(confirmInput, { target: { value: 'ToReplace' } });
    const replaceBtn = screen.getAllByRole('button', { name: /Replace/ }).find(b => b.className.includes('btn-primary'))!;
    fireEvent.click(replaceBtn);
    await waitFor(() => screen.getByText(/Backup imported \(replaced\)/i));
    await cleanupUiRepo(repo, unmount);
  });

  it('malformed JSON shows user message', async () => {
    const { repo } = makeUiRepo('restore-bad-json');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);
    await waitFor(() => screen.getByText(/Your private financial notebook/i));
    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }));
    const fileInput = await waitFor(() => screen.getByLabelText(/Select \.folio file/i));
    const file = new File(['{ invalid json'], 'bad.folio');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => screen.getByText(/This backup file is incomplete or invalid/i));
    await cleanupUiRepo(repo, unmount);
  });
});

