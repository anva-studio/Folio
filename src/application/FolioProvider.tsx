import React, { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { ProfileRepository } from '../persistence/profileRepository.js';
import { ProfileSession } from './profileSession.js';
import { FolioController } from './folioController.js';
import { createEmptyProfileData } from './profileData.js';

type RepoState = { repo: ProfileRepository | null; loading: boolean; error?: string };

const repoContext = createContext<RepoState>({ repo: null, loading: true });

export function RepoProvider({ children, repo: repoProp, dbName }: { children: React.ReactNode; repo?: ProfileRepository; dbName?: string }) {
  const [state, setState] = useState<RepoState>(() => {
    if (repoProp) return { repo: repoProp, loading: false };
    return { repo: null, loading: true };
  });
  useEffect(() => {
    if (repoProp) {
      // ensure repo is opened
      (async () => {
        try {
          await repoProp.open();
        } catch {}
      })();
      return;
    }
    let cancelled = false;
    let ownedRepo: ProfileRepository | null = null;
    (async () => {
      try {
        const repo = new ProfileRepository({ dbName });
        ownedRepo = repo;
        await repo.open();
        if (!cancelled) setState({ repo, loading: false });
      } catch (e: any) {
        if (!cancelled) setState({ repo: null, loading: false, error: e?.message ?? 'Failed to open repository' });
      }
    })();
    return () => {
      cancelled = true;
      if (ownedRepo) {
        ownedRepo.close().catch(() => {});
      }
    };
  }, [repoProp, dbName]);
  if (state.loading) {
    return (
      <repoContext.Provider value={state}>
        <div role="status">Opening Folio…</div>
      </repoContext.Provider>
    );
  }
  if (state.error || !state.repo) {
    return (
      <repoContext.Provider value={state}>
        <div role="alert">Folio couldn’t open local storage. <details><summary>Technical details</summary>{state.error ?? 'Storage unavailable'}</details></div>
      </repoContext.Provider>
    );
  }
  return <repoContext.Provider value={state}>{children}</repoContext.Provider>;
}

export function useRepo(): ProfileRepository {
  const ctx = useContext(repoContext);
  if (!ctx.repo) throw new Error('Repository not ready');
  return ctx.repo;
}

interface SessionState {
  session: ProfileSession | null;
  controller: FolioController | null;
  profileId: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string;
  saveErrorName?: string;
}

const sessionContext = createContext<SessionState>({ session: null, controller: null, profileId: null, saveStatus: 'idle' });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const repo = useRepo();
  const [state, setState] = useState<SessionState>({ session: null, controller: null, profileId: null, saveStatus: 'idle' });
  const sessionRef = useRef<ProfileSession | null>(null);
  const repoRef = useRef(repo);
  repoRef.current = repo;
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saveErrorName, setSaveErrorName] = useState<string | undefined>(undefined);
  const [controllerRevision, setControllerRevision] = useState(0);

  const unlock = async (profileId: string, password: string) => {
    const session = new ProfileSession(repo);
    await session.unlock(profileId, password);
    sessionRef.current = session;
    const controller = new FolioController(session);
    setState({ session, controller, profileId, saveStatus: session.saveStatus, saveError: session.saveError, saveErrorName: undefined });
    setSaveStatus(session.saveStatus);
    setSaveError(session.saveError);
    setSaveErrorName(undefined);
    setControllerRevision(0);
  };

  const renameCurrentProfile = async (newLabel: string) => {
    const s = sessionRef.current;
    if (!s) throw new Error('No active session');
    await repo.renameProfile(s.profileId!, newLabel);
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    const s = sessionRef.current;
    if (!s) throw new Error('No active session');
    // Ensure current data is flushed before rekey
    await s.flush();
    await repo.changePassword(s.profileId!, oldPassword, newPassword);
    // discard old in-memory session without saving with old key
    s.discardAndLock();
    sessionRef.current = null;
    setState({ session: null, controller: null, profileId: null, saveStatus: 'idle', saveError: undefined, saveErrorName: undefined });
    setSaveStatus('idle');
    setSaveError(undefined);
    setSaveErrorName(undefined);
  };

  const lock = useCallback(async () => {
    const s = sessionRef.current;
    if (s) {
      await s.lock();
      // Only clear on successful lock
      sessionRef.current = null;
      setState({ session: null, controller: null, profileId: null, saveStatus: 'idle', saveError: undefined, saveErrorName: undefined });
      setSaveStatus('idle');
      setSaveError(undefined);
      setSaveErrorName(undefined);
    }
  }, []);

  useEffect(() => {
    return window.folioDesktop?.onCloseRequest(() => {
      const finish=()=>{void lock().then(() => window.folioDesktop?.respondToClose(true)).catch(() => window.folioDesktop?.respondToClose(false));};
      const dialogs=document.querySelectorAll('[role=dialog]');
      const dialog=dialogs.item(dialogs.length-1);
      if(dialog?.hasAttribute('data-entry-dialog')) window.dispatchEvent(new CustomEvent('folio:requestDismiss',{detail:finish}));
      else if(dialog?.getAttribute('aria-labelledby')?.endsWith('-discard')) return;
      else finish();
    });
  }, [lock]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (sessionRef.current?.isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const createAndUnlock = async (label: string, password: string) => {
    const data = createEmptyProfileData();
    const created = await repo.createProfile({ label, password, data });
    await unlock(created.profileId, password);
  };

  useEffect(() => {
    const s = state.session;
    if (!s) {
      setSaveStatus('idle');
      setSaveError(undefined);
      setSaveErrorName(undefined);
      setState(prev => ({ ...prev, saveStatus: 'idle', saveError: undefined, saveErrorName: undefined }));
      setControllerRevision(0);
      return;
    }
    const sync = () => {
      const curStatus = s.saveStatus;
      const curError = s.saveError;
      const curErrorName = s.saveErrorName;
      setSaveStatus(prev => curStatus === prev ? prev : curStatus);
      setSaveError(prev => curError === prev ? prev : curError);
      setSaveErrorName(prev => curErrorName === prev ? prev : curErrorName);
      setState(prev => {
        if (prev.saveStatus === curStatus && prev.saveError === curError && prev.saveErrorName === curErrorName) return prev;
        return { ...prev, saveStatus: curStatus, saveError: curError, saveErrorName: curErrorName };
      });
    };
    sync();
    const interval = setInterval(sync, 150);
    return () => clearInterval(interval);
  }, [state.session]);

  useEffect(() => {
    const controller = state.controller;
    if (!controller) {
      setControllerRevision(0);
      return;
    }
    const unsub = controller.subscribe(() => {
      setControllerRevision(v => v + 1);
    });
    return unsub;
  }, [state.controller]);

  const discardAndLock = () => {
    const s = sessionRef.current;
    if (s) {
      s.discardAndLock();
    }
    sessionRef.current = null;
    setState({ session: null, controller: null, profileId: null, saveStatus: 'idle', saveError: undefined, saveErrorName: undefined });
    setSaveStatus('idle');
    setSaveError(undefined);
    setSaveErrorName(undefined);
  };

  const value = useMemo(() => ({
    ...state,
    saveStatus,
    saveError,
    saveErrorName,
    controllerRevision,
    unlock,
    lock,
    discardAndLock,
    createAndUnlock,
    renameCurrentProfile,
    changePassword,
    repo: repoRef.current,
  }), [state, saveStatus, saveError, saveErrorName, controllerRevision]);

  return <sessionContext.Provider value={value}>{children}</sessionContext.Provider>;
}

export function useSession() {
  return useContext(sessionContext) as SessionState & {
    saveStatus: 'idle' | 'saving' | 'saved' | 'error';
    saveError?: string;
    saveErrorName?: string;
    controllerRevision: number;
    unlock: (profileId: string, password: string) => Promise<void>;
    lock: () => Promise<void>;
    discardAndLock: () => void;
    createAndUnlock: (label: string, password: string) => Promise<void>;
    renameCurrentProfile: (newLabel: string) => Promise<void>;
    changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
    repo: ProfileRepository;
  };
}


