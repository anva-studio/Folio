// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

const { vi } = await import('vitest');

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Phase E integration workflow', () => {
  it('covers account, income/expense, recurring, debt, goal, Health, Planner, Reports with assertions', async () => {
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    const { repo } = makeUiRepo('phase-e');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'PhaseE', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /PhaseE/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /PhaseE/ });
    fireEvent.click(profileBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));

    // Accounts
    const accountsTab = screen.getAllByRole('button', { name: /Accounts/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Accounts/ })[0];
    fireEvent.click(accountsTab);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add account/ }));
    await waitFor(() => screen.getByText(/New account/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Main' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '10000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => {
      const rows = document.querySelectorAll('[class*="list-row"], [role="row"]');
      const mainRow = Array.from(rows).find(r => r.textContent?.includes('Main'));
      expect(mainRow).toBeTruthy();
    });

    // Categories
    const transactionsTab = screen.getAllByRole('button', { name: /Transactions/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Transactions/ })[0];
    fireEvent.click(transactionsTab);
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
    await waitFor(() => screen.getByText(/Manage categories/i, { selector: '.modal-title' }));
    fireEvent.click(screen.getByRole('button', { name: /New income categories category/ }));
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'IncomeCat' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/IncomeCat/));
    fireEvent.click(screen.getByRole('button', { name: /New expense categories category/ }));
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'ExpenseCat' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/ExpenseCat/));
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));

    // Income transaction
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const incomeTypeBtn = screen.getAllByRole('button', { name: /income/ })[0];
    fireEvent.click(incomeTypeBtn);
    const dateInput = document.querySelector('#transaction-date') as HTMLInputElement;
    if (dateInput) fireEvent.change(dateInput, { target: { value: '2026-09-26' } });
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '5000.00' } });
    const accSelect = document.querySelector('#transaction-account') as HTMLSelectElement;
    const mainOpt = Array.from(accSelect.options).find(o => o.textContent?.includes('Main'));
    if (!mainOpt) throw new Error('Main account option missing');
    fireEvent.change(accSelect, { target: { value: mainOpt.value } });
    const catSelect = document.querySelector('#transaction-category') as HTMLSelectElement;
    const incCatOpt = Array.from(catSelect.options).find(o => o.textContent?.includes('IncomeCat'));
    fireEvent.change(catSelect, { target: { value: incCatOpt?.value ?? '' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/₹5,000.00/));

    // Expense transaction
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const expenseTypeBtn = screen.getAllByRole('button', { name: /expense/ })[0];
    fireEvent.click(expenseTypeBtn);
    const dateInput2 = document.querySelector('#transaction-date') as HTMLInputElement;
    if (dateInput2) fireEvent.change(dateInput2, { target: { value: '2026-09-26' } });
    fireEvent.change(document.querySelector('#transaction-amount') as HTMLInputElement, { target: { value: '2000.00' } });
    fireEvent.change(document.querySelector('#transaction-account') as HTMLSelectElement, { target: { value: mainOpt.value } });
    const expCatSelect = document.querySelector('#transaction-category') as HTMLSelectElement;
    const expCatOpt = Array.from(expCatSelect.options).find(o => o.textContent?.includes('ExpenseCat'));
    fireEvent.change(expCatSelect, { target: { value: expCatOpt?.value ?? '' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/₹2,000.00/));

    // Dashboard assertions actual vs committed separate
    const dashboardTab = screen.getAllByRole('button', { name: /Dashboard/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Dashboard/ })[0];
    fireEvent.click(dashboardTab);
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    await waitFor(() => screen.getByText(/Active account total/i));
    const findStat = (label: string) => {
      const stats = Array.from(document.querySelectorAll('.stat'));
      const s = stats.find(el => el.querySelector('.stat-label')?.textContent?.includes(label));
      return s?.querySelector('.stat-value')?.textContent ?? '';
    };
    expect(findStat('Active account total')).toMatch(/13,000/);
    expect(findStat('Recorded income')).toMatch(/5,000/);
    expect(findStat('Recorded expenses')).toMatch(/2,000/);

    // Recurring
    const recurringTab = screen.getAllByRole('button', { name: /Scheduled/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Scheduled/ })[0];
    fireEvent.click(recurringTab);
    await waitFor(() => screen.getByText(/Scheduled/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'RecurringIncome' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '5000.00' } });
    fireEvent.click(screen.getAllByRole('button', { name: /income/ })[0]);
    // set day of month to 26 to match test date
    const dayInput = document.querySelector('#recurring-day-of-month') as HTMLInputElement;
    if (dayInput) fireEvent.change(dayInput, { target: { value: '26' } });
    fireEvent.change(document.querySelector('#recurring-account') as HTMLSelectElement, { target: { value: mainOpt.value } });
    fireEvent.change(document.querySelector('#recurring-category') as HTMLSelectElement, { target: { value: incCatOpt?.value ?? '' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/RecurringIncome/));

    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'RecurringExpense' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '2000.00' } });
    fireEvent.click(screen.getAllByRole('button', { name: /expense/ })[0]);
    const dayInput2 = document.querySelector('#recurring-day-of-month') as HTMLInputElement;
    if (dayInput2) fireEvent.change(dayInput2, { target: { value: '26' } });
    fireEvent.change(document.querySelector('#recurring-account') as HTMLSelectElement, { target: { value: mainOpt.value } });
    fireEvent.change(document.querySelector('#recurring-category') as HTMLSelectElement, { target: { value: expCatOpt?.value ?? '' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/RecurringExpense/));

    // Debt
    const debtTab = screen.getAllByRole('button', { name: /Debt/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Debt/ })[0];
    fireEvent.click(debtTab);
    await waitFor(() => screen.getByText(/Debt/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add debt/ }));
    await waitFor(() => screen.getByRole('dialog', { name: /New debt/i }));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Debt1' } });
    fireEvent.change(screen.getByLabelText(/Balance/i), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText(/Annual rate %/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/Monthly payment/i), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Debt1/));
    const debtSub = screen.getByText(/Total balance/i).closest('div')?.textContent ?? '';
    expect(debtSub).toContain('₹1,00,000.00');

    // Goal
    const goalsTab = screen.getAllByRole('button', { name: /Goals/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Goals/ })[0];
    fireEvent.click(goalsTab);
    await waitFor(() => screen.getByText(/Goals/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByRole('dialog'));
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Goal1' } });
    fireEvent.change(screen.getByLabelText(/Target amount/i), { target: { value: '120000' } });
    const methodSelect = screen.getByLabelText(/Method/i) as HTMLSelectElement;
    fireEvent.change(methodSelect, { target: { value: 'fixed' } });
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Goal1/));
    const goalRow = screen.getByText(/Goal1/).closest('article');
    expect(goalRow?.textContent).toContain('₹1,20,000.00');

    // Health
    const healthTab = screen.getAllByRole('button', { name: /Health/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Health/ })[0];
    fireEvent.click(healthTab);
    await waitFor(() => screen.getByText(/Health checks/i, { selector: '.screen-title' }));
    const liquidInput = screen.getByLabelText<HTMLInputElement>(/Liquid funds/i);
    expect(liquidInput.value).toBe('');
    fireEvent.change(liquidInput, { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText(/Monthly income/i), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText(/Monthly expenses/i), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText(/Annual income/i), { target: { value: '600000' } });
    await waitFor(() => screen.getByText(/₹50,000/));
    fireEvent.click(screen.getByRole('button', { name: /Edit targets/i }));
    await waitFor(() => screen.getByRole('dialog', { name: /Edit health targets/i }));
    fireEvent.change(screen.getByLabelText(/Target emergency months/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => {
      const ec = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Emergency reserve check'));
      expect(ec?.textContent).toContain('4');
    });

    // Planner
    const plannerTab = screen.getAllByRole('button', { name: /Planner/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Planner/ })[0];
    fireEvent.click(plannerTab);
    await waitFor(() => screen.getByText(/Try a purchase using explicit inputs/i));
    fireEvent.change(screen.getByLabelText(/Current liquid funds/i).closest('div')?.querySelector('input') as HTMLInputElement, { target: { value: '50000' } });
    // The planner inputs are inside .input-money, get input by id
    fireEvent.change(document.getElementById('currentLiquidFunds') as HTMLInputElement, { target: { value: '50000' } });
    fireEvent.change(document.getElementById('reserve') as HTMLInputElement, { target: { value: '120000' } });
    fireEvent.change(document.getElementById('currentMonthlySurplus') as HTMLInputElement, { target: { value: '20000' } });
    fireEvent.change(document.getElementById('upfrontCost') as HTMLInputElement, { target: { value: '50000' } });
    fireEvent.change(document.getElementById('addedMonthlyCost') as HTMLInputElement, { target: { value: '2000' } });
    fireEvent.change(document.getElementById('horizonMonths') as HTMLInputElement, { target: { value: '12' } });
    await waitFor(() => screen.getByText(/Fits these supplied conditions/i));

    // Verify scenario does not mutate persistent data
    const lockBtn = screen.getAllByRole('button', { name: /Lock/ })[0];
    fireEvent.click(lockBtn);
    await waitFor(() => screen.getByText(/Select a profile/i));
    // Reopen
    const profileBtn2 = screen.getAllByRole('button', { name: /PhaseE/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /PhaseE/ });
    fireEvent.click(profileBtn2);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    // Dashboard is already active after unlock; re-query stats
    await waitFor(() => screen.getByText(/Active account total/i));
    expect(findStat('Active account total')).toMatch(/13,000/);

    // Reports
    const reportsTab = screen.getAllByRole('button', { name: /Reports/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Reports/ })[0];
    fireEvent.click(reportsTab);
    await waitFor(() => screen.getByText(/Recorded transactions and separate schedules/i));
    const monthSelect = screen.getByRole('combobox');
    fireEvent.change(monthSelect, { target: { value: '6' } });
    await waitFor(() => screen.getByText('September 2026'));
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tbody tr'));
    const sepRow = rows.find(r => r.cells[0].textContent?.includes('September 2026'));
    expect(sepRow).toBeTruthy();
    expect(sepRow!.cells[1].textContent).toContain('₹5,000.00'); // actual income
    expect(sepRow!.cells[2].textContent).toContain('₹2,000.00'); // actual expense
    expect(sepRow!.cells[4].textContent).toContain('₹5,000.00'); // committed income
    expect(sepRow!.cells[5].textContent).toContain('₹2,000.00'); // committed expense

    // Debt summary correct in reports
    expect(screen.getByText('Total balance')).toBeTruthy();
    expect(screen.getByText('₹1,00,000.00')).toBeTruthy();
    expect(screen.getByText('Monthly payment')).toBeTruthy();
    const fiveKMatches = screen.getAllByText('₹5,000.00');
    expect(fiveKMatches.length).toBeGreaterThan(0);

    vi.useRealTimers();
    await cleanupUiRepo(repo, unmount);
  });
});

