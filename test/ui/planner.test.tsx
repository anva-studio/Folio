// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('Planner UI flow', () => {
  it('shows scenario results without persisting data', async () => {
    const { repo } = makeUiRepo('planner');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    // Setup data with accounts, categories, txns, recurring, debts, goals
    const profileData = {
      ...data,
      accounts: [
        { id: 'a1', name: 'Bank', type: 'bank' as const, openingBalance: 500000, archived: false, createdAt: '2026-09-26T00:00:00.000Z' },
      ],
      categories: [
        { id: 'c1', name: 'Salary', kind: 'income' as const },
        { id: 'c2', name: 'Food', kind: 'expense' as const },
      ],
      txns: [
        { id: 't1', type: 'income' as const, date: '2026-09-01', amount: 200000, accountId: 'a1', categoryId: 'c1', createdAt: '2026-09-26T00:00:00.000Z' },
        { id: 't2', type: 'expense' as const, date: '2026-09-10', amount: 50000, accountId: 'a1', categoryId: 'c2', createdAt: '2026-09-26T00:00:00.000Z' },
      ],
      recurring: [
        { id: 'r1', name: 'Rent', kind: 'expense' as const, amount: 20000, frequency: 'monthly' as const, dayOfMonth: 5, startDate: '2026-01-01', active: true },
      ],
      debts: [
        { id: 'd1', name: 'Credit Card', kind: 'credit-card' as const, balance: 50000, annualRatePct: 36, monthlyPayment: 5000, active: true },
      ],
      goals: [
        { id: 'g1', name: 'Vacation', targetAmount: 200000, method: 'fixed' as const, monthlyContribution: 10000, active: true, createdAt: '2026-09-26T00:00:00.000Z' },
      ],
    };
    const created = await repo.createProfile({ label: 'PlannerTest', password: 'pw', data: profileData });
    const profileId = created.profileId;
    const originalSnapshot = structuredClone(profileData);
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /PlannerTest/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /PlannerTest/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const plannerTabs = screen.getAllByRole('button', { name: /Planner/ });
    const plannerTab = plannerTabs.find(b => b.className.includes('nav-item')) ?? plannerTabs[0];
    fireEvent.click(plannerTab);
    await waitFor(() => screen.getByText(/Try a purchase using explicit inputs/i));

    fireEvent.change(screen.getByLabelText('Horizon months'), { target: { value: '1.5' } });
    expect(screen.getByText('Must be positive integer')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Horizon months'), { target: { value: '12' } });
    // Input values
    const inputs = Array.from(document.querySelectorAll('input.input'));
    const liquidEl = inputs.find(i => i.closest('.field')?.querySelector('.label')?.textContent?.includes('Current liquid funds'));
    const reserveEl = inputs.find(i => i.closest('.field')?.querySelector('.label')?.textContent?.includes('Emergency reserve target'));
    const surplusEl = inputs.find(i => i.closest('.field')?.querySelector('.label')?.textContent?.includes('Current monthly surplus'));
    const upfrontEl = inputs.find(i => i.closest('.field')?.querySelector('.label')?.textContent?.includes('Upfront cost'));
    const monthlyEl = inputs.find(i => i.closest('.field')?.querySelector('.label')?.textContent?.includes('Added monthly cost'));
    const horizonEl = document.querySelector('input[type="number"]') as HTMLInputElement;
    if (liquidEl) fireEvent.change(liquidEl, { target: { value: '500000' } });
    if (reserveEl) fireEvent.change(reserveEl, { target: { value: '150000' } });
    if (surplusEl) fireEvent.change(surplusEl, { target: { value: '150000' } });
    if (upfrontEl) fireEvent.change(upfrontEl, { target: { value: '100000' } });
    if (monthlyEl) fireEvent.change(monthlyEl, { target: { value: '5000' } });
    if (horizonEl) fireEvent.change(horizonEl, { target: { value: '12' } });

    await waitFor(() => {
      const overall = Array.from(document.querySelectorAll('.stat-value')).find(el => el.parentElement?.querySelector('.stat-label')?.textContent?.includes('Fits these supplied conditions'));
      expect(overall).toBeTruthy();
    });

    // Prove scenario transience via real persistence path
    const lockBtn = screen.getAllByRole('button', { name: /Lock/i })[0];
    fireEvent.click(lockBtn);
    await waitFor(() => screen.getByText(/Select a profile/i));

    // Reopen repository to ensure data is read from persistent store
    await repo.close();
    await repo.open();

    const unlocked = await repo.unlockProfile(profileId, 'pw');
    const afterData = unlocked.data;

    // Deep equality for persisted collections
    expect(afterData.accounts).toEqual(originalSnapshot.accounts);
    expect(afterData.categories).toEqual(originalSnapshot.categories);
    expect(afterData.txns).toEqual(originalSnapshot.txns);
    expect(afterData.recurring).toEqual(originalSnapshot.recurring);
    expect(afterData.debts).toEqual(originalSnapshot.debts);
    expect(afterData.goals).toEqual(originalSnapshot.goals);

    // No scenario fields leaked into persisted profile
    expect('scenario' in afterData).toBe(false);

    await cleanupUiRepo(repo, unmount);
  });
});


