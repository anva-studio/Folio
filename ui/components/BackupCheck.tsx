import {readBackupFile} from '../../application/backupFile';
import { useState } from 'react';
import { checkBackup, checkBackupWithRecovery } from '../../application/backupCheck';
export function BackupCheck() {
    const [large,setLarge]=useState(false);
    const [method, setMethod] = useState<'password'|'recovery'>('password');
    const [file, setFile] = useState<File>(), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState<Awaited<ReturnType<typeof checkBackup>>>();
    return <details><summary>Test an encrypted backup</summary><form onSubmit={async (e) => { e.preventDefault(); if (busy)
        return; setBusy(true); setError(''); setResult(undefined); try {
        if (!file)
            throw new Error('Choose a backup file');
        const raw = await readBackupFile(file,large);
        setResult(await (method === 'password' ? checkBackup(raw, password) : checkBackupWithRecovery(raw, password)));
    }
    catch (err) {
        setError(err instanceof Error ? err.message : 'Backup could not be verified');
    }
    finally {
        setPassword('');
        setBusy(false);
    } }}><p>Check structure, supported format, credential authentication, decryption, and readable profile data. Nothing is imported or overwritten. Use the password or recovery credential from when this backup was made. A newer credential may not open an older backup.</p><div className="field"><label className="label" htmlFor="check-backup-file">Backup to test</label><input id="check-backup-file" type="file" disabled={busy} accept=".folio,application/json" onChange={e => { setFile(e.target.files?.[0]); setResult(undefined); setError(''); }}/></div>{window.folioDesktop&&<label className="checkbox-label"><input type="checkbox" checked={large} disabled={busy} onChange={e=>setLarge(e.target.checked)}/><span>Allow large-file recovery up to 256 MB on this computer</span></label>}<div className="field"><label className="label" htmlFor="check-backup-method">Verify using</label><select className="select" id="check-backup-method" disabled={busy} value={method} onChange={e=>{setMethod(e.target.value as 'password'|'recovery');setPassword('');setResult(undefined);setError('');}}><option value="password">Historical password</option><option value="recovery">Historical recovery credential</option></select></div><div className="field"><label className="label" htmlFor="check-backup-password">{method === 'password' ? 'Backup password' : 'Backup recovery credential'}</label><input className="input" id="check-backup-password" type="password" disabled={busy} autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}/></div><button className="btn btn-secondary" type="submit" disabled={busy}>{busy ? 'Checking backup…' : 'Test backup without importing'}</button>{error && <p role="alert">{error}</p>}{result && <p role="status">Authenticated and readable: {result.label} · {result.currency} · {result.accounts} accounts · {result.transactions} transactions · exported {result.exportedAt.slice(0, 10)} · profile format {result.profileVersion}. No data was imported. This does not verify off-device storage or prove every record is complete.</p>}</form></details>;
}

