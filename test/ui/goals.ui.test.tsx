import { within } from '@testing-library/react';
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

describe('Goals UI', () => {
  it('comprehensive GoalsScreen interactions', async () => {
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    const { repo } = makeUiRepo('goals-ui');
    await repo.open();
    await repo.deleteDatabase();
    await repo.open();

    const now = '2026-09-26T00:00:00.000Z';
    const base = createEmptyProfileData({ now: () => now });
    const profileData = {
      ...base,
      accounts: [
        { id: 'a1', name: 'Savings', type: 'bank' as const, openingBalance: 100000, archived: false, createdAt: now },
        { id: 'a2', name: 'Checking', type: 'bank' as const, openingBalance: 0, archived: false, createdAt: now },
        { id: 'a3', name: 'Old Account', type: 'bank' as const, openingBalance: 500000, archived: true, createdAt: now },
      ],
      categories: [
        { id: 'c1', name: 'Salary', kind: 'income' as const },
        { id: 'c2', name: 'Food', kind: 'expense' as const },
      ],
      txns: [
        { id: 't1', type: 'income' as const, date: '2026-09-01', amount: 100000, accountId: 'a1', categoryId: 'c1', createdAt: now },
        { id: 't2', type: 'expense' as const, date: '2026-09-10', amount: 30000, accountId: 'a1', categoryId: 'c2', createdAt: now },
      ],
    };

    await repo.createProfile({ label: 'GoalsTest', password: 'pw', data: profileData });
    const { unmount } = renderFolio(repo);

    await waitFor(() => screen.getByText(/Select a profile/i));
    const profileBtn = screen.getAllByRole('button', { name: /GoalsTest/ }).find(b => b.className.includes('profile-row-btn')) ?? screen.getByRole('button', { name: /GoalsTest/ });
    fireEvent.click(profileBtn);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));

    await waitFor(() => screen.getByText(/Dashboard/i, { selector: '.screen-title' }));
    const goalsTab = screen.getAllByRole('button', { name: /Goals/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Goals/ })[0];
    fireEvent.click(goalsTab);
    await waitFor(() => screen.getByText(/Goals/i, { selector: '.screen-title' }));

    // explicit monthly surplus requirement
    const surplusInput = document.querySelector('#availableMonthlySurplus') as HTMLInputElement;
    expect(surplusInput).toBeTruthy();
    expect(surplusInput.value).toBe('');

    // Use this month's recorded surplus
    fireEvent.click(screen.getByRole('button', { name: /Use this month's recorded surplus/ }));
    await waitFor(() => {
      expect(surplusInput.value).toBe('700');
    });

    // fixed goal
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByText(/New goal/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Emergency Fund' } });
    fireEvent.change(screen.getByLabelText(/Target amount/i), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Emergency Fund/));
    expect(screen.getByText(/Fixed monthly contribution/)).toBeTruthy();

    // target-date conditional fields
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByText(/New goal/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Vacation' } });
    fireEvent.change(screen.getByLabelText(/Target amount/i), { target: { value: '20000' } });
    const methodSelect1 = screen.getByLabelText(/Method/i);
    fireEvent.change(methodSelect1, { target: { value: 'target-date' } });
    await waitFor(() => screen.getByLabelText(/Target date/i));
    fireEvent.change(screen.getByLabelText(/Target date/i), { target: { value: '2027-12-31' } });
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Vacation/));

    // growth conditional fields
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByText(/New goal/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Investment' } });
    fireEvent.change(screen.getByLabelText(/Target amount/i), { target: { value: '100000' } });
    const methodSelect2 = screen.getByLabelText(/Method/i);
    fireEvent.change(methodSelect2, { target: { value: 'growth' } });
    await waitFor(() => screen.getByLabelText(/Annual rate %/i));
    fireEvent.change(screen.getByLabelText(/Annual rate %/i), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Investment/));

    // manual saved
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByText(/New goal/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Manual Goal' } });
    fireEvent.change(screen.getByLabelText(/Target amount/i), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/Amount already saved/i), { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Manual Goal/));

    // linked account live balance
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByText(/New goal/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Linked Goal' } });
    fireEvent.change(screen.getByLabelText(/Target amount/i), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '500' } });
    const linkedSelect = screen.getByLabelText(/Linked account/i);
    fireEvent.change(linkedSelect, { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Linked Goal/));
    await waitFor(() => screen.getByText(/1,700/));

    // archived account unavailable for NEW link
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByText(/New goal/i));
    const linkedSelectNew = screen.getByLabelText(/Linked account/i);
    const options = Array.from(linkedSelectNew.querySelectorAll('option')).map(o => o.textContent ?? '');
    expect(options).not.toContain('Old Account');
    // Close via Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    if (screen.queryByRole('button', { name: 'Discard entry' })) fireEvent.click(screen.getByRole('button', { name: 'Discard entry' }));
    await waitFor(() => screen.queryByRole('dialog', { name: /New goal/i }) === null);

    // historical archived link remains readable
    const accountsTab = screen.getAllByRole('button', { name: /Accounts/ }).find(b => b.className.includes('nav-item')) ?? screen.getAllByRole('button', { name: /Accounts/ })[0];
    fireEvent.click(accountsTab);
    await waitFor(() => screen.getByText(/Accounts/i, { selector: '.screen-title' }));
    const archiveButtons = screen.getAllByRole('button', { name: /Archive/ });
    // Archive Savings (first active)
    archiveButtons[0].click();
    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('.list-row'));
      const savingsRow = rows.find(r => r.textContent?.includes('Savings'));
      expect(savingsRow).toBeTruthy();
    });
    fireEvent.click(goalsTab);
    await waitFor(() => screen.getByText(/Goals/i, { selector: '.screen-title' }));

    // Edit Linked Goal
    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    // Linked Goal is the 5th created, adjust index after previous actions
    const linkedEditIdx = editButtons.findIndex(btn => {
      const row = btn.closest('article');
      return row?.textContent?.includes('Linked Goal');
    });
    if (linkedEditIdx >= 0) {
      fireEvent.click(editButtons[linkedEditIdx]);
    } else {
      fireEvent.click(editButtons[editButtons.length - 1]);
    }
    await waitFor(() => screen.getByText(/Edit goal/i));
    const linkedSelectEdit = screen.getByLabelText(/Linked account/i) as HTMLSelectElement;
    expect(linkedSelectEdit.value).toBe('a1');
    const editOptions = Array.from(linkedSelectEdit.querySelectorAll('option')).map(o => o.textContent ?? '');
    expect(editOptions.some(t => t.includes('Savings (archived)'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    // edit
    const firstEdit = screen.getAllByRole('button', { name: /Edit/ })[0];
    fireEvent.click(firstEdit);
    await waitFor(() => screen.getByText(/Edit goal/i));
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Emergency Fund/));

    // activate/deactivate
    const deactivateBtn = screen.getAllByRole('button', { name: /Deactivate/ })[0];
    fireEvent.click(deactivateBtn);
    await waitFor(() => {
      const row = deactivateBtn.closest('article');
      expect(row?.textContent).toContain('Inactive');
    });
    const activateBtn = screen.getAllByRole('button', { name: /Activate/ })[0];
    fireEvent.click(activateBtn);
    await waitFor(() => {
      const row = activateBtn.closest('article');
      expect(row?.textContent).toContain('Active');
    });

    // delete Manual Goal
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/ });
    const manualDeleteIdx = deleteButtons.findIndex(btn => {
      const row = btn.closest('article');
      return row?.textContent?.includes('Manual Goal');
    });
    if (manualDeleteIdx >= 0) {
      fireEvent.click(deleteButtons[manualDeleteIdx]);
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByText(/Manual Goal/)).toBeNull());
    }

    // method switch clears incompatible fields
    const vacationEditIdx = screen.getAllByRole('button', { name: /Edit/ }).findIndex(btn => {
      const row = btn.closest('article');
      return row?.textContent?.includes('Vacation');
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ })[vacationEditIdx]);
    await waitFor(() => screen.getByText(/Edit goal/i));
    const methodSelectEdit = screen.getByLabelText(/Method/i);
    fireEvent.change(methodSelectEdit, { target: { value: 'fixed' } });
    await waitFor(() => {
      expect(screen.queryByLabelText(/Target date/i)).toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Vacation/));

    // source switch clears linked/manual stale data - real save behavior
    // A. linked -> manual
    const linkedEditIdx2 = screen.getAllByRole('button', { name: /Edit/ }).findIndex(btn => {
      const row = btn.closest('article');
      return row?.textContent?.includes('Linked Goal');
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ })[linkedEditIdx2]);
    await waitFor(() => screen.getByText(/Edit goal/i));
    const linkedSelectSwitch = screen.getByLabelText(/Linked account/i);
    fireEvent.change(linkedSelectSwitch, { target: { value: '' } });
    const manualInput = screen.getByLabelText(/Amount already saved/i);
    fireEvent.change(manualInput, { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Linked Goal/));
    // Reopen edit to verify persisted state
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ }).find(btn => btn.closest('article')?.textContent?.includes('Linked Goal'))!);
    await waitFor(() => screen.getByText(/Edit goal/i));
    const linkedSelectAfter = screen.getByLabelText(/Linked account/i) as HTMLSelectElement;
    expect(linkedSelectAfter.value).toBe('');
    const manualInputAfter = screen.getByLabelText(/Amount already saved/i) as HTMLInputElement;
    expect(manualInputAfter.value).toBe('2500');
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    if (screen.queryByRole('button', { name: 'Discard entry' })) fireEvent.click(screen.getByRole('button', { name: 'Discard entry' }));
    await waitFor(() => screen.queryByRole('dialog', { name: /Edit goal/i }) === null);

    // B. manual -> linked
    // Manual Goal was deleted earlier; create a new manual goal for this test
    fireEvent.click(screen.getByRole('button', { name: /Add goal/ }));
    await waitFor(() => screen.getByText(/New goal/i));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Manual Goal 2' } });
    fireEvent.change(screen.getByLabelText(/Target amount/i), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText(/Monthly contribution/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/Amount already saved/i), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Manual Goal 2/));
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ }).find(btn => btn.closest('article')?.textContent?.includes('Manual Goal 2'))!);
    await waitFor(() => screen.getByText(/Edit goal/i));
    fireEvent.change(screen.getByLabelText(/Linked account/i), { target: { value: 'a2' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Manual Goal 2/));
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ }).find(btn => btn.closest('article')?.textContent?.includes('Manual Goal 2'))!);
    await waitFor(() => screen.getByText(/Edit goal/i));
    const linkedSelectManual = screen.getByLabelText(/Linked account/i) as HTMLSelectElement;
    expect(linkedSelectManual.value).toBe('a2');
    const manualInputManual = screen.getByLabelText(/Amount already saved/i) as HTMLInputElement;
    expect(manualInputManual.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    if (screen.queryByRole('button', { name: 'Discard entry' })) fireEvent.click(screen.getByRole('button', { name: 'Discard entry' }));
    await waitFor(() => screen.queryByRole('dialog', { name: /Edit goal/i }) === null);

    // C. linked -> neither
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ }).find(btn => btn.closest('article')?.textContent?.includes('Linked Goal'))!);
    await waitFor(() => screen.getByText(/Edit goal/i));
    fireEvent.change(screen.getByLabelText(/Linked account/i), { target: { value: '' } });
    // ensure manual saved cleared
    const manualInputClear = screen.getByLabelText(/Amount already saved/i) as HTMLInputElement;
    fireEvent.change(manualInputClear, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => screen.getByText(/Linked Goal/));
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ }).find(btn => btn.closest('article')?.textContent?.includes('Linked Goal'))!);
    await waitFor(() => screen.getByText(/Edit goal/i));
    const linkedSelectNeither = screen.getByLabelText(/Linked account/i) as HTMLSelectElement;
    expect(linkedSelectNeither.value).toBe('');
    const manualInputNeither = screen.getByLabelText(/Amount already saved/i) as HTMLInputElement;
    expect(manualInputNeither.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    if (screen.queryByRole('button', { name: 'Discard entry' })) fireEvent.click(screen.getByRole('button', { name: 'Discard entry' }));

    await cleanupUiRepo(repo, unmount);
  });
});



