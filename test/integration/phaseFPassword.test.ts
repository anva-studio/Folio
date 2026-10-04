// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from '../ui/testHarness';
import { createEmptyProfileData } from '../../src/application/profileData.js';
import type { ProfileData } from '../../src/domain/types.js';
import 'fake-indexeddb/auto';

describe('Phase F password change', () => {
  afterEach(async () => {
    cleanup();
  });

  it('password change rekeys vault and requires new password', async () => {
    const { repo: r } = makeUiRepo('phaseF-pwd-rekey');
    await r.open();
    await r.deleteDatabase();
    await r.open();
    const data: ProfileData = createEmptyProfileData();
    data.accounts.push({ id: 'a1', name: 'Cash', type: 'cash', openingBalance: 500, archived: false, createdAt: new Date().toISOString() });
    const created = await r.createProfile({ label: 'Test', password: 'oldpass', data });
    await r.changePassword(created.profileId, 'oldpass', 'newpass');
    const unlocked = await r.unlockProfile(created.profileId, 'newpass');
    expect(unlocked.data.accounts[0].name).toBe('Cash');
    await expect(r.unlockProfile(created.profileId, 'oldpass')).rejects.toThrow();
    await r.close();
    await r.deleteDatabase();
  });

  it('wrong current password does not change password', async () => {
    const { repo: r } = makeUiRepo('phaseF-pwd-wrong');
    await r.open();
    await r.deleteDatabase();
    await r.open();
    const created = await r.createProfile({ label: 'Test', password: 'oldpass', data: createEmptyProfileData() });
    await expect(r.changePassword(created.profileId, 'wrong', 'newpass')).rejects.toThrow();
    const unlocked = await r.unlockProfile(created.profileId, 'oldpass');
    expect(unlocked.data).toBeDefined();
    await r.close();
    await r.deleteDatabase();
  });

  it('successful change returns ProfileGate', async () => {
    const { repo: r } = makeUiRepo('phaseF-pwd-ui-success');
    await r.open();
    await r.deleteDatabase();
    await r.open();
    const data = createEmptyProfileData();
    await r.createProfile({ label: 'UI Test', password: 'oldpw', data });
    const { unmount } = renderFolio(r);
    await waitFor(() => screen.getByText(/Select a profile/i));
    const rowBtn = screen.getAllByRole('button', { name: /UI Test/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /UI Test/ });
    fireEvent.click(rowBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'oldpw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getByRole('button', { name: /Settings/ });
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));
    const changeBtn = screen.getAllByRole('button', { name: /Change password/ }).find(b => b.className.includes('btn-secondary'));
    fireEvent.click(changeBtn!);
    await waitFor(() => screen.getByRole('dialog'));
    const pwdCurrent = screen.getAllByLabelText(/Current password/i)[0];
    const pwdNew = screen.getAllByLabelText(/New password/i)[0];
    const pwdConfirm = screen.getAllByLabelText(/Confirm new password/i)[0];
    fireEvent.change(pwdCurrent, { target: { value: 'oldpw' } });
    fireEvent.change(pwdNew, { target: { value: 'newpw' } });
    fireEvent.change(pwdConfirm, { target: { value: 'newpw' } });
    const changeModalBtn = screen.getAllByRole('button', { name: /Change/ }).find(b => b.className.includes('btn-primary'));
    fireEvent.click(changeModalBtn!);
    await waitFor(() => screen.getByText(/Select a profile/i));
    await cleanupUiRepo(r, unmount);
  });

  it('old password fails after change', async () => {
    const { repo: r } = makeUiRepo('phaseF-pwd-old-fails');
    await r.open();
    await r.deleteDatabase();
    await r.open();
    const data = createEmptyProfileData();
    await r.createProfile({ label: 'OldFail', password: 'oldpw', data });
    const { unmount } = renderFolio(r);
    await waitFor(() => screen.getByText(/Select a profile/i));
    const rowBtn = screen.getAllByRole('button', { name: /OldFail/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /OldFail/ });
    fireEvent.click(rowBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'oldpw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getByRole('button', { name: /Settings/ });
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));
    const changeBtn = screen.getAllByRole('button', { name: /Change password/ }).find(b => b.className.includes('btn-secondary'));
    fireEvent.click(changeBtn!);
    await waitFor(() => screen.getByRole('dialog'));
    const pwdCurrent = screen.getAllByLabelText(/Current password/i)[0];
    const pwdNew = screen.getAllByLabelText(/New password/i)[0];
    const pwdConfirm = screen.getAllByLabelText(/Confirm new password/i)[0];
    fireEvent.change(pwdCurrent, { target: { value: 'oldpw' } });
    fireEvent.change(pwdNew, { target: { value: 'newpw' } });
    fireEvent.change(pwdConfirm, { target: { value: 'newpw' } });
    const changeModalBtn = screen.getAllByRole('button', { name: /Change/ }).find(b => b.className.includes('btn-primary'));
    fireEvent.click(changeModalBtn!);
    await waitFor(() => screen.getByText(/Select a profile/i));

    // try old password
    const rowBtn2 = screen.getAllByRole('button', { name: /OldFail/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /OldFail/ });
    fireEvent.click(rowBtn2);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'oldpw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Incorrect password/i));
    await cleanupUiRepo(r, unmount);
  });

  it('new password restores exact data', async () => {
    const { repo: r } = makeUiRepo('phaseF-pwd-data');
    await r.open();
    await r.deleteDatabase();
    await r.open();
    const data = createEmptyProfileData();
    data.accounts.push({ id: 'a1', name: 'Savings', type: 'cash', openingBalance: 1234, archived: false, createdAt: new Date().toISOString() });
    await r.createProfile({ label: 'DataProf', password: 'oldpw', data });
    const { unmount } = renderFolio(r);
    await waitFor(() => screen.getByText(/Select a profile/i));
    const rowBtn = screen.getAllByRole('button', { name: /DataProf/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /DataProf/ });
    fireEvent.click(rowBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'oldpw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getByRole('button', { name: /Settings/ });
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));
    const changeBtn = screen.getAllByRole('button', { name: /Change password/ }).find(b => b.className.includes('btn-secondary'));
    fireEvent.click(changeBtn!);
    await waitFor(() => screen.getByRole('dialog'));
    const pwdCurrent = screen.getAllByLabelText(/Current password/i)[0];
    const pwdNew = screen.getAllByLabelText(/New password/i)[0];
    const pwdConfirm = screen.getAllByLabelText(/Confirm new password/i)[0];
    fireEvent.change(pwdCurrent, { target: { value: 'oldpw' } });
    fireEvent.change(pwdNew, { target: { value: 'newpw' } });
    fireEvent.change(pwdConfirm, { target: { value: 'newpw' } });
    const changeModalBtn = screen.getAllByRole('button', { name: /Change/ }).find(b => b.className.includes('btn-primary'));
    fireEvent.click(changeModalBtn!);
    await waitFor(() => screen.getByText(/Select a profile/i));

    const rowBtn2 = screen.getAllByRole('button', { name: /DataProf/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /DataProf/ });
    fireEvent.click(rowBtn2);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'newpw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const accountsBtn = screen.getAllByRole('button', { name: /Accounts/ }).find(b => b.className.includes('nav-item')) ?? screen.getByRole('button', { name: /Accounts/ });
    fireEvent.click(accountsBtn);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));
    expect(screen.getByText(/Savings/)).toBeTruthy();
    await cleanupUiRepo(r, unmount);
  });

  it('wrong current password surfaces safe auth error and preserves session', async () => {
    const { repo: r } = makeUiRepo('phaseF-pwd-failure-unlocked');
    await r.open();
    await r.deleteDatabase();
    await r.open();
    const data = createEmptyProfileData();
    await r.createProfile({ label: 'FailProf', password: 'correct', data });
    const { unmount } = renderFolio(r);
    await waitFor(() => screen.getByText(/Select a profile/i));
    const rowBtn = screen.getAllByRole('button', { name: /FailProf/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /FailProf/ });
    fireEvent.click(rowBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'correct' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));

    const settingsBtn = screen.getAllByRole('button', { name: /Settings/ }).find(b => b.className.includes('nav-item')) ?? screen.getByRole('button', { name: /Settings/ });
    fireEvent.click(settingsBtn);
    await waitFor(() => screen.getByText(/Settings/i, { selector: '.screen-title' }));
    const changeBtn = screen.getAllByRole('button', { name: /Change password/ }).find(b => b.className.includes('btn-secondary'));
    fireEvent.click(changeBtn!);
    await waitFor(() => screen.getByRole('dialog'));
    const pwdCurrent = screen.getAllByLabelText(/Current password/i)[0];
    const pwdNew = screen.getAllByLabelText(/New password/i)[0];
    const pwdConfirm = screen.getAllByLabelText(/Confirm new password/i)[0];
    fireEvent.change(pwdCurrent, { target: { value: 'wrong' } });
    fireEvent.change(pwdNew, { target: { value: 'newpw' } });
    fireEvent.change(pwdConfirm, { target: { value: 'newpw' } });
    const changeModalBtn = screen.getAllByRole('button', { name: /Change/ }).find(b => b.className.includes('btn-primary'));
    fireEvent.click(changeModalBtn!);
    // Settings safely surfaces Invalid password, session remains
    await waitFor(() => screen.getByText(/Invalid password/i));
    expect(screen.getByText(/Settings/i, { selector: '.screen-title' })).toBeTruthy();
    await cleanupUiRepo(r, unmount);
  });
});
