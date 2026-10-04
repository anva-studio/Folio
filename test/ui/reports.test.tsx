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

describe('Reports UI flow', () => {
  it('displays actual vs committed cash flow table with exact values', async () => {
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    const { repo } = makeUiRepo('reports');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const base = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    const profileData = {
      ...base,
      accounts: [
        { id: 'a1', name: 'Bank', type: 'bank' as const, openingBalance: 0, archived: false, createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 'a2', name: 'Savings', type: 'bank' as const, openingBalance: 0, archived: false, createdAt: '2026-09-26T00:00:00.000Z' },
      ],
      categories: [
        { id: 'c1', name: 'Salary', kind: 'income' as const },
        { id: 'c2', name: 'Rent', kind: 'expense' as const },
        { id: 'c3', name: 'Food', kind: 'expense' as const },
      ],
      txns: [
        { id: 't1', type: 'income' as const, date: '2026-09-01', amount: 20000000, accountId: 'a1', categoryId: 'c1', createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 't2', type: 'expense' as const, date: '2026-09-05', amount: 5000000, accountId: 'a1', categoryId: 'c2', createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 't3', type: 'expense' as const, date: '2026-09-10', amount: 1500000, accountId: 'a1', categoryId: 'c3', createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 't4', type: 'transfer' as const, date: '2026-09-12', amount: 1000000, accountId: 'a1', toAccountId: 'a2', createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 't5', type: 'income' as const, date: '2026-09-15', amount: 5000000, accountId: 'a1', categoryId: 'c1', createdAt: '2026-09-26T00:00:00.000Z', archived: true },
        { id: 't6', type: 'expense' as const, date: '2026-08-01', amount: 5000000, accountId: 'a1', categoryId: 'c2', createdAt: '2026-09-26T00:00:00.000Z' },
      ],
      recurring: [
        { id: 'r1', name: 'Salary Rec', kind: 'income' as const, amount: 20000000, frequency: 'monthly' as const, dayOfMonth: 1, accountId: 'a1', categoryId: 'c1', startDate: '2026-01-01', active: true },
        { id: 'r2', name: 'Rent Rec', kind: 'expense' as const, amount: 5000000, frequency: 'monthly' as const, dayOfMonth: 5, accountId: 'a1', categoryId: 'c2', startDate: '2026-01-01', active: true },
        { id: 'r3', name: 'Food Rec', kind: 'expense' as const, amount: 1500000, frequency: 'monthly' as const, dayOfMonth: 10, accountId: 'a1', categoryId: 'c3', startDate: '2026-01-01', active: true },
      ],
      debts: [
        { id: 'd1', name: 'Credit Card', kind: 'credit-card' as const, balance: 3000000, annualRatePct: 36, monthlyPayment: 300000, active: true },
        { id: 'd2', name: 'Personal Loan', kind: 'personal' as const, balance: 1200000, annualRatePct: 12, monthlyPayment: 50000, active: true },
      ],
      goals: [
        { id: 'g1', name: 'Emergency Fund', targetAmount: 6000000, method: 'fixed' as const, monthlyContribution: 500000, manualSaved: 2000000, active: true, createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 'g2', name: 'Vacation', targetAmount: 3000000, method: 'fixed' as const, monthlyContribution: 100000, manualSaved: 500000, active: true, createdAt: '2026-09-26T00:00:00.000Z' },
      ],
    };
    await repo.createProfile({ label: 'ReportsExact', password: 'pw', data: profileData });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /ReportsExact/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /ReportsExact/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const reportsTabs = screen.getAllByRole('button', { name: /Reports/ });
    const reportsTab = reportsTabs.find(b => b.className.includes('nav-item')) ?? reportsTabs[0];
    fireEvent.click(reportsTab);
    await waitFor(() => screen.getByText(/Recorded transactions and separate schedules/i));

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '6' } });
    await waitFor(() => {
      const rows = document.querySelectorAll('table tbody tr');
      expect(rows.length).toBeGreaterThan(0);
    });

    // Verify headers
    expect(screen.getByText('Recorded income')).toBeTruthy();
    expect(screen.getByText('Scheduled income less expenses')).toBeTruthy();

    // Find 2026-09 row
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tbody tr'));
    const sepRow = rows.find(r => r.cells[0].textContent?.includes('September 2026'));
    expect(sepRow).toBeTruthy();
    const cells = sepRow!.cells;
    expect(cells[1].textContent).toContain('₹2,00,000.00'); // actual income
    expect(cells[2].textContent).toContain('₹65,000.00');   // actual expense
    expect(cells[3].textContent).toContain('₹1,35,000.00'); // actual net
    expect(cells[4].textContent).toContain('₹2,00,000.00'); // committed income
    expect(cells[5].textContent).toContain('₹65,000.00');   // committed expense
    expect(cells[6].textContent).toContain('₹1,35,000.00'); // committed net

    // Transfer excluded & archived excluded
    expect(screen.queryByText('₹2,50,000.00')).toBeNull();

    // Select month for category breakdown
    const monthBtn = screen.getByRole('button', { name: /Select 2026-09 for category breakdown/ });
    fireEvent.click(monthBtn);
    await waitFor(() => screen.getByText('Rent'));
    // Expense category totals exact
    const rentRow = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tbody tr')).find(r => r.cells[0].textContent?.includes('Rent'));
    expect(rentRow).toBeTruthy();
    expect(rentRow!.cells[1].textContent).toContain('₹50,000.00');
    expect(rentRow!.cells[2].textContent).toContain('76.9%');
    const foodRow = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tbody tr')).find(r => r.cells[0].textContent?.includes('Food'));
    expect(foodRow).toBeTruthy();
    expect(foodRow!.cells[1].textContent).toContain('₹15,000.00');
    expect(foodRow!.cells[2].textContent).toContain('23.1%');

    // Active account total exact
    await waitFor(() => screen.getByText('Active account total'));
    const consolidatedEl = Array.from(document.querySelectorAll('.list-row')).find(el => el.textContent?.includes('Active account total'));
    expect(consolidatedEl).toBeTruthy();
    expect(consolidatedEl!.textContent).toContain('₹85,000.00');

    // Debt summary exact
    expect(screen.getByText('Total balance')).toBeTruthy();
    expect(screen.getByText('₹42,000.00')).toBeTruthy();
    expect(screen.getByText('Monthly payment')).toBeTruthy();
    expect(screen.getByText('₹3,500.00')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // active debts
    expect(screen.getByText('0')).toBeTruthy(); // non-amortizing

    // Goal summary exact
    await waitFor(() => screen.getByText('Emergency Fund'));
    const goalRows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table tbody tr'));
    const efRow = goalRows.find(r => r.cells[0].textContent?.includes('Emergency Fund'));
    expect(efRow).toBeTruthy();
    expect(efRow!.cells[1].textContent).toContain('₹60,000.00');
    expect(efRow!.cells[2].textContent).toContain('₹20,000.00');
    expect(efRow!.cells[3].textContent).toContain('₹40,000.00');
    expect(efRow!.cells[4].textContent).toContain('33%');

    const vacRow = goalRows.find(r => r.cells[0].textContent?.includes('Vacation')) as HTMLTableRowElement | undefined;
    expect(vacRow).toBeTruthy();
    expect(vacRow!.cells[1].textContent).toContain('₹30,000.00');
    expect(vacRow!.cells[2].textContent).toContain('₹5,000.00');
    expect(vacRow!.cells[3].textContent).toContain('₹25,000.00');
    expect(vacRow!.cells[4].textContent).toContain('17%');

    vi.useRealTimers();
    await cleanupUiRepo(repo, unmount);
  });

  it('shows empty report state for empty profile', async () => {
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    const { repo } = makeUiRepo('reports-empty');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'EmptyReports', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /EmptyReports/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /EmptyReports/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const reportsTabs = screen.getAllByRole('button', { name: /Reports/ });
    const reportsTab = reportsTabs.find(b => b.className.includes('nav-item')) ?? reportsTabs[0];
    fireEvent.click(reportsTab);
    await waitFor(() => screen.getByText(/Recorded transactions and separate schedules/i));

    expect(screen.getByText(/No report data yet/i)).toBeTruthy();
    // No generated month rows with zero history should be rendered
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    expect(rows.length).toBe(0);
    // Ensure no month row like 2026-09 exists in cash-flow history
    expect(screen.queryByText('2026-09')).toBeNull();

    vi.useRealTimers();
    await cleanupUiRepo(repo, unmount);
  });
});

