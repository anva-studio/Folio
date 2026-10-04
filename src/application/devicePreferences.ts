const APP_PREFIX = 'folio:';

export type Appearance = 'system' | 'light' | 'dark';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors for non-sensitive prefs
  }
}

export function getAppearance(): Appearance {
  const raw = safeGet(`${APP_PREFIX}appearance`);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

export function setAppearance(value: Appearance): void {
  safeSet(`${APP_PREFIX}appearance`, value);
  applyTheme(value);
}

export function applyTheme(appearance: Appearance): void {
  const resolved = resolveAppearance(appearance);
  try {
    document.documentElement.setAttribute('data-theme', resolved);
  } catch {
    // SSR / test environment
  }
}

export function resolveAppearance(appearance: Appearance): 'light' | 'dark' {
  if (appearance === 'light') return 'light';
  if (appearance === 'dark') return 'dark';
  // system
  try {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    return m.matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export type AutoLockMinutes = 5 | 15 | 30 | 60 | null;

function autoLockKey(profileId: string): string {
  return `${APP_PREFIX}autolock:${profileId}`;
}

export function getAutoLockMinutes(profileId: string): AutoLockMinutes {
  const raw = safeGet(autoLockKey(profileId));
  if (!raw) return 15; // default
  const n = Number(raw);
  if ([5, 15, 30, 60].includes(n)) return n as AutoLockMinutes;
  if (raw === 'never') return null;
  return 15;
}

export function setAutoLockMinutes(profileId: string, minutes: AutoLockMinutes): void {
  if (minutes === null) {
    safeSet(autoLockKey(profileId), 'never');
  } else {
    safeSet(autoLockKey(profileId), String(minutes));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('folio:autoLockChange', { detail: { profileId, minutes } }));
  }
}
