import {ScreenBoundary} from './components/ScreenBoundary';
import {parseHistoryRange} from './historyNavigation';
import {useFormSubmitShortcut} from './hooks/useFormSubmitShortcut';
import {PrivacyDisplayButton} from './components/PrivacyDisplay';
import {BrandMark} from './components/BrandMark';
import {CurrentIdentity} from './components/CurrentIdentity';
import {HelpView as HelpScreen} from './components/HelpView';
import {useProduct,guardedTransition} from '../application/productNavigation';
import { AboutFolio } from './components/AboutFolio';
import { NavIcon } from './components/NavIcon';
import { listenForAndroidBack } from '../application/nativeNavigation';
import { useDialogAccessibility } from './hooks/useDialogAccessibility';
import {useWorkspaceShortcuts} from './hooks/useWorkspaceShortcuts';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../application/FolioProvider.js';
import { getAutoLockMinutes, getLandingModule } from '../application/devicePreferences.js';
import { DashboardScreen } from './screens/DashboardScreen.js';
import { AccountsScreen } from './screens/AccountsScreen.js';
import { TransactionsScreen } from './screens/TransactionsScreen.js';
const RecurringScreen = lazy(()=>import('./screens/RecurringScreen.js').then(module=>({default:module.RecurringScreen})));
const DebtScreen = lazy(()=>import('./screens/DebtScreen.js').then(module=>({default:module.DebtScreen})));
const GoalsScreen = lazy(()=>import('./screens/GoalsScreen.js').then(module=>({default:module.GoalsScreen})));
const HealthScreen = lazy(()=>import('./screens/HealthScreen.js').then(module=>({default:module.HealthScreen})));
const PlannerScreen = lazy(()=>import('./screens/PlannerScreen.js').then(module=>({default:module.PlannerScreen})));
const ReportsScreen = lazy(()=>import('./screens/ReportsScreen.js').then(module=>({default:module.ReportsScreen})));
const SettingsScreen = lazy(()=>import('./screens/SettingsScreen.js').then(module=>({default:module.SettingsScreen})));


function ScreenContent({children,action,routeId}:{children:ReactNode;action?:string;routeId?:string}) {
  useEffect(()=>{document.querySelector('.main')?.scrollTo?.({top:action==='return'?Number(routeId)||0:0,behavior:'instant'});const heading=document.querySelector<HTMLElement>(action==='search'?"#history-search":action==='identity'?"#profile-identity-title":action==='exports'?"#backup-exports-title":"main h1");if(heading){if(action!=='search')heading.tabIndex=-1;heading.focus({preventScroll:true});if(action==='identity'||action==='exports')heading.scrollIntoView?.({block:'start',behavior:'instant'});}},[]);
  return <>{children}</>;
}

