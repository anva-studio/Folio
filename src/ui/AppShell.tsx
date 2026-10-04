import {BrandMark} from './components/BrandMark';
import {CurrentIdentity} from './components/CurrentIdentity';
import {HelpScreen} from './screens/HelpScreen';
import {useProduct} from '../application/productNavigation';
import { AboutFolio } from './components/AboutFolio';
import { NavIcon } from './components/NavIcon';
import { listenForAndroidBack } from '../application/nativeNavigation';
import { useDialogAccessibility } from './hooks/useDialogAccessibility';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../application/FolioProvider.js';
import { getAutoLockMinutes } from '../application/devicePreferences.js';
import { DashboardScreen } from './screens/DashboardScreen.js';
import { AccountsScreen } from './screens/AccountsScreen.js';
import { TransactionsScreen } from './screens/TransactionsScreen.js';
import { RecurringScreen } from './screens/RecurringScreen.js';
import { DebtScreen } from './screens/DebtScreen.js';
import { GoalsScreen } from './screens/GoalsScreen.js';
import { HealthScreen } from './screens/HealthScreen.js';
import { PlannerScreen } from './screens/PlannerScreen.js';
import { ReportsScreen } from './screens/ReportsScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';

export function AppShell() {
  useDialogAccessibility();
  const product=useProduct();
  const [helpArticle,setHelpArticle]=useState<string>();
  const { lock, discardAndLock, saveStatus, saveError, saveErrorName, profileId } = useSession();
  const [tab, setTab] = useState<'dashboard'|'accounts'|'transactions'|'recurring'|'debts'|'goals'|'health'|'planner'|'reports'|'settings'|'about'|'help'>('dashboard');
  const [route, setRoute] = useState<{action?:string;id?:string;nonce:number}>({nonce:0});
  const [showConflict, setShowConflict] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const autoLockTimerRef = useRef<number | null>(null);
  const autoLockDeadlineRef = useRef<number | null>(null);

  const resetAutoLockTimer = () => {
    if (!profileId) return;
    if (autoLockTimerRef.current) window.clearTimeout(autoLockTimerRef.current);
    const minutes = getAutoLockMinutes(profileId);
    if (minutes === null) {
      autoLockTimerRef.current = null;
      autoLockDeadlineRef.current = null;
      return;
    }
    autoLockDeadlineRef.current = Date.now() + minutes * 60 * 1000;
    autoLockTimerRef.current = window.setTimeout(() => {
      lock().catch(() => {});
    }, minutes * 60 * 1000);
  };

  useEffect(() => {
    if (!profileId) {
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
      return;
    }
    resetAutoLockTimer();
    const activityHandler = () => {
      resetAutoLockTimer();
    };
    const resumeHandler = () => {
      // Background/suspended windows must not receive a fresh deadline merely
      // because focus/visibility returns before the throttled timeout runs.
      if (autoLockDeadlineRef.current !== null && Date.now() >= autoLockDeadlineRef.current) {
        void lock().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', activityHandler);
    window.addEventListener('keydown', activityHandler);
    window.addEventListener('touchstart', activityHandler);
    window.addEventListener('focus', resumeHandler);
    document.addEventListener('visibilitychange', resumeHandler);
    const onPrefChange = (e: Event) => {
      const custom = e as CustomEvent<{ profileId: string; minutes: number | null }>;
      if (custom.detail.profileId === profileId) {
        resetAutoLockTimer();
      }
    };
    window.addEventListener('folio:autoLockChange', onPrefChange);
    return () => {
      window.removeEventListener('pointerdown', activityHandler);
      window.removeEventListener('keydown', activityHandler);
      window.removeEventListener('touchstart', activityHandler);
      window.removeEventListener('focus', resumeHandler);
      document.removeEventListener('visibilitychange', resumeHandler);
      window.removeEventListener('folio:autoLockChange', onPrefChange);
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
    };
  }, [profileId, lock]);

  const handleLock = () => {
    const entry = document.querySelector<HTMLElement>('[role="dialog"]');
    if (entry) {
      if (entry.hasAttribute('data-entry-dialog')) window.dispatchEvent(new CustomEvent('folio:requestDismiss', {detail:()=>{void lock().catch(()=>{});}}));
      else entry.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
      return;
    }
    void lock().catch(() => {
      // session remains unlocked; save UI reports the failure
    });
  };

  useEffect(() => {
    if (saveStatus === 'error' && saveErrorName) {
      setShowConflict(true);
    }
  }, [saveStatus, saveErrorName]);

  const nav = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'recurring', label: 'Scheduled' },
    { key: 'debts', label: 'Debt' },
    { key: 'goals', label: 'Goals' },
    { key: 'health', label: 'Health checks' },
    { key: 'planner', label: 'Planner' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
    { key: 'about', label: 'About & Contact' },
    { key: 'help', label: 'Help & FAQ' },
  ];
  useEffect(() => {
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    void listenForAndroidBack(() => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const dialog = dialogs.item(dialogs.length - 1);
      if (dialog) {
        const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]') ?? Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Cancel' && !button.disabled);
        close?.click();
      } else if (tab !== 'dashboard') setTab('dashboard');
      else handleLock();
    }).then(handle => {
      if (disposed) void handle?.remove();
      else if (handle) remove = () => handle.remove();
    });
    return () => { disposed = true; void remove?.(); };
  }, [tab, lock]);
  useEffect(()=>{const heading=document.querySelector<HTMLElement>("main h1");if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}},[tab]);
  const changeTab = (key: typeof tab) => {
    const entry=document.querySelector<HTMLElement>('[role="dialog"]');
    if(entry && !menuOpen) {
      if(entry.hasAttribute('data-entry-dialog')) window.dispatchEvent(new CustomEvent('folio:requestDismiss',{detail:()=>{setRoute(r=>({nonce:r.nonce+1}));setTab(key);}}));
      else entry.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
      return;
    }
    setRoute(r=>({nonce:r.nonce+1})); setTab(key);
  };
  useEffect(()=>{
    const visit=(event:Event)=>{const detail=(event as CustomEvent<{screen:typeof tab;action?:string;id?:string;article?:string}>).detail;if(!nav.some(n=>n.key===detail.screen))return;setHelpArticle(detail.article);setTab(detail.screen);setRoute(r=>({action:detail.action,id:detail.id,nonce:r.nonce+1}));};
    window.addEventListener('folio:navigate',visit);return()=>window.removeEventListener('folio:navigate',visit);
  },[]);
  const bottomNav = nav.slice(0,4);

  const sectionTitle = nav.find(n => n.key === tab)?.label ?? 'Folio';

  return (
    <div className="app-shell">
      <aside className="sidebar"><nav aria-label="Desktop navigation">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true"><BrandMark size={34}/></div>
          <div><div className="brand-name">FOLIO</div><span className="brand-sub">Your financial notebook</span></div>
        </div>
        <CurrentIdentity/>
        <div className="sidebar-section">
          <div className="sidebar-section-title">Record · Understand · Plan</div>
          {nav.slice(0,9).map(n => (
            <button key={n.key} className={`nav-item ${tab===n.key?'active':''}`} onClick={()=>changeTab(n.key as typeof tab)} aria-current={tab===n.key ? 'page' : undefined}>
              <span className="nav-icon"><NavIcon name={n.key}/></span>{n.label}
            </button>
          ))}
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-title">Protect & discover</div>
          {nav.slice(9).map(n => (
            <button key={n.key} className={`nav-item ${tab===n.key?'active':''}`} onClick={()=>changeTab(n.key as typeof tab)} aria-current={tab===n.key ? 'page' : undefined}>
              <span className="nav-icon"><NavIcon name={n.key}/></span>{n.label}
            </button>
          ))}
        </div>
        </nav><div className="sidebar-footer">
          <button className="btn btn-ghost" onClick={handleLock}>Lock</button><button className="btn btn-ghost" onClick={product.openProfiles}>Switch profile</button><button className="btn btn-ghost" onClick={product.openWelcome}>Welcome to Folio</button>
        </div>
      </aside>
      {product.example&&<div className="example-indicator" role="note">EXAMPLE · SAMPLE DATA</div>}
      <div className="mobile-topbar">
        <div className="topbar-title"><CurrentIdentity/>{sectionTitle}</div>
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-small" aria-label="Menu" onClick={()=>setMenuOpen(true)}>Menu</button>
          <button className="btn btn-ghost btn-small" onClick={handleLock}>Lock</button>
        </div>
      </div>
      {menuOpen && (
        <div className="modal-backdrop" onClick={()=>setMenuOpen(false)} role="dialog" aria-modal="true" aria-labelledby="menu-title">
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:'380px'}}>
            <div className="modal-header">
              <div className="modal-title" id="menu-title">Navigation</div>
              <button className="icon-btn" aria-label="Close" onClick={()=>setMenuOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="list">
                <button className="list-row" onClick={product.openProfiles}>Switch profile</button><button className="list-row" onClick={product.openWelcome}>Welcome to Folio</button>
                {nav.map(n => (
                  <button key={n.key} className="list-row" onClick={()=>{setTab(n.key as any); setMenuOpen(false);}} aria-current={tab===n.key ? 'page' : undefined}>
                    <span className="list-row-title">{n.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {showConflict && (
        <div className="modal-backdrop" onClick={()=>setShowConflict(false)} role="dialog" aria-modal="true" aria-labelledby="conflict-title">
          <div className="modal conflict-modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title" id="conflict-title">{saveErrorName === 'ProfileConflictError' ? 'Save conflict' : 'Save error'}</h2><button className="icon-btn" aria-label="Close" onClick={()=>setShowConflict(false)}>✕</button></div>
            <div className="modal-body">
              {saveErrorName === 'ProfileConflictError' ? (
                <>
                  <p>Another Folio window changed this profile. Your local unsaved changes cannot be automatically merged.</p>
                  <p className="muted">Discard local changes and lock to reload persisted data on next unlock.</p>
                </>
              ) : (
                <>
                  <p>Save failed.</p>
                  <p className="muted">{saveError ?? 'Could not save changes'}</p>
                </>
              )}
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={()=>setShowConflict(false)}>Close</button>
                {saveErrorName === 'ProfileConflictError' && (
                  <button className="btn btn-primary" onClick={()=>{setShowConflict(false); discardAndLock();}}>Discard local changes & lock</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <main className="main">
        <div className="save-bar" role="status" aria-live="polite">
          {saveStatus==='saving' && <span className="save-dot saving">Saving…</span>}
          {saveStatus==='saved' && <span className="save-dot saved">Saved</span>}
          {saveStatus==='error' && <span className="save-dot error">Couldn’t save changes</span>}
          {saveStatus==='idle' && <span className="save-dot idle">Local record</span>}
        </div>
        <div className="screen">
          {tab==='dashboard' && <DashboardScreen />}
          {tab==='accounts' && <AccountsScreen key={route.nonce} startCreate={route.action==='create'} />}
          {tab==='transactions' && <TransactionsScreen key={route.nonce} startCreate={route.action==='create'} initialEdit={route.action==='edit'?route.id:undefined} initialAccount={route.action==='account'?route.id:undefined} />}
          {tab==='recurring' && <RecurringScreen />}
          {tab==='debts' && <DebtScreen />}
          {tab==='goals' && <GoalsScreen />}
          {tab==='health' && <HealthScreen />}
          {tab==='planner' && <PlannerScreen />}
          {tab==='reports' && <ReportsScreen />}
          {tab==='settings' && <SettingsScreen />}
          {tab==='help' && <HelpScreen key={helpArticle} initialArticle={helpArticle}/>}
          {tab==='about' && <div className="about-view"><header className="screen-header"><div><p className="eyebrow">Folio by ANVA</p><h1 className="screen-title">About & Contact</h1><p className="screen-sub">Record → Understand → Plan → Protect</p></div></header><AboutFolio /></div>}
        </div>
        {saveStatus==='error' && (
          <div className="conflict-banner">
            <div className="conflict-content">
              <div>
                <strong>Save error</strong>
                <div className="muted">
                  {saveErrorName === 'ProfileConflictError'
                    ? 'Save conflict detected'
                    : (saveError ?? 'Could not save changes')
                  }
                </div>
              </div>
              <div className="conflict-actions">
                <button className="btn btn-secondary" onClick={()=>setShowConflict(true)}>Details</button>
              </div>
            </div>
          </div>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {bottomNav.map(n => (
          <button
            key={n.key}
            className={tab===n.key ? 'active' : ''}
            onClick={()=>changeTab(n.key as typeof tab)}
            aria-current={tab===n.key ? 'page' : undefined}
          >
            <span className="nav-icon"><NavIcon name={n.key}/></span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}


