import { useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { usePresentation } from '../usePresentation';
import { searchTransactions } from '../../domain/transactionSearch';
export function OccurrenceMatch({ scheduleId, date, onClose }: {
    scheduleId: string;
    date: string;
    onClose: () => void;
}) {
    const { controller } = useSession(), { money, dateLabel } = usePresentation();
    const [text, setText] = useState(''), [selected, setSelected] = useState(''), [shown, setShown] = useState(100), [error, setError] = useState('');
    if (!controller)
        return null;
    const data = controller.snapshot, schedule = data.recurring.find(r => r.id === scheduleId);
    if (!schedule)
        return null;
    const linked = new Set((data.financial?.occurrences ?? []).flatMap(o => o.transactionIds));
    const rows = searchTransactions(data.txns.filter(t => !t.archived && t.type === schedule.kind && !linked.has(t.id)), data, { text });
    return <form onSubmit={e => { e.preventDefault(); try {
        controller.matchOccurrence(scheduleId, date, selected);
        onClose();
    }
    catch (err) {
        setError(err instanceof Error ? err.message : 'Could not match');
    } }}><p>Link an existing recorded {schedule.kind} to {schedule.name}, expected {dateLabel(date)}. This does not create or change a transaction. You can link multiple recorded parts separately.</p><label className="label" htmlFor="match-search">Search recorded transactions</label><input className="input" id="match-search" type="search" value={text} onChange={e => { setText(e.target.value); setShown(100); }}/>{rows.slice(0, shown).map(t => <label className="checkbox-label list-row" key={t.id}><input type="radio" name="match-record" value={t.id} checked={selected === t.id} onChange={() => setSelected(t.id)}/><span>{dateLabel(t.date)} · {money(t.amount)} · {data.accounts.find(a => a.id === t.accountId)?.name} · {t.note ?? data.categories.find(c => c.id === t.categoryId)?.name ?? 'Split purchase'}</span></label>)}{rows.length > shown && <button type="button" className="btn btn-secondary" onClick={() => setShown(n => n + 100)}>Show more matching records</button>}{!rows.length && <p>No eligible recorded transactions match. Record the movement only if it actually happened.</p>}{error && <p role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!selected}>Link selected transaction</button></div></form>;
}
