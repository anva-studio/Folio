// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import 'fake-indexeddb/auto';

afterEach(() => {
  cleanup();
});

describe('Recurring UI flow', () => {
  it('creates and toggles recurring commitment', async () => {
    const { repo } = makeUiRepo('recurring-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'Scheduled', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /Scheduled/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /Scheduled/ });
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

    const recurringTabs = screen.getAllByRole('button', { name: /Scheduled/ });
    const recurringTab = recurringTabs.find(b => b.className.includes('nav-item')) ?? recurringTabs[0];
    fireEvent.click(recurringTab);
    await waitFor(() => screen.getByText(/Scheduled/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'Salary' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '50000.00' } });
    const kindButtons = screen.getAllByRole('button', { name: /income/ });
    fireEvent.click(kindButtons[0]);
    // Account optional for recurring income, leave empty
    const accountSelect = document.querySelector('#recurring-account') as HTMLSelectElement | null;
    if (accountSelect) {
      fireEvent.change(accountSelect, { target: { value: '' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Salary/));
    const activeTexts = screen.getAllByText(/Active/);
    expect(activeTexts.length).toBeGreaterThan(0);

    const deactivateBtn = screen.getAllByRole('button', { name: /Deactivate/ })[0];
    fireEvent.click(deactivateBtn);
    await waitFor(() => screen.getByText(/Inactive/));

    await cleanupUiRepo(repo, unmount);
  });

  it('recurring create/deactivate/reactivate/edit/delete', async () => {
    const { repo } = makeUiRepo('recurring-crud-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();
    const data = createEmptyProfileData({ now: () => '2026-09-26T00:00:00.000Z' });
    await repo.createProfile({ label: 'RecurringCRUD', password: 'pw', data });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /RecurringCRUD/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /RecurringCRUD/ });
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

    const recurringTabs = screen.getAllByRole('button', { name: /Scheduled/ });
    const recurringTab = recurringTabs.find(b => b.className.includes('nav-item')) ?? recurringTabs[0];
    fireEvent.click(recurringTab);
    await waitFor(() => screen.getByText(/Scheduled/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'Gym' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '500.00' } });
    const expenseKindBtn = screen.getAllByRole('button', { name: /expense/ })[0];
    fireEvent.click(expenseKindBtn);
    const accountSelect = document.querySelector('#recurring-account') as HTMLSelectElement;
    const bankOption = Array.from(accountSelect.options).find(o => o.textContent?.includes('Bank'));
    if (bankOption) fireEvent.change(accountSelect, { target: { value: bankOption.value } });
    // Create category for recurring
    const transactionsTabs = screen.getAllByRole('button', { name: /Transactions/ });
    const transactionsTab = transactionsTabs.find(b => b.className.includes('nav-item')) ?? transactionsTabs[0];
    fireEvent.click(transactionsTab);
    expect(screen.getByRole('dialog', { name: 'Discard unfinished entry?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard entry' }));
    await waitFor(() => screen.getByText(/Transactions/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
    await waitFor(() => screen.getByText(/Manage categories/i, { selector: '.modal-title' }));
    const expenseNewCatBtn = screen.getByRole('button', { name: /New expense categories category/ });
    fireEvent.click(expenseNewCatBtn);
    await waitFor(() => screen.getByLabelText(/Name/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Health' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByRole('button', { name: /Edit Health category/ }));
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));
    // Back to recurring
    fireEvent.click(recurringTab);
    await waitFor(() => screen.getByText(/Scheduled/i, { selector: '.screen-title' }));
    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'Gym' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '500.00' } });
    fireEvent.click(expenseKindBtn);
    const catSelect = document.querySelector('#recurring-category') as HTMLSelectElement;
    const healthOption = Array.from(catSelect.options).find(o => o.textContent?.includes('Health'));
    if (healthOption) fireEvent.change(catSelect, { target: { value: healthOption.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Gym/));
    const row = screen.getByText(/Gym/).closest('tr');
    expect(within(row ?? document.body).getByText(/Active/)).toBeTruthy();

    // Deactivate
    const deactivateBtn = within(row ?? document.body).getByRole('button', { name: /Deactivate/ });
    fireEvent.click(deactivateBtn);
    await waitFor(() => within(row ?? document.body).getByText(/Inactive/));

    // Reactivate
    const activateBtn = within(row ?? document.body).getByRole('button', { name: /Activate/ });
    fireEvent.click(activateBtn);
    await waitFor(() => within(row ?? document.body).getByText(/Active/));

    // Edit
    const editBtn = within(row ?? document.body).getByRole('button', { name: /Edit/ });
    fireEvent.click(editBtn);
    await waitFor(() => screen.getByText(/Edit schedule/i, { selector: '.modal-title' }));
    const nameInput = document.querySelector('#recurring-name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Gym Pro' } });
    const amountInput = document.querySelector('#recurring-amount') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '600.00' } });
    // Ensure category preserved
    const editCatSelect = document.querySelector('#recurring-category') as HTMLSelectElement;
    expect(editCatSelect.value).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Gym Pro/));
    const updatedRow = screen.getByText(/Gym Pro/).closest('tr');
    expect(within(updatedRow ?? document.body).getByText(/600/)).toBeTruthy();
    expect(within(updatedRow ?? document.body).getByText(/Health/)).toBeTruthy();

    // Conditional schedule controls
    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'WeeklyTest' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '100.00' } });
    const freqSelect = document.querySelector('#recurring-frequency') as HTMLSelectElement;
    fireEvent.change(freqSelect, { target: { value: 'weekly' } });
    expect(screen.getByLabelText(/Day of week/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Day of month/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/WeeklyTest/));

    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'MonthlyTest' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '200.00' } });
    fireEvent.change(freqSelect, { target: { value: 'monthly' } });
    expect(screen.getByLabelText(/Day of month/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Day of week/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/MonthlyTest/));

    // Delete
    const gymProRow = screen.getByText(/Gym Pro/).closest('tr');
    const deleteBtn = within(gymProRow ?? document.body).getByRole('button', { name: /Delete/ });
    fireEvent.click(deleteBtn);
    await waitFor(() => screen.getByText(/Delete this schedule/));
    const confirmDeleteBtn = screen.getAllByRole('button', { name: /Delete/ }).find(b => b.className.includes('btn-danger')) ?? screen.getByRole('button', { name: /Delete/ });
    fireEvent.click(confirmDeleteBtn);
    await waitFor(() => {
      expect(screen.queryByText(/Gym Pro/)).toBeNull();
    });

    // Category-preservation edit regression: create recurring with category, edit name only
    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => screen.getByText(/New schedule/i, { selector: '.modal-title' }));
    fireEvent.change(document.querySelector('#recurring-name') as HTMLInputElement, { target: { value: 'Gym2' } });
    fireEvent.change(document.querySelector('#recurring-amount') as HTMLInputElement, { target: { value: '400.00' } });
    const catSelect2 = document.querySelector('#recurring-category') as HTMLSelectElement;
    const healthOpt2 = Array.from(catSelect2.options).find(o => o.textContent?.includes('Health'));
    if (healthOpt2) fireEvent.change(catSelect2, { target: { value: healthOpt2.value } });
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    await waitFor(() => screen.getByText(/Gym2/));
    const gym2Row = screen.getByText(/Gym2/).closest('tr');
    const editBtn2 = within(gym2Row ?? document.body).getByRole('button', { name: /Edit/ });
    fireEvent.click(editBtn2);
    await waitFor(() => screen.getByText(/Edit schedule/i, { selector: '.modal-title' }));
    const nameInput2 = document.querySelector('#recurring-name') as HTMLInputElement;
    fireEvent.change(nameInput2, { target: { value: 'Gym2 Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Gym2 Renamed/));
    const renamedRow = screen.getByText(/Gym2 Renamed/).closest('tr');
    expect(within(renamedRow ?? document.body).getByText(/Health/)).toBeTruthy();

    await cleanupUiRepo(repo, unmount);
  });
});

