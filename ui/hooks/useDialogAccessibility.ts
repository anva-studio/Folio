import { useEffect } from 'react';

// Existing screens keep their dialog markup; enforce one keyboard/focus contract.
export function useDialogAccessibility() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    let opener: HTMLElement | null = null;
    const originalOverflow = document.body.style.overflow;
    const controls = () => active ? Array.from(active.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')).filter(el => !el.closest('[hidden]')) : [];
    const sync = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const next = dialogs.item(dialogs.length - 1);
      if (next === active) return;
      if (!next) {
        active = null;
        document.body.style.overflow = originalOverflow;
        if (opener?.isConnected) opener.focus();
        opener = null;
        return;
      }
      if (!active) opener = document.activeElement as HTMLElement;
      active = next;
      active.tabIndex = -1;
      document.body.style.overflow = 'hidden';
      const first = active.querySelector<HTMLElement>('[data-initial-focus]') ?? active.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? controls()[0] ?? active;
      first.focus();
    };
    const key = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === 'Escape') {
        const close = active.querySelector<HTMLButtonElement>('button[aria-label="Close"]') ?? Array.from(active.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Cancel' && !button.disabled);
        if (close) { e.preventDefault(); e.stopPropagation(); close.click(); }
      }
      if (e.key !== 'Tab') return;
      const items = controls();
      const first = items[0] ?? active;
      const last = items[items.length - 1] ?? active;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === active)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === active)) { e.preventDefault(); first.focus(); }
    };
    const focus = (e: FocusEvent) => {
      if (active && !active.contains(e.target as Node)) (controls()[0] ?? active).focus();
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', key);
    document.addEventListener('focusin', focus);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', key);
      document.removeEventListener('focusin', focus);
      document.body.style.overflow = originalOverflow;
    };
  }, []);
}
