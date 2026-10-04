// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { makeUiRepo, cleanupUiRepo } from './testHarness';
import { setAutoLockMinutes, getAutoLockMinutes } from '../../src/application/devicePreferences';
import { createEmptyProfileData } from '../../src/application/profileData';
import { ProfileSession } from '../../src/application/profileSession';
import { useSession } from '../../src/application/FolioProvider';
import { RepoProvider, SessionProvider } from '../../src/application/FolioProvider';
import { AppRoot } from './testHarness';
import { render } from '@testing-library/react';
import 'fake-indexeddb/auto';

let currentSession: ProfileSession | null = null;
function SessionProbe() { currentSession = useSession().session; return <AppRoot />; }

beforeEach(() => { localStorage.clear(); vi.useRealTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); currentSession = null; });

async function setup(name: string) {
  const { repo } = makeUiRepo(name);
  await repo.open();
  const { profileId } = await repo.createProfile({ label: 'Test', password: 'pw', data: createEmptyProfileData() });
  const { unmount } = render(<RepoProvider repo={repo}><SessionProvider><SessionProbe /></SessionProvider></RepoProvider>);
  await waitFor(() => screen.getByText(/Select a profile/i));
  fireEvent.click(screen.getAllByRole('button', { name: /Test/ }).find(b => b.className.includes('profile-row-btn'))!);
  fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: /Unlock/ }));
  await waitFor(() => screen.getByText('Dashboard', { selector: '.screen-title' }));
  // Preference events synchronously clear the real timeout before swapping clocks.
  act(() => setAutoLockMinutes(profileId, null));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  act(() => setAutoLockMinutes(profileId, 15));
  return { repo, profileId, unmount };
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function expectLocked() {
  // Lock/profile loading may perform real crypto/IndexedDB work; wait on real clocks.
  vi.useRealTimers();
  await waitFor(() => expect(screen.getByText(/Select a profile/i)).toBeTruthy());
  expect(screen.queryByText('Dashboard', { selector: '.screen-title' })).toBeNull();
}
const minute = 60_000;

describe('Auto-lock Phase F', () => {
  it('default 15m locks exactly at the deadline', async () => {
    const ctx = await setup('deadline');
    expect(getAutoLockMinutes(ctx.profileId)).toBe(15);
    await advance(15 * minute - 1);
    expect(screen.getByText('Dashboard', { selector: '.screen-title' })).toBeTruthy();
    await advance(1);
    await expectLocked();
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
  it.each(['pointerdown', 'keydown', 'touchstart'])('%s activity resets the deadline', async event => {
    const ctx = await setup(event);
    await advance(14 * minute);
    act(() => window.dispatchEvent(new Event(event)));
    await advance(15 * minute - 1);
    expect(screen.getByText('Dashboard', { selector: '.screen-title' })).toBeTruthy();
    await advance(1);
    await expectLocked();
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
  it('15 -> 5 replaces a pending fake timeout', async () => {
    const ctx = await setup('reschedule');
    await advance(2 * minute);
    act(() => setAutoLockMinutes(ctx.profileId, 5));
    await advance(5 * minute - 1);
    expect(screen.getByText('Dashboard', { selector: '.screen-title' })).toBeTruthy();
    await advance(1);
    await expectLocked();
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
  it('15 -> Never cancels an already armed fake timeout', async () => {
    const ctx = await setup('cancel');
    expect(vi.getTimerCount()).toBe(1);
    act(() => setAutoLockMinutes(ctx.profileId, null));
    expect(vi.getTimerCount()).toBe(0);
    await advance(24 * 60 * minute);
    expect(screen.getByText('Dashboard', { selector: '.screen-title' })).toBeTruthy();
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
  it('Never -> 5 arms and unrelated profile preferences do not reset it', async () => {
    const ctx = await setup('rearm');
    act(() => setAutoLockMinutes(ctx.profileId, null));
    act(() => setAutoLockMinutes(ctx.profileId, 5));
    await advance(4 * minute);
    act(() => setAutoLockMinutes('other-profile', 60));
    await advance(minute);
    await expectLocked();
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
  it('provider data updates do not postpone inactivity lock', async () => {
    const ctx = await setup('provider-rerender');
    await advance(14 * minute);
    act(() => currentSession!.update(d => { d.health.targetEmergencyMonths = 8; return d; }));
    // Drive the provider's real status interval without changing the fake deadline.
    await act(async () => { await new Promise<void>(resolve => { const timer = setInterval(() => { clearInterval(timer); resolve(); }, 160); }); });
    await advance(minute);
    await expectLocked();
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
  it('locks on resume after a suspended deadline without resetting it', async () => {
    const ctx = await setup('suspended');
    vi.setSystemTime(Date.now() + 16 * minute);
    act(() => window.dispatchEvent(new Event('focus')));
    await expectLocked();
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
  it('failed save/conflict keeps unsaved data and the session unlocked', async () => {
    const ctx = await setup('conflict');
    const ext = new ProfileSession(ctx.repo);
    await ext.unlock(ctx.profileId, 'pw');
    ext.update(d => { d.health.targetEmergencyMonths = 9; return d; });
    await ext.lock();
    act(() => currentSession!.update(d => { d.health.targetEmergencyMonths = 8; return d; }));
    await advance(15 * minute);
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByText('Save conflict')).toBeTruthy());
    expect(currentSession!.isLocked).toBe(false);
    expect(currentSession!.isDirty).toBe(true);
    expect(currentSession!.getSnapshot().health.targetEmergencyMonths).toBe(8);
    await cleanupUiRepo(ctx.repo, ctx.unmount);
  });
});




