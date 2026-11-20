import {useRef, useState} from 'react';
import {useSession} from '../../application/FolioProvider';
import {prepareBackupImport, validateBackup} from '../../application/backupService';
import {BackupFileError, readBackupFile} from '../../application/backupFile';
import type {PreparedBackupImport} from '../../persistence/profileRepository';
import {EntryDialog} from './EntryDialog';

export function RestoreBackup({onImported}: {onImported?: ()=>void} = {}) {
  const {repo, session, profileId, discardAndLock} = useSession();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [method, setMethod] = useState<'password'|'recovery'>('password');
  const [secret, setSecret] = useState('');
  const [large, setLarge] = useState(false);
  const [candidate, setCandidate] = useState<PreparedBackupImport>();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const close = () => {
    if (running.current) return;
    setOpen(false); setFile(undefined); setSecret(''); setCandidate(undefined); setConfirmation(''); setError('');
  };
  const verify = async () => {
    if (running.current || !file) return;
    running.current = true; setBusy(true); setError(''); setCandidate(undefined);
    try {
      await session?.flush();
      const backup = validateBackup(await readBackupFile(file, large));
      const prepared = await prepareBackupImport(repo, backup, {method, secret});
      setSecret(''); setCandidate(prepared); setConfirmation('');
    } catch (error) {
      setSecret('');
      setError(error instanceof BackupFileError ? error.message : 'The backup could not be verified. Check the file, its historical password or recovery credential, and that Folio supports its format. Existing records were kept.');
    } finally { running.current = false; setBusy(false); }
  };
  const commit = async () => {
    if (!candidate || running.current || (candidate.replacesExisting && confirmation !== candidate.label)) return;
    running.current = true; setBusy(true); setError('');
    try {
      await repo.commitBackupImport(candidate, candidate.replacesExisting);
      if (profileId === candidate.profileId) discardAndLock();
      setOpen(false); setCandidate(undefined);
      if(onImported)onImported();
      else setStatus('Verified backup imported. Open the profile using its historical credentials.');
      window.dispatchEvent(new Event('folio:profilesChanged'));
    } catch {
      setCandidate(undefined);
      setError('The import could not finish, or the destination changed. Existing records were kept. Verify the file again before retrying.');
    } finally { running.current = false; setBusy(false); }
  };
  return <section>
    <button type="button" className="btn btn-secondary" onClick={()=>{setStatus('');setError('');setOpen(true);}}>Restore from backup</button>
    <p role="status">{status}</p>
    <EntryDialog open={open} title="Restore from backup" onClose={close}>
      {!candidate?<form onSubmit={e=>{e.preventDefault();void verify();}}>
        <p>Verify the file before importing. Use its password or recovery credential from when it was made. Existing records are kept if verification fails.</p>
        <div className="field"><label className="label" htmlFor="restore-verified-file">Encrypted backup file</label><input className="input" id="restore-verified-file" type="file" accept=".folio,application/json" disabled={busy} onChange={e=>setFile(e.target.files?.[0])}/></div>
        <div className="field"><label className="label" htmlFor="restore-verified-method">Verify using</label><select className="select" id="restore-verified-method" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value as typeof method);setSecret('');}}><option value="password">Historical password</option><option value="recovery">Historical recovery credential</option></select></div>
        <div className="field"><label className="label" htmlFor="restore-verified-secret">{method==='password'?'Backup password':'Backup recovery credential'}</label><input className="input" id="restore-verified-secret" type="password" autoComplete="off" value={secret} disabled={busy} onChange={e=>setSecret(e.target.value)}/></div>
        {window.folioDesktop&&<label className="checkbox-label"><input type="checkbox" checked={large} disabled={busy} onChange={e=>setLarge(e.target.checked)}/><span>Allow large-file recovery up to 256 MB on this computer. It may take longer and use more memory.</span></label>}
        <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy||!file||!secret}>{busy?'Verifying backup…':'Verify backup'}</button></div>
      </form>:<section>
        <p>Authenticated and readable. {candidate.replacesExisting?'Replacing overwrites this profile’s saved records. Save a current backup of the destination first.':'Import creates a profile from this verified backup.'}</p>
        <p>Profile: <strong>{candidate.label}</strong></p>
        {candidate.replacesExisting&&<div className="field"><label className="label" htmlFor="restore-verified-confirm">Type the profile name to confirm replacement</label><input className="input" id="restore-verified-confirm" autoComplete="off" value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></div>}
        <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy||(candidate.replacesExisting&&confirmation!==candidate.label)} onClick={()=>void commit()}>{busy?'Importing…':candidate.replacesExisting?'Replace verified profile':'Import verified profile'}</button></div>
      </section>}
      {error&&<p role="alert">{error}</p>}
    </EntryDialog>
  </section>;
}

