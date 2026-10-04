// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('Transfer UI flow', () => {
  it('transfer moves money between accounts', async () => {
    const { repo } = makeUiRepo('transfer-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'Transfer', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /Transfer/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /Transfer/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const accountsTabs = screen.getAllByRole('button', { name: /Accounts/ });
    const accountsTab = accountsTabs.find(b => b.className.includes('nav-item')) ?? accountsTabs[0];
    fireEvent.click(accountsTab);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));

    fireEvent.click(screen.getByRole('button', { name: /Add account/ }));
    await waitFor(() => screen.getByText(/New account/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Bank A' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '5000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Bank A/));

    fireEvent.click(screen.getByRole('button', { name: /Add account/ }));
    await waitFor(() => screen.getByText(/New account/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Bank B' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '0.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Bank B/));

    const transactionsTabs = screen.getAllByRole('button', { name: /Transactions/ });
    const transactionsTab = transactionsTabs.find(b => b.className.includes('nav-item')) ?? transactionsTabs[0];
    fireEvent.click(transactionsTab);
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));

    const typeButtons = screen.getAllByRole('button', { name: /transfer/ });
    fireEvent.click(typeButtons[0]);

    // Category control should be absent for transfer
    expect(screen.queryByLabelText(/Category/i)).toBeNull();
    // Destination list excludes source
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '1000.00' } });
    const accountSelect = document.querySelector('#transaction-account') as HTMLSelectElement;
    const bankAOption = Array.from(accountSelect.options).find(o=>o.textContent?.includes('Bank A'));
    if (!bankAOption) throw new Error('Bank A option not found');
    fireEvent.change(accountSelect, { target: { value: bankAOption.value } });
    const toAccountSelect = document.querySelector('#transaction-to-account') as HTMLSelectElement;
    // Verify source excluded from destination options
    const toOptions = Array.from(toAccountSelect.options).map(o=>o.textContent);
    expect(toOptions).not.toContain('Bank A');
    const bankBOption = Array.from(toAccountSelect.options).find(o=>o.textContent?.includes('Bank B'));
    if (!bankBOption) throw new Error('Bank B option not found');
    fireEvent.change(toAccountSelect, { target: { value: bankBOption.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));

    await waitFor(() => screen.getByText("Bank A → Bank B"));
    const dashboardTabs = screen.getAllByRole('button', { name: /Dashboard/ });
    const dashboardTab = dashboardTabs.find(b => b.className.includes('nav-item')) ?? dashboardTabs[0];
    fireEvent.click(dashboardTab);
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const stats = Array.from(document.querySelectorAll('.stat'));
    function findStatValue(label: string) {
      const stat = stats.find(s => s.querySelector('.stat-label')?.textContent?.includes(label));
      return stat?.querySelector('.stat-value')?.textContent ?? '';
    }
    expect(findStatValue('Active account total')).toMatch(/5,000/);
    expect(findStatValue('Recorded income')).toMatch(/0/);
    expect(findStatValue('Recorded expenses')).toMatch(/0/);

    // Verify account balances
    const accountsTab2 = accountsTabs.find(b => b.className.includes('nav-item')) ?? accountsTabs[0];
    fireEvent.click(accountsTab2);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));
    const rows = Array.from(document.querySelectorAll('.list-row'));
    const bankARow = rows.find(r => r.textContent?.includes('Bank A'));
    const bankBRow = rows.find(r => r.textContent?.includes('Bank B'));
    expect(bankARow?.textContent).toMatch(/4,000/);
    expect(bankBRow?.textContent).toMatch(/1,000/);

    await cleanupUiRepo(repo, unmount);
  });

  it('transfer requires destination different from source', async () => {
    const { repo } = makeUiRepo('transfer-same-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'Transfer', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /Transfer/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /Transfer/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const accountsTabs = screen.getAllByRole('button', { name: /Accounts/ });
    const accountsTab = accountsTabs.find(b => b.className.includes('nav-item')) ?? accountsTabs[0];
    fireEvent.click(accountsTab);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add account/ }));
    await waitFor(() => screen.getByText(/New account/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Solo' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '100.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Solo/));

    const transactionsTabs = screen.getAllByRole('button', { name: /Transactions/ });
    const transactionsTab = transactionsTabs.find(b => b.className.includes('nav-item')) ?? transactionsTabs[0];
    fireEvent.click(transactionsTab);
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const typeButtons = screen.getAllByRole('button', { name: /transfer/ });
    fireEvent.click(typeButtons[0]);
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '10.00' } });
    // Destination not selected, first validation is destination missing
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => {
      const errors = screen.getAllByText(/Please select a destination account/i);
      expect(errors.length).toBeGreaterThan(0);
    });

    await cleanupUiRepo(repo, unmount);
  });
});

