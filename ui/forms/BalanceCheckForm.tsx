import { subMinor } from '../../domain/money';
import { useEntryCheckpoint } from '../hooks/useEntryCheckpoint';
import { useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { usePresentation } from '../usePresentation';
import { todayKey } from '../../domain/dates';
import { adjustedBalances } from '../../domain/financialRecords';
export function BalanceCheckForm({ accountId }: {
    accountId: string;
}) {
    const checkpoint = useEntryCheckpoint<HTMLFormElement>();
    const { controller } = useSession(), { money, parseAmount } = usePresentation();
    const [date, setDate] = useState(todayKey()), [actual, setActual] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState(''), [checked, setChecked] = useState(false), [status, setStatus] = useState('');
    if (!controller)
        return null;
    const data = controller.snapshot, recorded = adjustedBalances(data, date).get(accountId) ?? 0;
    let difference: number | undefined;
    try {
        if (actual)
            difference = subMinor(parseAmount(actual), recorded);
    }
    catch { }
    const run = (action: () => void) => { try {
        action();
        setError('');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save');
    } };
    return <form ref={checkpoint.ref} onSubmit={e => { e.preventDefault(); run(() => { controller.recordBalanceCheck(accountId, date, parseAmount(actual)); setChecked(true); setStatus('Comparison recorded. Your balance has not been changed.'); checkpoint.markSaved(); }); }}><p>Compare with a statement or balance you have checked yourself. Folio does not contact your bank or independently verify it.</p><div className="field"><label className="label" htmlFor="check-date">Balance check date</label><input className="input" id="check-date" type="date" value={date} onChange={e => { setDate(e.target.value); setChecked(false); }}/></div><p>Recorded through this date: <strong className="amount">{money(recorded)}</strong></p><p className="field-help">Opening balance plus included transactions and adjustments through this date. The original opening balance has no historical verification.</p><div className="field"><label className="label" htmlFor="actual-balance">Actual balance you checked</label><input className="input" inputMode="decimal" id="actual-balance" value={actual} onChange={e => { setActual(e.target.value); setChecked(false); }}/></div>{difference !== undefined && <p>Difference: <strong className="amount">{money(difference)}</strong></p>}<button className="btn btn-primary" type="submit">Record comparison</button>{checked && difference !== undefined && difference !== 0 && <section><h3>Optional balance adjustment</h3><p>This creates a dated adjustment, separate from income and spending. Check for missing or incorrect transactions first.</p><label className="label" htmlFor="adjustment-reason">Reason for adjustment</label><input id="adjustment-reason" className="input" value={reason} onChange={e => setReason(e.target.value)}/><button type="button" className="btn btn-secondary" onClick={() => run(() => { controller.recordAdjustment(accountId, date, difference!, reason); setChecked(false); setStatus('Adjustment recorded in the audit trail.'); checkpoint.markSaved(); })}>Record adjustment</button></section>}<p className="field-help">Uses profile format 2. Older Folio versions cannot open this profile after saving.</p>{error && <p role="alert">{error}</p>}<p role="status">{status}</p><h3>Check history</h3>{(data.financial?.checks ?? []).filter(c => c.accountId === accountId).slice().reverse().map(c => <p key={c.id}>{c.date} · recorded {money(c.recorded)} · entered {money(c.actual)} · difference {money(subMinor(c.actual, c.recorded))}</p>)}<h3>Adjustment audit trail</h3>{(data.financial?.adjustments ?? []).filter(a => a.accountId === accountId).map(a => <div className="list-row" key={a.id}><span>{a.date} · {a.reason} · <strong className="amount">{money(a.delta)}</strong>{a.reversesId && ' · reversal'}</span>{!a.reversesId && !(data.financial?.adjustments ?? []).some(r => r.reversesId === a.id) && <button type="button" className="btn btn-secondary" onClick={() => run(() => controller.recordAdjustment(accountId, todayKey(), -a.delta, 'Reversal: ' + a.reason, a.id))}>Reverse adjustment</button>}</div>)}</form>;
}
