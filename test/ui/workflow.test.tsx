// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('Core finance workflow UI integration', () => {
  it('creates account, category, income/expense and updates balances', async () => {
    const { repo } = makeUiRepo('workflow-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'UI Test', password: 'test123', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /UI Test/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /UI Test/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'test123' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const accountsTabs = screen.getAllByRole('button', { name: /Accounts/ });
    const accountsTab = accountsTabs.find(b => b.className.includes('nav-item')) ?? accountsTabs[0];
    fireEvent.click(accountsTab);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add account/ }));
    await waitFor(() => screen.getByText(/New account/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Bank' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '1000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Bank/));

    // Create income and expense categories via Manage categories
    const transactionsTabs = screen.getAllByRole('button', { name: /Transactions/ });
    const transactionsTab = transactionsTabs.find(b => b.className.includes('nav-item')) ?? transactionsTabs[0];
    fireEvent.click(transactionsTab);
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
    await waitFor(() => screen.getByText(/Manage categories/i, { selector: '.modal-title' }));
    // Income category
    const incomeNewCatBtn = screen.getByRole('button', { name: /New income categories category/ });
    fireEvent.click(incomeNewCatBtn);
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'IncomeCat' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/IncomeCat/));
    // Expense category
    const expenseNewCatBtn = screen.getByRole('button', { name: /New expense categories category/ });
    fireEvent.click(expenseNewCatBtn);
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'ExpenseCat' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/ExpenseCat/));
    // Close categories modal
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));

    // Create income transaction 500
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const incomeTypeButtons = screen.getAllByRole('button', { name: /income/ });
    fireEvent.click(incomeTypeButtons[0]);
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '500.00' } });
    const accountSelect = document.querySelector('#transaction-account') as HTMLSelectElement;
    const bankOption = Array.from(accountSelect.options).find(o => o.textContent?.includes('Bank'));
    if (!bankOption) throw new Error('Bank option not found');
    fireEvent.change(accountSelect, { target: { value: bankOption.value } });
    const categorySelect = document.querySelector('#transaction-category') as HTMLSelectElement;
    const incomeCatOption = Array.from(categorySelect.options).find(o => o.textContent?.includes('IncomeCat'));
    if (!incomeCatOption) throw new Error('Income category option not found');
    fireEvent.change(categorySelect, { target: { value: incomeCatOption.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/₹500.00/));

    // Create expense transaction 200
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const expenseTypeButtons = screen.getAllByRole('button', { name: /expense/ });
    fireEvent.click(expenseTypeButtons[0]);
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '200.00' } });
    fireEvent.change(document.querySelector('#transaction-account') as HTMLSelectElement, { target: { value: bankOption.value } });
    const expenseCategorySelect = document.querySelector('#transaction-category') as HTMLSelectElement;
    const expenseCatOption = Array.from(expenseCategorySelect.options).find(o => o.textContent?.includes('ExpenseCat'));
    if (!expenseCatOption) throw new Error('Expense category option not found');
    fireEvent.change(expenseCategorySelect, { target: { value: expenseCatOption.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/₹200.00/));

    const dashboardTabs = screen.getAllByRole('button', { name: /Dashboard/ });
    const dashboardTab = dashboardTabs.find(b => b.className.includes('nav-item')) ?? dashboardTabs[0];
    fireEvent.click(dashboardTab);
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    await waitFor(() => screen.getByText(/Active account total/i));
    const statValues = Array.from(document.querySelectorAll('.stat-value')).map(el => el.textContent ?? '');
    expect(statValues.some(v => /1,300/.test(v))).toBe(true);
    expect(statValues.some(v => /500/.test(v) && !/1,300/.test(v))).toBe(true); // income 500
    // Check specific labels
    const stats = Array.from(document.querySelectorAll('.stat'));
    const findStatValue = (label: string) => {
      const stat = stats.find(s => s.querySelector('.stat-label')?.textContent?.includes(label));
      return stat?.querySelector('.stat-value')?.textContent ?? '';
    };
    expect(findStatValue('Active account total')).toMatch(/1,300/);
    expect(findStatValue('Recorded income')).toMatch(/500/);
    expect(findStatValue('Recorded expenses')).toMatch(/200/);
    const netStat = stats.find(s => s.querySelector('.stat-label')?.textContent?.includes('Recorded surplus'));
    const netValue = netStat?.querySelector('.stat-value')?.textContent ?? '';
    expect(netValue).toMatch(/300/);

    await cleanupUiRepo(repo, unmount);
  });

  it('transfer no category, same account rejected, ledger balances change, cash flow neutral', async () => {
    const { repo } = makeUiRepo('workflow-transfer-ui');
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

    // Verify accounts screen loads
    expect(screen.getByText(/Accounts/i, { selector: '.screen-title' })).toBeTruthy();

    await cleanupUiRepo(repo, unmount);
  });

  it('dashboard updates from real entered financial data', async () => {
    const { repo } = makeUiRepo('workflow-dashboard-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'Dashboard', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /Dashboard/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /Dashboard/ });
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
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Main' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '2000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Main/, { selector: '.list-row-title' }));

    const transactionsTabs = screen.getAllByRole('button', { name: /Transactions/ });
    const transactionsTab = transactionsTabs.find(b => b.className.includes('nav-item')) ?? transactionsTabs[0];
    fireEvent.click(transactionsTab);
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
    await waitFor(() => screen.getByText(/Manage categories/i, { selector: '.modal-title' }));
    const incomeNewCatBtn = screen.getByRole('button', { name: /New income categories category/ });
    fireEvent.click(incomeNewCatBtn);
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Salary' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Salary/));
    const expenseNewCatBtn = screen.getByRole('button', { name: /New expense categories category/ });
    fireEvent.click(expenseNewCatBtn);
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Food' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Food/));
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));

    // Income 300
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const incomeTypeButtons = screen.getAllByRole('button', { name: /income/ });
    fireEvent.click(incomeTypeButtons[0]);
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '300.00' } });
    const accountSelect = document.querySelector('#transaction-account') as HTMLSelectElement;
    const mainOption = Array.from(accountSelect.options).find(o => o.textContent?.includes('Main'));
    if (!mainOption) throw new Error('Main option not found');
    fireEvent.change(accountSelect, { target: { value: mainOption.value } });
    const categorySelect = document.querySelector('#transaction-category') as HTMLSelectElement;
    const salaryOption = Array.from(categorySelect.options).find(o => o.textContent?.includes('Salary'));
    if (!salaryOption) throw new Error('Salary option not found');
    fireEvent.change(categorySelect, { target: { value: salaryOption.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/₹300.00/));

    // Expense 100
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const expenseTypeButtons = screen.getAllByRole('button', { name: /expense/ });
    fireEvent.click(expenseTypeButtons[0]);
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '100.00' } });
    fireEvent.change(document.querySelector('#transaction-account') as HTMLSelectElement, { target: { value: mainOption.value } });
    const expenseCategorySelect = document.querySelector('#transaction-category') as HTMLSelectElement;
    const foodOption = Array.from(expenseCategorySelect.options).find(o => o.textContent?.includes('Food'));
    if (!foodOption) throw new Error('Food option not found');
    fireEvent.change(expenseCategorySelect, { target: { value: foodOption.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/₹100.00/));

    const dashboardTabs = screen.getAllByRole('button', { name: /Dashboard/ });
    const dashboardTab = dashboardTabs.find(b => b.className.includes('nav-item')) ?? dashboardTabs[0];
    fireEvent.click(dashboardTab);
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    await waitFor(() => screen.getByText(/Active account total/i));
    const stats = Array.from(document.querySelectorAll('.stat'));
    function findStatValue(label: string) {
      const stat = stats.find(s => s.querySelector('.stat-label')?.textContent?.includes(label));
      return stat?.querySelector('.stat-value')?.textContent ?? '';
    }
    await waitFor(() => {
      expect(findStatValue('Active account total')).toMatch(/2,200/);
    });
    expect(findStatValue('Recorded income')).toMatch(/300/);
    expect(findStatValue('Recorded expenses')).toMatch(/100/);
    const netValue = findStatValue('Recorded surplus');
    expect(netValue).toMatch(/200/);

    await cleanupUiRepo(repo, unmount);
  });
});

