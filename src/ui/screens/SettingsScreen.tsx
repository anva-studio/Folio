import {useProduct} from '../../application/productNavigation';
import {ProfileIdentity} from '../components/ProfileIdentity';
import {ExampleControls} from '../components/ExampleControls';
import { EntryDialog } from '../components/EntryDialog';
import { navigate } from '../navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { getAppearance, setAppearance, applyTheme, type Appearance } from '../../application/devicePreferences.js';
import { getAutoLockMinutes, setAutoLockMinutes } from '../../application/devicePreferences.js';
import { createBackup, importBackup } from '../../application/backupService.js';
import { BackupCollisionError } from '../../application/backupErrors.js';
import { mapBackupErrorToUserMessage } from '../../application/backupErrorMapper.js';
import { exportTransactionsCsv, exportAccountsCsv, exportRecurringCsv, exportDebtsCsv, exportGoalsCsv } from '../../application/csvExport.js';
import { downloadTextFile } from '../../application/fileDownload.js';

export function SettingsScreen() {
  const product=useProduct();
  const { profileId, controller, renameCurrentProfile, changePassword, repo, session, discardAndLock } = useSession();
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  const [autoLock, setAutoLockState] = useState<number | null>(15);
  const [profileLabel, setProfileLabel] = useState<string>('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceTargetProfileId, setReplaceTargetProfileId] = useState<string | null>(null);
  const [replaceTargetLabel, setReplaceTargetLabel] = useState<string>('');
  const [replaceConfirmText, setReplaceConfirmText] = useState('');
  const [pendingBackup, setPendingBackup] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const app = getAppearance();
    setAppearanceState(app);
    applyTheme(app);
    if (!profileId) return;
    const minutes = getAutoLockMinutes(profileId);
    setAutoLockState(minutes);
    (async () => {
      try {
        const records = await repo.getProfileRecords(profileId);
        setProfileLabel(records.index.label);
      } catch {}
    })();
  }, [profileId, repo]);


  const onAppearanceChange = (v: Appearance) => {
    setAppearance(v);
    setAppearanceState(v);
    applyTheme(v);
  };

  const onAutoLockChange = (minutes: number | null) => {
    if (!profileId) return;
    const val = minutes === null ? null : (minutes as 5 | 15 | 30 | 60);
    setAutoLockMinutes(profileId, val);
    setAutoLockState(minutes);
  };

  const mapBackupError = (e: any): string => mapBackupErrorToUserMessage(e);

  const handleCreateBackup = async () => {
    if (product.example || !profileId || !repo || !session) return;
    setBackupError(null);
    setBackupSuccess(null);
    try {
      try {
        await session.flush();
      } catch (e: any) {
        setBackupError('Unable to save current changes. Backup was not created to avoid exporting stale data.');
        return;
      }
      const backup = await createBackup(repo, profileId);
      const safeLabel = (profileLabel || 'profile').replace(/[<>:"/\\|?*]/g, '-').trim();
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `folio-${safeLabel}-${dateStr}.folio`;
      await downloadTextFile(filename, JSON.stringify(backup), 'application/octet-stream');
      setBackupSuccess('Backup export requested. Keep the saved file somewhere safe.');
    } catch (e: any) {
      setBackupError(e?.message ?? 'Backup failed');
    }
  };

  const handleImportBackup = async (file: File) => {
    if(product.example)return;
    if (!repo) return;
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      try {
        await importBackup(repo, parsed, false);
        setBackupSuccess('Backup imported');
      } catch (err: any) {
        if (err instanceof BackupCollisionError) {
          const profileId = parsed?.profile?.index?.profileId;
          let label = 'profile';
          try {
            if (profileId) {
              const recs = await repo.getProfileRecords(profileId);
              label = recs.index.label;
            }
          } catch {}
          setReplaceTargetProfileId(profileId || null);
          setReplaceTargetLabel(label);
          setPendingBackup(parsed);
          setReplaceConfirmText('');
          setReplaceOpen(true);
          return;
        }
        throw err;
      }
    } catch (e: any) {
      setBackupError(mapBackupError(e));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openRename = async () => {
    if (!profileId) return;
    try {
      const records = await repo.getProfileRecords(profileId);
      setRenameValue(records.index.label);
      setRenameError(null);
      setRenameOpen(true);
    } catch {}
  };

  const confirmRename = async () => {
    if (!renameValue.trim()) {
      setRenameError('Name cannot be empty');document.getElementById('rename-input')?.focus();
      return;
    }
    try {
      await renameCurrentProfile(renameValue.trim());
      setProfileLabel(renameValue.trim());
      setRenameOpen(false);
    } catch (e: any) {
      setRenameError(e?.message ?? 'Rename failed');
    }
  };

  const confirmChangePassword = async () => {
    setPwdError(null);
    if (!pwdCurrent) {
      setPwdError('Current password is required');document.getElementById('pwd-current')?.focus();
      return;
    }
    if (!pwdNew) {
      setPwdError('New password is required');document.getElementById('pwd-new')?.focus();
      return;
    }
    if (!pwdConfirm) {
      setPwdError('Confirm password is required');document.getElementById('pwd-confirm')?.focus();
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError('Passwords do not match');document.getElementById('pwd-confirm')?.focus();
      return;
    }
    try {
      await changePassword(pwdCurrent, pwdNew);
      setPwdOpen(false);
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
    } catch (e: any) {
      setPwdError(e?.message ?? 'Password change failed');
    }
  };

  const confirmReplace = async () => {
    if (!repo || !pendingBackup || !replaceTargetProfileId) return;
    if (replaceConfirmText !== replaceTargetLabel) return;
    try {
      await importBackup(repo, pendingBackup, true);
      if (replaceTargetProfileId === profileId) {
        discardAndLock();
      }
      setBackupSuccess('Backup imported (replaced)');
      setReplaceOpen(false);
      setPendingBackup(null);
    } catch (e: any) {
      setBackupError(mapBackupError(e));
    }
  };

  const exportCsv = async (fn: (data: any) => string, name: string) => {
    if (!controller) return;
    const data = controller.snapshot;
    const csv = fn(data);
    try {
      await downloadTextFile(`${product.example?'FOLIO-EXAMPLE':profileLabel || 'profile'}-${name}.csv`, csv, 'text/csv');
    } catch {
      setBackupError('Could not export CSV. Please try again.');
    }
  };

  return (
    <div className="settings-screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Settings</h1>
          <div className="screen-sub">General preferences and data safety</div>
        </div>
      </div>

      <section className="card">
        <h2 className="card-title">Appearance</h2>
        <div className="field">
          <fieldset>
            <legend className="label" id="appearance-legend">Appearance</legend>
            <div className="segmented" role="group" aria-labelledby="appearance-legend">
              {(['system','light','dark'] as Appearance[]).map(v => (
                <button key={v} type="button" aria-pressed={appearance===v} className={appearance===v?'active':''} onClick={()=>onAppearanceChange(v)}>{v[0].toUpperCase()+v.slice(1)}</button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <ProfileIdentity/>
      {product.example&&<ExampleControls/>}
      <section className="card">
        <h2 className="card-title">Security</h2>
        <div className="field">
          <label className="label" htmlFor="autolock">Auto-lock after inactivity</label>
          <select id="autolock" className="select" value={autoLock ?? 'never'} onChange={e=>{
            const v = e.target.value;
            onAutoLockChange(v==='never'?null:Number(v));
          }}>
            <option value="5">5 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
            <option value="never">Never</option>
          </select>
        </div>
        <div className="field">
          {!product.example&&<button className="btn btn-secondary" onClick={()=>setPwdOpen(true)}>Change password</button>}
          {!product.example&&<div className="muted" style={{marginTop:'0.5rem'}}>If you lose your password, Folio cannot recover your encrypted profile.</div>}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Profile</h2>
        <div className="field">
          <label className="label">Profile name</label>
          <div className="muted">{profileLabel || '—'}</div>
          <button className="btn btn-secondary" onClick={openRename}>Rename</button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Backups & exports</h2>
        {product.example?<p>The example has no private encrypted-backup controls. Reset or Restore recreates canonical sample data; CSV exports work below. <button className="link-btn" onClick={()=>product.openHelp("example-exports")}>Learn more</button></p>:<>
        <div className="field">
          <button className="btn btn-secondary" onClick={handleCreateBackup}>Create encrypted backup</button>
        </div>
        <div className="field">
          <label className="label" htmlFor="restore-input">Restore backup</label>
          <input id="restore-input" type="file" accept=".folio" className="input" ref={fileInputRef} onChange={e=>{
            const f = e.target.files?.[0];
            if (f) handleImportBackup(f);
          }} />
          {backupError && <div role="alert" className="muted" style={{color:'var(--danger)'}}>{backupError}</div>}
          {backupSuccess && <div role="status" className="muted" style={{color:'var(--success)'}}>{backupSuccess}</div>}
        </div>
        </>}
        <p className="field-help">Finish the save/share step and check the saved file. Opening the dialog does not confirm a safe copy.</p>
        <div className="field">
          <div className="muted">CSV files are not encrypted. Anyone with access to the exported file can read its contents.</div>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-secondary" onClick={()=>exportCsv(exportTransactionsCsv, 'transactions')}>Export transactions</button>
            <button className="btn btn-secondary" onClick={()=>exportCsv(exportAccountsCsv, 'accounts')}>Export accounts</button>
            <button className="btn btn-secondary" onClick={()=>exportCsv(exportRecurringCsv, 'recurring')}>Export schedules</button>
            <button className="btn btn-secondary" onClick={()=>exportCsv(exportDebtsCsv, 'debts')}>Export debts</button>
            <button className="btn btn-secondary" onClick={()=>exportCsv(exportGoalsCsv, 'goals')}>Export goals</button>
          </div>
        </div>
      </section>

      <section className="settings-about"><h2>About Folio</h2><p>Version, privacy, ANVA and optional support.</p><button className="btn btn-secondary" onClick={()=>navigate('about')}>About & Contact</button></section>

      <EntryDialog open={renameOpen} title="Rename profile" onClose={()=>setRenameOpen(false)}>            <div>
              <label className="label" htmlFor="rename-input">New name</label>
              <input id="rename-input" className="input" value={renameValue} onChange={e=>setRenameValue(e.target.value)} aria-describedby={renameError?"rename-error":undefined} />
              {renameError && <div id="rename-error" role="alert" style={{color:'var(--danger)', marginTop:'0.5rem'}}>{renameError}</div>}
              <div className="modal-footer" style={{marginTop:'1rem', display:'flex', gap:'0.5rem', justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={()=>setRenameOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmRename}>Rename</button>
              </div>
            </div>
</EntryDialog>

      <EntryDialog open={pwdOpen} title="Change password" onClose={()=>setPwdOpen(false)}>            <div>
              <label className="label" htmlFor="pwd-current">Current password</label>
              <input id="pwd-current" type="password" className="input" value={pwdCurrent} onChange={e=>setPwdCurrent(e.target.value)} aria-describedby={pwdError?"pwd-error":undefined} />
              <label className="label" htmlFor="pwd-new" style={{marginTop:'0.5rem'}}>New password</label>
              <input id="pwd-new" type="password" className="input" value={pwdNew} onChange={e=>setPwdNew(e.target.value)} aria-describedby={pwdError?"pwd-error":undefined} />
              <label className="label" htmlFor="pwd-confirm" style={{marginTop:'0.5rem'}}>Confirm new password</label>
              <input id="pwd-confirm" type="password" className="input" value={pwdConfirm} onChange={e=>setPwdConfirm(e.target.value)} aria-describedby={pwdError?"pwd-error":undefined} />
              <div className="muted" style={{marginTop:'0.5rem'}}>If you lose your password, Folio cannot recover your encrypted profile.</div>
              {pwdError && <div id="pwd-error" role="alert" style={{color:'var(--danger)', marginTop:'0.5rem'}}>{pwdError}</div>}
              <div className="modal-footer" style={{marginTop:'1rem', display:'flex', gap:'0.5rem', justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={()=>setPwdOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmChangePassword}>Change</button>
              </div>
            </div>
</EntryDialog>

      <EntryDialog open={replaceOpen} title="Replace existing profile" onClose={()=>setReplaceOpen(false)}>            <div>
              <div className="muted">A profile with this ID already exists. Replacing will overwrite the existing profile <strong>{replaceTargetLabel}</strong>. This action cannot be undone.</div>
              <label className="label" htmlFor="replace-confirm" style={{marginTop:'0.75rem'}}>Type the profile name to confirm</label>
              <input id="replace-confirm" className="input" value={replaceConfirmText} onChange={e=>setReplaceConfirmText(e.target.value)} placeholder={replaceTargetLabel} aria-describedby="replace-help" />
              <div id="replace-help" className="muted" style={{marginTop:'0.5rem'}}>Enter exactly <strong>{replaceTargetLabel}</strong> to enable Replace.</div>
              <div className="modal-footer" style={{marginTop:'1rem', display:'flex', gap:'0.5rem', justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={()=>setReplaceOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={replaceConfirmText !== replaceTargetLabel} onClick={confirmReplace}>Replace</button>
              </div>
            </div>
</EntryDialog>
    </div>
  );
}