export function AppShell() {
  useDialogAccessibility();
  useFormSubmitShortcut();
  useWorkspaceShortcuts();
  const product=useProduct();
  const [helpArticle,setHelpArticle]=useState<string>();
  const { lock, discardAndLock, saveStatus, saveError, saveErrorName, profileId } = useSession();
  const [tab, setTab] = useState<'dashboard'|'accounts'|'transactions'|'recurring'|'debts'|'goals'|'health'|'planner'|'reports'|'settings'|'about'|'help'>(()=>getLandingModule(profileId));
  const [route, setRoute] = useState<{action?:string;id?:string;nonce:number}>({nonce:0});
  const [showConflict, setShowConflict] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const autoLockTimerRef = useRef<number | null>(null);
  const autoLockDeadlineRef = useRef<number | null>(null);
  const identityReturn = useRef<typeof tab | null>(null);
  const shortcutScroll = useRef(0);
  const returnFromShortcut=()=>{const target=identityReturn.current;if(!target)return;identityReturn.current=null;setTab(target);setRoute(r=>({action:'return',id:String(shortcutScroll.current),nonce:r.nonce+1}));};

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
      } else if (tab === 'settings' && identityReturn.current) returnFromShortcut();
      else if (tab !== 'dashboard') {identityReturn.current=null;setRoute(r=>({nonce:r.nonce+1}));setTab('dashboard');}
      else handleLock();
    }).then(handle => {
      if (disposed) void handle?.remove();
      else if (handle) remove = () => handle.remove();
    });
    return () => { disposed = true; void remove?.(); };
  }, [tab, lock]);

  const openIdentity=()=>guardedTransition(()=>{if(tab!=='settings'){identityReturn.current=tab;shortcutScroll.current=document.querySelector('.main')?.scrollTop??0;}setTab('settings');setRoute(r=>({action:'identity',nonce:r.nonce+1}));});
  const changeTab = (key: typeof tab) => {
    const entry=document.querySelector<HTMLElement>('[role="dialog"]');
    if(entry && !menuOpen) {
      if(entry.hasAttribute('data-entry-dialog')) window.dispatchEvent(new CustomEvent('folio:requestDismiss',{detail:()=>{setRoute(r=>({nonce:r.nonce+1}));setTab(key);}}));
      else entry.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
      return;
    }
    setRoute(r=>({nonce:r.nonce+1})); setTab(key);
    identityReturn.current=null;
  };
  useEffect(()=>{
    const visit=(event:Event)=>{const detail=(event as CustomEvent<{screen:typeof tab;action?:string;id?:string;article?:string}>).detail;if(!nav.some(n=>n.key===detail.screen))return;identityReturn.current=detail.action==='exports'?tab:null;if(detail.action==='exports')shortcutScroll.current=document.querySelector('.main')?.scrollTop??0;setHelpArticle(detail.article);setTab(detail.screen);setRoute(r=>({action:detail.action,id:detail.id,nonce:r.nonce+1}));};
    window.addEventListener('folio:navigate',visit);return()=>window.removeEventListener('folio:navigate',visit);
  },[tab]);
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
          <PrivacyDisplayButton/><button className="btn btn-ghost" onClick={handleLock}>Lock</button><button className="btn btn-ghost" onClick={product.openProfiles}>Switch profile</button><button className="btn btn-ghost" onClick={product.openWelcome}>Welcome to Folio</button>
        </div>
      </aside>
      {product.example&&<div className="example-indicator" role="note">EXAMPLE · SAMPLE DATA</div>}
      <div className="mobile-topbar">
        <div className="topbar-title"><button className="identity-button" aria-label="Open profile settings" title="Open profile settings" onClick={openIdentity}><CurrentIdentity/><span className="identity-chevron" aria-hidden="true">›</span></button><span className="topbar-section">{sectionTitle}</span>{product.example&&<span className="mobile-example-label">Example · sample data</span>}</div>
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-small" aria-label="Menu" title="Menu" onClick={()=>setMenuOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span className="sr-only">Menu</span></button>
          <button className="btn btn-ghost btn-small" aria-label="Lock" title="Lock" onClick={handleLock}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span className="sr-only">Lock</span></button>
        </div>
      </div>
      {menuOpen && (
        <div className="modal-backdrop navigation-backdrop" onClick={()=>setMenuOpen(false)} role="dialog" aria-modal="true" aria-labelledby="menu-title">
          <div className="modal navigation-sheet" onClick={e=>e.stopPropagation()} style={{maxWidth:'380px'}}>
            <div className="modal-header">
              <div className="modal-title" id="menu-title">Navigation</div><PrivacyDisplayButton compact onUsed={()=>setMenuOpen(false)}/>
              <button className="icon-btn" aria-label="Close" onClick={()=>setMenuOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="list navigation-list">
                {nav.map(n => (
                  <button key={n.key} className="list-row" onClick={()=>{changeTab(n.key as typeof tab); setMenuOpen(false);}} aria-current={tab===n.key ? 'page' : undefined}>
                    <span className="nav-icon"><NavIcon name={n.key}/></span>
                    <span className="list-row-title">{n.label}</span>
                  </button>
                ))}
              </div><div className="navigation-profile-actions"><button className="btn btn-secondary" onClick={product.openProfiles}>Switch profile</button><button className="btn btn-ghost" onClick={product.openWelcome}>Welcome to Folio</button></div>
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
        {(route.action==='identity'||route.action==='exports')&&identityReturn.current&&<button className="profile-return link-btn" onClick={()=>guardedTransition(returnFromShortcut)}>← Back to {nav.find(n=>n.key===identityReturn.current)?.label}</button>}
        <div className="save-bar" role="status" aria-live="polite">
          {saveStatus==='saving' && <span className="save-dot saving">Saving…</span>}
          {saveStatus==='saved' && <span className="save-dot saved">Saved</span>}
          {saveStatus==='error' && <span className="save-dot error">Couldn’t save changes</span>}
          {saveStatus==='idle' && <span className="save-dot idle">Local record</span>}
        </div>
        <div className="screen"><ScreenBoundary key={tab+':'+route.nonce} onRecover={()=>changeTab('dashboard')}><Suspense fallback={<p className="card" role="status">Opening view…</p>}><ScreenContent key={tab+':'+route.nonce} action={route.action} routeId={route.id}>
          {tab==='dashboard' && <DashboardScreen />}
          {tab==='accounts' && <AccountsScreen key={route.nonce} startCreate={route.action==='create'} startArchived={route.action==='archived'} />}
          {tab==='transactions' && <TransactionsScreen key={route.nonce} startCreate={route.action==='create'} startSearch={route.action==='search'} initialEdit={route.action==='edit'?route.id:undefined} initialAccount={route.action==='account'?route.id:undefined} initialMonth={route.action==='month'?route.id:undefined} initialRange={route.action==='range'?parseHistoryRange(route.id):undefined} />}
          {tab==='recurring' && <RecurringScreen />}
          {tab==='debts' && <DebtScreen />}
          {tab==='goals' && <GoalsScreen />}
          {tab==='health' && <HealthScreen />}
          {tab==='planner' && <PlannerScreen initialComparison={route.action==='comparison'?route.id:undefined}/>} 
          {tab==='reports' && <ReportsScreen />}
          {tab==='settings' && <SettingsScreen />}
          {tab==='help' && <HelpScreen key={helpArticle} initialArticle={helpArticle}/>}
          {tab==='about' && <div className="about-view"><header className="screen-header"><div><p className="eyebrow">Folio by ANVA</p><h1 className="screen-title">About & Contact</h1><p className="screen-sub">Record → Understand → Plan → Protect</p></div></header><AboutFolio /></div>}
        </ScreenContent></Suspense></ScreenBoundary></div>
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
            aria-label={n.key==='transactions'?'Records — Transactions':n.label}
            onClick={()=>changeTab(n.key as typeof tab)}
            aria-current={tab===n.key ? 'page' : undefined}
          >
            <span className="nav-icon"><NavIcon name={n.key}/></span>
            <span>{n.key==='transactions'?'Records':n.label}</span>
          </button>
        ))}
        <button className={bottomNav.some(n=>n.key===tab)?'':'active'} aria-label="More sections" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><span className="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></span><span>More</span></button>
      </nav>
    </div>
  );
}


