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

describe('Health UI', () => {
  it('covers Health UI requirements: explicit inputs, no auto-fill, no overall score, metrics, config persistence', async () => {
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    const { repo } = makeUiRepo('health-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    const now = '2026-09-26T00:00:00.000Z';
    const base = createEmptyProfileData({ now: () => now });
    const profileData = {
      ...base,
      accounts: [
        { id: 'a1', name: 'Bank', type: 'bank' as const, openingBalance: 50000000, archived: false, createdAt: now },
      ],
      categories: [
        { id: 'c1', name: 'Salary', kind: 'income' as const },
        { id: 'c2', name: 'Food', kind: 'expense' as const },
      ],
      debts: [
        { id: 'd1', name: 'Loan', kind: 'emi' as const, balance: 20000000, annualRatePct: 10, monthlyPayment: 500000, active: true },
      ],
    };

    await repo.createProfile({ label: 'HealthTest', password: 'pw', data: profileData });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /HealthTest/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /HealthTest/ });
    fireEvent.click(profileBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const healthTab = screen.getAllByRole('button', { name: /Health/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Health/ })[0];
    fireEvent.click(healthTab);
    await waitFor(() => screen.getByText(/Health checks/i, { selector: '.screen-title' }));

    // liquid funds starts empty / explicit
    const liquidInput = screen.getByLabelText<HTMLInputElement>(/Liquid funds/i);
    expect(liquidInput.value).toBe('');
    // account balances not auto-inserted
    const emergencyCard = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Emergency reserve check'));
    expect(emergencyCard?.textContent).toContain('Not supplied');

    // no overall health score exists
    expect(screen.getByText(/No overall score/i)).toBeTruthy();
    // ensure no standalone "Overall score" label/value
    expect(screen.queryByText(/^Overall score$/i)).toBeNull();

    // fill inputs
    fireEvent.change(liquidInput, { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText(/Monthly income/i), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText(/Monthly expenses/i), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText(/Annual income/i), { target: { value: '600000' } });

    await waitFor(() => {
      expect(screen.getByText(/₹10,000/)).toBeTruthy();
    });

    // manual liquid funds works
    const emergencyCardAfter = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Emergency reserve check'));
    expect(emergencyCardAfter?.textContent).toContain('₹10,000');

    // monthly income / expenses / annual income work
    const savingsCard = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Surplus check'));
    expect(savingsCard?.textContent).toContain('₹20,000'); // 50k - 30k
    expect(savingsCard?.textContent).toContain('40.0%');

    const debtCard = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Outstanding debt / annual income'));
    // debt total shown via controller/Debt engine
    expect(debtCard?.textContent).toContain('₹2,00,000');
    expect(debtCard?.textContent).toContain('0.33');

    // zero-income canonical behavior
    fireEvent.change(screen.getByLabelText(/Annual income/i), { target: { value: '0' } });
    await waitFor(() => {
      const dc = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Outstanding debt / annual income'));
      expect(dc?.textContent).toContain('Cannot calculate');
      expect(dc?.textContent).toContain('Cannot assess');
    });

    // restore annual income for further tests
    fireEvent.change(screen.getByLabelText(/Annual income/i), { target: { value: '600000' } });
    // zero monthly income -> savings rate — and meets target —
    fireEvent.change(screen.getByLabelText(/Monthly income/i), { target: { value: '0' } });
    await waitFor(() => {
      const sc = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Surplus check'));
      expect(sc?.textContent).toContain('Cannot calculate');
    });
    // restore monthly income
    fireEvent.change(screen.getByLabelText(/Monthly income/i), { target: { value: '50000' } });

    // editing HealthConfig updates visible metrics
    fireEvent.click(screen.getByRole('button', { name: /Edit targets/i }));
    await waitFor(() => screen.getByRole('dialog', { name: /Edit health targets/i }));
    fireEvent.change(screen.getByLabelText(/Target emergency months/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => {
      const ec = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Emergency reserve check'));
      expect(ec?.textContent).toContain('3');
      expect(ec?.textContent).toContain('₹90,000');
    });

    // HealthConfig persists through flush/lock/reopen
    const lockBtn = screen.getAllByRole('button', { name: /Lock/ })[0];
    fireEvent.click(lockBtn);
    await waitFor(() => screen.getByText(/Select a profile/i));

    const profileBtn2 = screen.getAllByRole('button', { name: /HealthTest/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /HealthTest/ });
    fireEvent.click(profileBtn2);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    // re-select health tab after unlock (reference may be stale)
    const healthTab2 = screen.getAllByRole('button', { name: /Health/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Health/ })[0];
    fireEvent.click(healthTab2);
    await waitFor(() => screen.getByText(/Health checks/i, { selector: '.screen-title' }));

    // config persisted
    const emergencyCardPersisted = Array.from(document.querySelectorAll('.card')).find(c => c.textContent?.includes('Emergency reserve check'));
    expect(emergencyCardPersisted?.textContent).toContain('3');

    vi.useRealTimers();
    await cleanupUiRepo(repo, unmount);
  });
});

