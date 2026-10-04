import { within } from '@testing-library/react';
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => { cleanup(); });

describe('Debt UI', () => {
  it('create, projection, deactivate, edit, delete, non-amortizing warning', async () => {
    const { repo } = makeUiRepo('debt-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'DebtTest', password: 'pw', data });
    const { unmount } = renderFolio(repo);
    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /DebtTest/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /DebtTest/ });
    fireEvent.click(profileBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const debtTab = screen.getAllByRole('button', { name: /Debt/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Debt/ })[0];
    fireEvent.click(debtTab);
    await waitFor(() => screen.getByText(/Debt/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add debt/ }));
    await waitFor(() => screen.getByRole('dialog', { name: /New debt/i }));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Credit' } });
    fireEvent.change(screen.getByLabelText(/Balance/i), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText(/Annual rate %/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/Monthly payment/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Credit/));
    const row = screen.getAllByText(/Credit/)[0].closest('tr');
    expect(row?.textContent).toContain('Yes');
    fireEvent.click(screen.getAllByRole('button', { name: /Deactivate/ })[0]);
    await waitFor(() => {
      const r = screen.getAllByText(/Credit/)[0].closest('tr');
      expect(r?.textContent).toContain('Inactive');
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Activate/ })[0]);
    await waitFor(() => {
      const r = screen.getAllByText(/Credit/)[0].closest('tr');
      expect(r?.textContent).toContain('Active');
    });
    // edit
    const editBtn = screen.getAllByRole('button', { name: /Edit/ }).find(b => b.closest('tr')?.textContent?.includes('Credit'));
    if (editBtn) fireEvent.click(editBtn);
    await waitFor(() => screen.getByRole('dialog', { name: /Edit debt/i }));
    fireEvent.change(screen.getByLabelText(/Monthly payment/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Payment does not cover interest/));
    fireEvent.click(screen.getAllByRole('button', { name: /Delete/ })[0]);
    expect(screen.getByRole('dialog', { name: 'Delete debt' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByRole('button', { name: /Delete/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Delete/ })[0]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => screen.getByText(/No debts yet/));
    await cleanupUiRepo(repo, unmount);
  });
});



