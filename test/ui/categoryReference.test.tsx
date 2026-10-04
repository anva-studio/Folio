// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('Category reference protection', () => {
  it('prevents deletion of referenced category', async () => {
    const { repo } = makeUiRepo('category-ref-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'CatRef', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /CatRef/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /CatRef/ });
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
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Bank' } });
    fireEvent.change(screen.getByLabelText(/Opening balance/i), { target: { value: '1000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Bank/));

    const transactionsTabs = screen.getAllByRole('button', { name: /Transactions/ });
    const transactionsTab = transactionsTabs.find(b => b.className.includes('nav-item')) ?? transactionsTabs[0];
    fireEvent.click(transactionsTab);
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
    await waitFor(() => screen.getByText(/Income Categories/i));
    const newCatButtons = await waitFor(() => screen.getAllByText(/New category/i));
    fireEvent.click(newCatButtons[0]);
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Salary' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => {
      const items = screen.getAllByText(/Salary/);
      expect(items.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }));
    await waitFor(() => screen.getByText(/New transaction/i, { selector: '.modal-title' }));
    const typeButtons = screen.getAllByRole('button', { name: /income/ });
    fireEvent.click(typeButtons[0]);
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '5000.00' } });
    const catSelect = screen.getByLabelText(/^Category$/i) as HTMLSelectElement;
    const salaryOption = Array.from(catSelect.options).find(o=>o.textContent?.includes('Salary'));
    if (!salaryOption) throw new Error('Salary option not found');
    fireEvent.change(catSelect, { target: { value: salaryOption.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => {
      const items = screen.getAllByText(/Salary/);
      expect(items.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
    await waitFor(() => {
      const items = screen.getAllByText(/Salary/);
      expect(items.length).toBeGreaterThan(0);
    });
    const deleteBtn = screen.getAllByRole('button', { name: /Delete/ }).find(b => b.closest('div')?.textContent?.includes('Salary')) ?? screen.getAllByRole('button', { name: /Delete/ })[0];
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const errors = screen.getAllByText(/can't be deleted/i);
      expect(errors.length).toBeGreaterThan(0);
    }, { timeout: 4000 });

    await cleanupUiRepo(repo, unmount);
  });

  it('unused category deletion succeeds', async () => {
    const { repo } = makeUiRepo('category-unused-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'CatUnused', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /CatUnused/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /CatUnused/ });
    fireEvent.click(profileBtn);
    const pwdInput = screen.getByLabelText(/Password/i);
    fireEvent.change(pwdInput, { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const transactionsTabs = screen.getAllByRole('button', { name: /Transactions/ });
    const transactionsTab = transactionsTabs.find(b => b.className.includes('nav-item')) ?? transactionsTabs[0];
    fireEvent.click(transactionsTab);
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
    await waitFor(() => screen.getAllByText(/Expense Categories/i)[0]);
    const newCatButtons2 = await waitFor(() => screen.getAllByText(/New category/i));
    fireEvent.click(newCatButtons2[0]);
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Misc' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Misc/));
    const deleteBtn = screen.getAllByRole('button', { name: /Delete/ }).find(b => b.closest('div')?.textContent?.includes('Misc')) ?? screen.getAllByRole('button', { name: /Delete/ })[0];
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(screen.queryByText(/Misc/)).toBeNull();
    });

    await cleanupUiRepo(repo, unmount);
  });
});

