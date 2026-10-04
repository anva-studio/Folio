import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAppearance, setAppearance, getAutoLockMinutes, setAutoLockMinutes } from '../../src/application/devicePreferences.js';

describe('devicePreferences', () => {
  beforeEach(() => {
    // @ts-ignore
    global.localStorage = {
      store: {},
      getItem(key: string) { return this.store[key] ?? null; },
      setItem(key: string, value: string) { this.store[key] = value; },
      clear() { this.store = {}; }
    };
  });
  afterEach(() => {
    // @ts-ignore
    delete global.localStorage;
  });

  it('appearance defaults to system', () => {
    expect(getAppearance()).toBe('system');
  });

  it('set and get appearance', () => {
    setAppearance('dark');
    expect(getAppearance()).toBe('dark');
    setAppearance('light');
    expect(getAppearance()).toBe('light');
    setAppearance('system');
    expect(getAppearance()).toBe('system');
  });

  it('auto-lock defaults to 15', () => {
    expect(getAutoLockMinutes('p1')).toBe(15);
  });

  it('set and get auto-lock minutes', () => {
    setAutoLockMinutes('p1', 5);
    expect(getAutoLockMinutes('p1')).toBe(5);
    setAutoLockMinutes('p1', null);
    expect(getAutoLockMinutes('p1')).toBeNull();
    setAutoLockMinutes('p1', 60);
    expect(getAutoLockMinutes('p1')).toBe(60);
  });

  it('auto-lock per profile isolated', () => {
    setAutoLockMinutes('p1', 30);
    setAutoLockMinutes('p2', 5);
    expect(getAutoLockMinutes('p1')).toBe(30);
    expect(getAutoLockMinutes('p2')).toBe(5);
  });

  it('setAutoLock emits event', () => {
    // skip in non-browser env
    if (typeof window === 'undefined') return;
    let captured: any = null;
    const handler = (e: Event) => { captured = (e as CustomEvent).detail; };
    window.addEventListener('folio:autoLockChange', handler);
    setAutoLockMinutes('p1', 15);
    expect(captured).toEqual({ profileId: 'p1', minutes: 15 });
    window.removeEventListener('folio:autoLockChange', handler);
  });
});
