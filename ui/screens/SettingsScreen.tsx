import {RestoreBackup} from '../components/RestoreBackup';
import {LandingPreference} from '../components/LandingPreference';
import {ReminderSettings} from '../components/ReminderSettings';
import {PrivacyDisplaySettings} from '../components/PrivacyDisplay';
import {RecoverySettings} from '../components/RecoverySettings';
import {CsvImport} from '../components/CsvImport';
import {BackupAssistant} from '../components/BackupAssistant';
import {useProduct} from '../../application/productNavigation';
import {RegionalPreferences} from '../components/RegionalPreferences';
import {ProfileIdentity} from '../components/ProfileIdentity';
import {ExampleControls} from '../components/ExampleControls';
import { EntryDialog } from '../components/EntryDialog';
import { navigate } from '../navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { getAppearance, setAppearance, applyTheme, type Appearance } from '../../application/devicePreferences.js';
import { getAutoLockMinutes, setAutoLockMinutes } from '../../application/devicePreferences.js';
import { createBackup } from '../../application/backupService.js';
import { exportTransactionsCsv, exportAccountsCsv, exportRecurringCsv, exportDebtsCsv, exportGoalsCsv, exportCategoriesCsv, exportPlanningRecordsCsv } from '../../application/csvExport.js';
import { downloadTextFile } from '../../application/fileDownload.js';

export function SettingsScreen() {
  const product=useProduct();
  const { profileId, controller, renameCurrentProfile, changePassword, repo, session } = useSession();
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
  const [exportStatus,setExportStatus]=useState('');
  const [exportBusy,setExportBusy]=useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupBusy,setBackupBusy]=useState(false);
  const backupSaving=useRef(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);

  useEffect(() => {
    const app = getAppearance();
    setAppearanceState(app);
    applyTheme(app);
    if (!profileId) return;
    const minutes = getAutoLockMinutes(profileId);
    setAutoLockState(minutes);
    (async () => {
      try {
        const profile = (await repo.listProfiles()).find(p=>p.profileId===profileId);
        if(profile)setProfileLabel(profile.label);
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


  const handleCreateBackup = async () => {
    if (product.example || !profileId || !repo || !session || backupSaving.current) return;
    backupSaving.current=true;setBackupBusy(true);
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
      const safeLabel = backup.profile.index.label.replace(/[<>:"/\\|?*]/g, '-').trim() || 'profile';
      const dateStr = backup.exportedAt.slice(0, 10);
      const filename = `folio-${safeLabel}-${dateStr}.folio`;
      await downloadTextFile(filename, JSON.stringify(backup), 'application/octet-stream');
      setBackupSuccess('Backup export requested. Keep the saved file somewhere safe.');
    } catch (e: any) {
      setBackupError(e?.message ?? 'Backup failed');
    } finally {backupSaving.current=false;setBackupBusy(false);}
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

  const exportCsv = async (fn: (data: any) => string, name: string) => {
    if (!controller) return;
    if(exportBusy)return;setExportBusy(true);setExportStatus('');
    const data = controller.snapshot;
    const csv = fn(data);
    try {
      const currentLabel=product.example?'FOLIO-EXAMPLE':(await repo.listProfiles().catch(()=>[])).find(p=>p.profileId===profileId)?.label||profileLabel||'profile';
      await downloadTextFile(`${currentLabel}-${name}.csv`, csv, 'text/csv');
      setExportStatus('CSV export requested. Finish saving the file outside Folio.');
    } catch {
      setExportStatus('Could not export CSV. Please try again.');
    }
    finally{setExportBusy(false);}
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

      <ProfileIdentity onRename={openRename}/><RegionalPreferences/><PrivacyDisplaySettings/><LandingPreference/><ReminderSettings/>
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
          {!product.example&&<RecoverySettings/>}
        </div>
      </section>



      <section className="card">
        <h2 className="card-title" id="backup-exports-title">Backups & exports</h2>
        {product.example?<p>The example has no private encrypted-backup controls. Reset or Restore recreates canonical sample data; CSV exports work below. <button className="link-btn" onClick={()=>product.openHelp("example-exports")}>Learn more</button></p>:<>
        <BackupAssistant creating={backupBusy} onCreate={()=>void handleCreateBackup()}/>
        <RestoreBackup/>
        {backupError&&<p role="alert">{backupError}</p>}{backupSuccess&&<p role="status">{backupSuccess}</p>}
        </>}
        <p className="field-help">Finish the save/share step and check the saved file. Opening the dialog does not confirm a safe copy.</p>
        <div className="field">
          <div className="muted">CSV files are not encrypted and include actual values even when Hide amounts is on. Anyone with access to the exported file can read its contents.</div>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-secondary" disabled={exportBusy} onClick={()=>exportCsv(exportTransactionsCsv, 'transactions')}>Export transactions</button>
            <button className="btn btn-secondary" disabled={exportBusy} onClick={()=>exportCsv(exportAccountsCsv, 'accounts')}>Export accounts</button>
            <button className="btn btn-secondary" disabled={exportBusy} onClick={()=>exportCsv(exportRecurringCsv, 'recurring')}>Export schedules</button>
            <button className="btn btn-secondary" disabled={exportBusy} onClick={()=>exportCsv(exportDebtsCsv, 'debts')}>Export debts</button>
            <button className="btn btn-secondary" disabled={exportBusy} onClick={()=>exportCsv(exportGoalsCsv, 'goals')}>Export goals</button><button className="btn btn-secondary" disabled={exportBusy} onClick={()=>exportCsv(exportCategoriesCsv, 'categories')}>Export categories</button><button className="btn btn-secondary" disabled={exportBusy} onClick={()=>exportCsv(exportPlanningRecordsCsv, 'planning-audit')}>Export planning & audit</button>
          </div><p className="field-help">Planning & audit exports stored records as JSON cells with the currency and minor-unit precision identified. Money fields use integer minor units; rates and month counts keep their own meaning. It excludes temporary comparisons. CSV files do not restore a complete profile; use an encrypted backup for that.</p><p className="export-status" role="status">{exportBusy?'Preparing export…':exportStatus}</p>
        </div>
      </section>

      {!product.example&&<CsvImport/>}
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
              <div className="muted" style={{marginTop:'0.5rem'}}>New passwords need at least 12 characters; a long, unique passphrase is recommended. Recovery requires a credential enabled and saved before losing your password. ANVA cannot reset it. Older backups retain their historical credentials; create a new encrypted backup after changing your password.</div>
              {pwdError && <div id="pwd-error" role="alert" style={{color:'var(--danger)', marginTop:'0.5rem'}}>{pwdError}</div>}
              <div className="modal-footer" style={{marginTop:'1rem', display:'flex', gap:'0.5rem', justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={()=>setPwdOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmChangePassword}>Change</button>
              </div>
            </div>
</EntryDialog>


    </div>
  );
}





