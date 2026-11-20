import {useEffect, useState} from 'react';
import {useSession} from '../../application/FolioProvider';
import {Capacitor} from '@capacitor/core';
import {App as NativeApp} from '@capacitor/app';

/** Concealment retains the session; only a successful lock ends authentication. */
export function PrivacyCurtain({children}: {children: React.ReactNode}) {
  const {profileId, lockFailure, lock, session} = useSession();
  const [hidden, setHidden] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const concealed = hidden || !!lockFailure;
  useEffect(() => {
    let disposed = false;
    let removeNative: (()=>Promise<void>) | undefined;
    const conceal = () => {
      document.documentElement.dataset.folioConcealed = 'true';
      setHidden(true);
    };
    const visibility = () => { if (document.hidden) conceal(); };
    window.addEventListener('blur', conceal);
    document.addEventListener('visibilitychange', visibility);
    const remove = window.folioDesktop?.onPrivacyHide?.(conceal);
    if (Capacitor.getPlatform() === 'android') {
      void NativeApp.addListener('appStateChange', state => {if(!state.isActive)conceal();}).then(handle=>{
        if(disposed)void handle.remove();else removeNative=()=>handle.remove();
      }).catch(()=>{});
    }
    return () => {disposed=true;window.removeEventListener('blur', conceal);document.removeEventListener('visibilitychange', visibility);remove?.();void removeNative?.();};
  }, []);
  useEffect(() => {
    document.documentElement.dataset.folioConcealed = String(concealed);
  }, [concealed]);
  const resume = async () => {
    if (busy || document.hidden) return;
    setBusy(true); setError('');
    try {
      if (profileId && lockFailure) {
        if (!session) throw new Error('The retained session is unavailable');
        await session.verifyPassword(password);
      }
      setHidden(false);
      // A failed lock is resolved by retrying or explicitly reviewing retained work.
      if (lockFailure) window.dispatchEvent(new Event('folio:reviewUnsaved'));
      setPassword('');
    } catch {setError('Could not verify this profile password. Your unsaved work is still concealed.');}
    finally {setBusy(false);}
  };
  return <>
    <div id="folio-private-content" inert={concealed}>{children}</div>
    {concealed&&<div className="privacy-curtain" role="dialog" aria-modal="true" aria-labelledby="curtain-title">
      <section className="card"><h1 id="curtain-title">Folio is concealed</h1>
        <p>{lockFailure?'Folio could not save and finish locking. Unsaved work is retained in this session. Keep the app open to resolve it.':'Your screen is hidden. Any active session remains open until it locks.'}</p>
        {lockFailure&&profileId&&<div className="field"><label className="label" htmlFor="curtain-password">Profile password to review unsaved work</label><input className="input" id="curtain-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><p className="field-help">Use the password from when this session was opened, even if another window changed the stored profile.</p></div>}
        <div className="action-row">
          {lockFailure&&<button className="btn btn-primary" disabled={busy} onClick={()=>{setBusy(true);void lock().then(()=>setHidden(false)).catch(()=>setError('Still unable to save. Keep Folio open and review the retained work.')).finally(()=>setBusy(false));}}>Retry save &amp; lock</button>}
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void resume()}>{lockFailure?'Review unsaved work':'Continue'}</button>
        </div>{error&&<p role="alert">{error}</p>}
      </section>
    </div>}
  </>;
}
