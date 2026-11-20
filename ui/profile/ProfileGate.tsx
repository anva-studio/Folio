import {RestoreBackup} from '../components/RestoreBackup';
import {RecoveryUnlock} from './RecoveryUnlock';
import {currencyCodes,currencyConfig,currencyName} from '../../domain/currencies';
import {useProduct} from '../../application/productNavigation';
import {BrandMark} from '../components/BrandMark';
import {ProfileAvatar} from '../components/ProfileAvatar';
import {exampleDeleted} from '../../application/exampleProfile';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { useEffect, useState } from 'react';
import { useRepo, useSession } from '../../application/FolioProvider.js';


export function ProfileGate() {
  useDialogAccessibility();
  const repo = useRepo();
  const product=useProduct();
  const [restoreNotice,setRestoreNotice]=useState('');
  const { createAndUnlock, unlock } = useSession();
  const [profiles, setProfiles] = useState<{ profileId: string; label: string; updatedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [label, setLabel] = useState('');
  const [currencyCode,setCurrencyCode]=useState('INR');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [unlockPwd, setUnlockPwd] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ profileId: string; label: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwd2Error, setPwd2Error] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [recoveryNotice,setRecoveryNotice]=useState('');

  const load = async () => {
    setLoading(true);
    try {
      const list = await repo.listProfiles();
      setProfiles(list);
      if(list.length===1){setSelected(list[0].profileId);requestAnimationFrame(()=>document.getElementById("unlock-password")?.focus());}
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); const changed=()=>{setRestoreNotice('Verified backup imported. Open the profile using its historical credentials.');void load();}; window.addEventListener('folio:profilesChanged',changed); return()=>window.removeEventListener('folio:profilesChanged',changed); }, [repo]);


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLabelError(null);
    setPwdError(null);
    setPwd2Error(null);
    let hasError = false;
    if (!label.trim()) { setLabelError('Profile name is required'); hasError = true; }
    if (!pwd) { setPwdError('Password is required'); hasError = true; }
    if (pwd !== pwd2) { setPwd2Error('Passwords do not match'); hasError = true; }
    if (hasError) {document.getElementById(!label.trim()?'profile-label':!pwd?'profile-password':'profile-password-confirm')?.focus();return;}
    setCreating(true);
    try {
      await createAndUnlock(label.trim(), pwd, currencyConfig(currencyCode, navigator.language));
    } catch (e: any) {
      setError(e?.message ?? 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnlockError(null);
    if (!selected) { setUnlockError('Please select a profile'); return; }
    if (!unlockPwd) { setUnlockError('Password is required'); return; }
    if (unlocking) return;
    setUnlocking(true);
    try {
      await unlock(selected, unlockPwd);
    } catch (e: any) {
      const msg = e?.message ?? 'Unlock failed';
      if (msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('password')) {
        setUnlockError('Incorrect password. Please try again.');
      } else {
        setError(msg);
      }
    } finally {
      setUnlocking(false);
    }
  };

  const openDelete = (profileId: string, label: string) => {
    setDeleteTarget({ profileId, label });
    setConfirmText('');
    setDeleteError(null);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setConfirmText('');
    setDeleteError(null);
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleteError(null);
    if (confirmText !== deleteTarget.label) {
      setDeleteError('Confirmation text does not match profile label');
      return;
    }
    setDeleting(true);
    try {
      await repo.deleteProfile(deleteTarget.profileId);
      setSelected(null);
      await load();
      closeDelete();
    } catch (e: any) {
      setDeleteError(e?.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };


  if (loading) {
    return <div className="auth-wrap"><div className="auth-card">Loading…</div></div>;
  }

  if (profiles.length === 0 || showCreate) {
    return (
      <>
        <div className="auth-wrap">
          <div className="auth-card">
            <div className="brand-panel">
              <div className="brand-mark"><BrandMark size={34}/></div>
              <h1>FOLIO</h1>
              <p className="brand-sub">Your private financial notebook</p><p className="field-help">A profile is a separate encrypted record on this device. Keep your password and an encrypted backup safe.</p>
            </div>
            <button className="link-btn" data-create-back onClick={()=>{if(profiles.length){setShowCreate(false);}else product.openWelcome();}}>Back</button>
            <form onSubmit={handleCreate} data-creating-profile>
              <div className="field">
                <label htmlFor="profile-label" className="label">Profile name</label>
                <input id="profile-label" className="input" value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Personal" aria-invalid={!!labelError} aria-describedby={labelError ? 'label-error' : undefined} />
                {labelError && <div id="label-error" className="field-error">{labelError}</div>}
              </div>
              <div className="field">
                <label htmlFor="profile-password" className="label">Password</label>
                <input autoComplete="new-password" id="profile-password" type="password" className="input" value={pwd} onChange={e=>setPwd(e.target.value)} aria-invalid={!!pwdError} aria-describedby={pwdError ? "profile-password-help pwd-error" : "profile-password-help"} />
                <p id="profile-password-help" className="field-help">Use at least 12 characters. Choose a long, unique password or passphrase. Someone with a copy of your encrypted vault can try guesses outside Folio.</p>
                {pwdError && <div id="pwd-error" className="field-error">{pwdError}</div>}
              </div>
              <div className="field">
                <label htmlFor="profile-password-confirm" className="label">Confirm password</label>
                <input autoComplete="new-password" id="profile-password-confirm" type="password" className="input" value={pwd2} onChange={e=>setPwd2(e.target.value)} aria-invalid={!!pwd2Error} aria-describedby={pwd2Error ? 'pwd2-error' : undefined} />
                {pwd2Error && <div id="pwd2-error" className="field-error">{pwd2Error}</div>}
              </div>
              {error && <div className="field-error" role="alert">{error}</div>}
              <div className="field"><label className="label" htmlFor="profile-currency">Profile currency</label><select className="select" id="profile-currency" value={currencyCode} onChange={e=>setCurrencyCode(e.target.value)}>{currencyCodes().map(code=><option key={code} value={code}>{code} — {currencyName(code,navigator.language)}</option>)}</select><p className="field-help">One currency per profile. Existing money is never converted by changing a label.</p></div><button className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create profile'}</button>
              {profiles.length > 0 && <button type="button" className="btn btn-secondary" onClick={()=>{setShowCreate(false); setPwd(''); setPwd2('');}} disabled={creating}>Cancel</button>}
            </form>
            <div className="field" style={{marginTop: '1rem'}}>
              <RestoreBackup onImported={()=>setRestoreNotice("Verified backup imported. Open the profile using its historical credentials.")}/>{restoreNotice&&<p role="status">{restoreNotice}</p>}
            </div>
<div className="gate-links"><button className="link-btn" onClick={()=>product.openHelp()}>Help & FAQ</button><button className="link-btn" onClick={product.openAbout}>About & Contact</button><button className="link-btn" onClick={()=>product.openExample()}>{exampleDeleted()?"Restore Example Profile":"Explore Example Profile"}</button><button className="link-btn" onClick={product.openWelcome}>Welcome to Folio</button></div>
            <p className="auth-privacy-note">Your data is encrypted locally. Keep encrypted backups somewhere safe. Recovery requires a credential enabled before losing the password. ANVA cannot reset it for you.</p>
          </div>
        </div>
        
        
      </>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-panel">
          <div className="brand-mark"><BrandMark size={34}/></div>
          <h1>FOLIO</h1>
          <p className="brand-sub">Select a profile</p>
        </div>
        <div className="field" role="list">
          {profiles.map(p => (
            <div key={p.profileId} className="profile-row" role="listitem">
              <button type="button" className="profile-row-btn" onClick={()=>setSelected(p.profileId)} aria-pressed={selected===p.profileId}>
                <ProfileAvatar name={p.label}/>
                <span className="profile-row-copy">
                  <strong>{p.label}</strong>
                  <span className="profile-row-date">Updated <time dateTime={p.updatedAt}>{new Date(p.updatedAt).toLocaleDateString()}</time></span>
                </span>
              </button>
              <div className="profile-row-actions">
                {selected===p.profileId && <span className="chip accent">Selected</span>}
                <button type="button" className="btn btn-danger" aria-label={`Delete ${p.label}`} onClick={()=>openDelete(p.profileId, p.label)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleUnlock}>
          <div className="field">
            {recoveryNotice&&<p role="status">{recoveryNotice}</p>}<label htmlFor="unlock-password" className="label">Password</label>
            <input autoComplete="current-password" id="unlock-password" type="password" className="input" value={unlockPwd} onChange={e=>setUnlockPwd(e.target.value)} aria-invalid={!!unlockError} aria-describedby={unlockError ? 'unlock-error' : undefined} />
            {unlockError && <div id="unlock-error" role="alert" className="field-error">{unlockError}</div>}
          </div>
          {error && <div className="field-error" role="alert">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={unlocking}>{unlocking ? 'Unlocking…' : 'Unlock'}</button>
        </form>
        {selected&&<RecoveryUnlock key={selected} profileId={selected} onRecovered={()=>{setUnlockPwd('');setRecoveryNotice('Password reset. Unlock with your new password. Historical backups retain their original credentials.');void load();}}/>}
        <div className="field" style={{marginTop:'0.75rem'}}>
          <RestoreBackup onImported={()=>setRestoreNotice("Verified backup imported. Open the profile using its historical credentials.")}/>{restoreNotice&&<p role="status">{restoreNotice}</p>}
        </div>
        <div className="gate-links"><button className="link-btn" onClick={()=>product.openHelp()}>Help & FAQ</button><button className="link-btn" onClick={product.openAbout}>About & Contact</button><button className="link-btn" onClick={()=>product.openExample()}>{exampleDeleted()?"Restore Example Profile":"Explore Example Profile"}</button><button className="link-btn" onClick={product.openWelcome}>Welcome to Folio</button></div>
        <button className="btn btn-secondary" style={{marginTop:12}} onClick={()=>{setShowCreate(true); setError(null);}}>Create another profile</button>
      </div>
      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={closeDelete} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000}}>
          <div className="modal-card" onClick={e=>e.stopPropagation()} style={{background:'var(--surface-1)', padding:24, borderRadius:12, width:'min(480px, 90vw)', boxShadow:'0 10px 30px rgba(0,0,0,0.3)'}}>
            <h2 id="delete-title">Delete profile</h2>
            <p className="muted" style={{marginTop:8}}>This permanently removes this profile from Folio on this device. Save an encrypted backup first if you need its records. Backups and exports stored elsewhere are not deleted. This action cannot be undone.</p>
            <p style={{fontWeight:600, marginTop:12}}>Profile: {deleteTarget.label}</p>
            <form onSubmit={handleDelete} style={{marginTop:16}}>
              <div className="field">
                <label htmlFor="confirm-delete" className="label">Type profile label to confirm</label>
                <input id="confirm-delete" className="input" value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder={deleteTarget.label} autoComplete="off" />
              </div>
              {deleteError && <div className="field-error">{deleteError}</div>}
              <div style={{display:'flex', gap:12, justifyContent:'flex-end', marginTop:16}}>
                <button type="button" className="btn btn-secondary" onClick={closeDelete} disabled={deleting}>Cancel</button>
                <button className="btn btn-danger" type="submit" disabled={deleting || confirmText !== deleteTarget.label}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      
    </div>
  );
}





