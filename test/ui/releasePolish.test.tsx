import { act } from '@testing-library/react';
import { RepoProvider, SessionProvider, useSession } from '../../src/application/FolioProvider';
import { ProfileSession } from '../../src/application/profileSession';
import { AppRoot } from './testHarness';
// @vitest-environment jsdom
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import { createEmptyProfileData } from '../../src/application/profileData';
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { useDialogAccessibility } from '../../src/ui/hooks/useDialogAccessibility';
import { AboutFolio } from '../../src/ui/components/AboutFolio';
afterEach(cleanup);
function Harness() {
  useDialogAccessibility();
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open</button>{open && <div role="dialog" aria-modal="true" aria-label="Test"><button aria-label="Close" onClick={() => setOpen(false)}>Close</button><input aria-label="Name"/><button>Last</button></div>}</>;
}
describe('Release accessibility and About', () => {
  it('focuses input, traps Tab, closes with Escape and restores the opener', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus(); fireEvent.click(opener);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')));
    screen.getByRole('button', { name: 'Last' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(document.body.style.overflow).toBe('');
  });
  it('can create a second profile without deleting the first', async () => {
    const { repo } = makeUiRepo('second-profile');
    await repo.open();
    await repo.createProfile({ label: 'First', password: 'pw', data: createEmptyProfileData() });
    const { unmount } = renderFolio(repo);
    await waitFor(() => screen.getByText('Select a profile'));
    fireEvent.click(screen.getByRole('button', { name: 'Create another profile' }));
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Second' } });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'pw2' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'pw2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    await waitFor(() => screen.getByText('Dashboard', { selector: '.screen-title' }));
    expect((await repo.listProfiles()).map(p => p.label).sort()).toEqual(['First', 'Second']);
    await cleanupUiRepo(repo, unmount);
  });
  it('warns before browser reload only while changes remain unsaved', async () => {
    const { repo } = makeUiRepo('reload-safety');
    await repo.open();
    await repo.createProfile({ label: 'Reload', password: 'pw', data: createEmptyProfileData() });
    let current: ProfileSession | null = null;
    function Probe() { current = useSession().session; return <AppRoot />; }
    const { unmount } = render(<RepoProvider repo={repo}><SessionProvider><Probe /></SessionProvider></RepoProvider>);
    await waitFor(() => screen.getByText('Select a profile'));
    fireEvent.click(document.querySelector('.profile-row-btn')!);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => screen.getByText('Dashboard', { selector: '.screen-title' }));
    act(() => current!.update(data => { data.health.targetEmergencyMonths = 8; return data; }));
    const unsaved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unsaved);
    expect(unsaved.defaultPrevented).toBe(true);
    await current!.flush();
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
    await cleanupUiRepo(repo, unmount);
  });
  it('shows approved passive support copy and truthful backup privacy', () => {
    render(<AboutFolio />);
    const support = screen.getByRole('link', { name: 'Buy ANVA a Coffee' });
    expect(support.getAttribute('href')).toBe('https://buymeacoffee.com/anva');
    expect(screen.getAllByRole('link', { name: 'Buy ANVA a Coffee' })).toHaveLength(1);
    expect(screen.getByText(/Profile names and backup metadata are readable/)).toBeTruthy();
    expect(screen.getByText(/Version 1.0.0/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'About ANVA' })).toBeTruthy();
  });
});





