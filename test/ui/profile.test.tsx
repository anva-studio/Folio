// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('ProfileGate UI', () => {
  it('shows create form when no profiles', async () => {
    const { repo } = makeUiRepo('profile-create-form');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);
    
    await waitFor(() => {
      screen.getByText(/Your private financial notebook/i);
    });
    screen.getByText(/Profile name/i);
    
    await cleanupUiRepo(repo, unmount);
  });

  it('validates empty label on create', async () => {
    const { repo } = makeUiRepo('profile-validate');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);
    
    await waitFor(() => {
      screen.getByText(/Profile name/i);
    });

    const button = screen.getByRole('button', { name: /Create profile/i });
    fireEvent.click(button);

    await waitFor(() => {
      screen.getByText(/Profile name is required/i);
    });
    
    await cleanupUiRepo(repo, unmount);
  });

  it('creates profile and unlocks', async () => {
    const { repo } = makeUiRepo('profile-create-unlock');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const { unmount } = renderFolio(repo);
    
    await waitFor(() => {
      screen.getByLabelText(/Profile name/i);
    });

    const labelInput = screen.getByLabelText(/Profile name/i);
    fireEvent.change(labelInput, { target: { value: 'TestProfile' } });

    const pwdInputs = screen.getAllByLabelText(/Password/i);
    const pwd1 = pwdInputs.find(i => i.getAttribute('id') === 'profile-password') ?? pwdInputs[0];
    const pwd2 = pwdInputs.find(i => i.getAttribute('id') === 'profile-password-confirm') ?? pwdInputs[1];
    fireEvent.change(pwd1, { target: { value: 'secret123' } });
    fireEvent.change(pwd2, { target: { value: 'secret123' } });

    const createBtn = screen.getByRole('button', { name: /Create profile/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      screen.getByText(/Dashboard/i, { selector: '.screen-title' });
    });

    await cleanupUiRepo(repo, unmount);
  });

  it('unlock with wrong password shows error', async () => {
    const { repo } = makeUiRepo('profile-unlock-wrong');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    await repo.createProfile({ label: 'P', password: 'goodpw', data: { version:1, currency:{code:'INR',symbol:'₹',minorDigits:2,indianGrouping:true}, accounts: [], categories: [], txns: [], recurring: [], debts:[], goals:[], health:{targetEmergencyMonths:6,maxDebtToIncome:4,minSavingsRate:0.1}, onboardingDone:false, createdAt:'2026-09-26T00:00:00.000Z', updatedAt:'2026-09-26T00:00:00.000Z' } });
    const { unmount } = renderFolio(repo);

    await waitFor(() => {
      screen.getByText(/Select a profile/i);
    });

    const profileRowBtns = screen.getAllByRole('button', { name: /P/ });
    const profileRowBtn = profileRowBtns.find(b => b.className.includes('profile-row-btn')) ?? profileRowBtns[0];
    fireEvent.click(profileRowBtn);

    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'badpw' } });
    const unlockBtn = screen.getByRole('button', { name: /Unlock/ });
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      screen.getByText(/Incorrect password/i);
    });

    await cleanupUiRepo(repo, unmount);
  });

  it('delete profile requires confirmation', async () => {
    const { repo } = makeUiRepo('profile-delete');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    await repo.createProfile({ label: 'DelMe', password: 'pw', data: { version:1, currency:{code:'INR',symbol:'₹',minorDigits:2,indianGrouping:true}, accounts: [], categories: [], txns: [], recurring: [], debts:[], goals:[], health:{targetEmergencyMonths:6,maxDebtToIncome:4,minSavingsRate:0.1}, onboardingDone:false, createdAt:'2026-09-26T00:00:00.000Z', updatedAt:'2026-09-26T00:00:00.000Z' } });
    const { unmount } = renderFolio(repo);

    await waitFor(() => {
      screen.getByText(/Select a profile/i);
    });

    const deleteBtn = screen.getByRole('button', { name: /Delete DelMe/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      screen.getByText(/Delete profile/i);
    });

    const confirmInput = screen.getByLabelText(/Type profile label to confirm/i);
    const modal = screen.getByRole('dialog', { name: /Delete profile/i });
    const deleteSubmitBtn = within(modal).getByRole('button', { name: /Delete/ });

    // Initially disabled
    expect(deleteSubmitBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.change(confirmInput, { target: { value: 'Wrong' } });
    // Delete remains disabled
    expect(deleteSubmitBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.change(confirmInput, { target: { value: 'DelMe' } });
    await waitFor(() => {
      expect(deleteSubmitBtn.hasAttribute('disabled')).toBe(false);
    });

    fireEvent.click(deleteSubmitBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Delete profile/i)).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByText(/DelMe/)).toBeNull();
    });

    await cleanupUiRepo(repo, unmount);
  });

  it('lock after unlock', async () => {
    const { repo } = makeUiRepo('profile-lock');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    await repo.createProfile({ label: 'LockTest', password: 'pw', data: { version:1, currency:{code:'INR',symbol:'₹',minorDigits:2,indianGrouping:true}, accounts: [], categories: [], txns: [], recurring: [], debts:[], goals:[], health:{targetEmergencyMonths:6,maxDebtToIncome:4,minSavingsRate:0.1}, onboardingDone:false, createdAt:'2026-09-26T00:00:00.000Z', updatedAt:'2026-09-26T00:00:00.000Z' } });
    const { unmount } = renderFolio(repo);

    await waitFor(() => {
      screen.getByText(/Select a profile/i);
    });

    const profileRowBtns = screen.getAllByRole('button', { name: /LockTest/ });
    const profileRowBtn = profileRowBtns.find(b => b.className.includes('profile-row-btn')) ?? profileRowBtns[0];
    fireEvent.click(profileRowBtn);

    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    const unlockBtn = screen.getByRole('button', { name: /Unlock/ });
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      screen.getByText(/Dashboard/i, { selector: '.screen-title' });
    });

    const lockBtns = screen.getAllByRole('button', { name: /Lock/ });
    const lockBtn = lockBtns[0]; // sidebar Lock button (mobile topbar also renders)
    fireEvent.click(lockBtn);

    await waitFor(() => {
      screen.getByText(/Select a profile/i);
    });

    await cleanupUiRepo(repo, unmount);
  });
});

