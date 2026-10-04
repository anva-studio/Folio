// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('UI regression checks', () => {
  it('mobile topbar and bottom nav structure exist', async () => {
    const { repo } = makeUiRepo('regression-nav');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'RegNav', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /RegNav/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /RegNav/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const topbarTitle = screen.queryByText('Dashboard', { selector: '.mobile-topbar .topbar-title' });
    expect(topbarTitle).not.toBeNull();

    // Use sidebar nav-item to avoid bottom-nav duplicate
    const sidebarNav = document.querySelector('.sidebar');
    const accountsBtn = screen.getAllByRole('button', { name: /Accounts/ }).find(b => sidebarNav?.contains(b));
    const transactionsBtn = screen.getAllByRole('button', { name: /Transactions/ }).find(b => sidebarNav?.contains(b));
    const recurringBtn = screen.getAllByRole('button', { name: /Scheduled/ }).find(b => sidebarNav?.contains(b));
    expect(accountsBtn).toBeTruthy();
    expect(transactionsBtn).toBeTruthy();
    expect(recurringBtn).toBeTruthy();

    const bottomNav = document.querySelector('.bottom-nav');
    expect(bottomNav).toBeTruthy();
    expect(bottomNav?.querySelectorAll('button').length).toBe(4);

    // Verify mobile menu drawer contains all 9 destinations
    const menuBtn = screen.getByRole('button', { name: /Menu/ });
    fireEvent.click(menuBtn);
    await waitFor(() => screen.getByRole('dialog', { name: /Navigation/ }));
    const dialog = screen.getByRole('dialog', { name: /Navigation/ });
    expect(dialog).toBeTruthy();
    const navLabels = ['Dashboard','Accounts','Transactions','Scheduled','Debt','Goals','Health','Planner','Reports'];
    for (const label of navLabels) {
      expect(dialog.textContent).toContain(label);
    }

    // Verify drawer navigation to Goals sets aria-current
    const goalsBtnInDialog = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.includes('Goals'));
    expect(goalsBtnInDialog).toBeTruthy();
    fireEvent.click(goalsBtnInDialog!);
    await waitFor(() => screen.getByText(/Goals/i, { selector: '.screen-title' }));
    // Drawer should close
    expect(screen.queryByRole('dialog', { name: /Navigation/ })).toBeNull();
    // Verify aria-current on drawer button was set before close (check via last rendered)
    // Re-open to verify aria-current attribute
    fireEvent.click(menuBtn);
    await waitFor(() => screen.getByRole('dialog', { name: /Navigation/ }));
    const dialog2 = screen.getByRole('dialog', { name: /Navigation/ });
    const goalsBtn2 = Array.from(dialog2.querySelectorAll('button')).find(b => b.textContent?.includes('Goals'));
    expect(goalsBtn2).toBeTruthy();
    expect(goalsBtn2?.getAttribute('aria-current')).toBe('page');

    await cleanupUiRepo(repo, unmount);
  });

  it('accounts archived toggle hides/shows archived account', async () => {
    const { repo } = makeUiRepo('regression-archived');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    const profileData = {
      ...data,
      accounts: [
        { id: 'a1', name: 'ActiveAcc', type: 'bank' as const, openingBalance: 100000, archived: false, createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 'a2', name: 'ArchivedAcc', type: 'bank' as const, openingBalance: 50000, archived: true, createdAt: '2026-09-26T00:00:00.000Z' },
      ],
    };
    await repo.createProfile({ label: 'RegArch', password: 'pw', data: profileData });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /RegArch/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /RegArch/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    // Dashboard consolidated should be active only: 1,000
    const stats = Array.from(document.querySelectorAll('.stat'));
    function findStatValue(label: string) {
      const stat = stats.find(s => s.querySelector('.stat-label')?.textContent?.includes(label));
      return stat?.querySelector('.stat-value')?.textContent ?? '';
    }
    await waitFor(() => {
      expect(findStatValue('Active account total')).toMatch(/1,000/);
    });

    const accountsTabs = screen.getAllByRole('button', { name: /Accounts/ });
    const accountsTab = accountsTabs.find(b => b.className.includes('nav-item')) ?? accountsTabs[0];
    fireEvent.click(accountsTab);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));

    expect(screen.getByText(/ActiveAcc/)).toBeTruthy();
    expect(screen.queryByText(/ArchivedAcc/)).toBeNull();

    const checkbox = screen.getByLabelText(/Show archived/);
    fireEvent.click(checkbox);
    await waitFor(() => screen.getByText(/ArchivedAcc/));

    // Active account total in Accounts screen should still be ₹1,000
    const screenSub = screen.getByText(/Active account total:/i).closest('.screen-sub');
    const subText = screenSub?.textContent ?? '';
    expect(subText).toMatch(/1,000/);

    await cleanupUiRepo(repo, unmount);
  });
});

