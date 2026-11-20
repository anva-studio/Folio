import {MonthCalendar} from './MonthCalendar';
import { OccurrenceMatch } from './OccurrenceMatch';
import { useEffect, useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { usePresentation } from '../usePresentation';
import { todayKey } from '../../domain/dates';
import { occurrencesInMonth } from '../../domain/recurring';
import { EntryDialog } from './EntryDialog';
import { TransactionForm } from '../forms/TransactionForm';
import { sumMinor } from '../../domain/money';
import { navigate } from '../navigation';
export function FinancialTimeline() {
    const { controller } = useSession(), { money, dateLabel } = usePresentation();
    const [selectedDate,setSelectedDate]=useState<string>(),[shownRecords,setShownRecords]=useState(100);
    const [month, setMonth] = useState(todayKey().slice(0, 7)), [entry, setEntry] = useState<{
        scheduleId: string;
        date: string;
    }>(), [error, setError] = useState(''), [matching, setMatching] = useState<{
        scheduleId: string;
        date: string;
    }>(), [unlink, setUnlink] = useState<{
        scheduleId: string;
        date: string;
    }>();
    useEffect(()=>{setShownRecords(100);},[month,selectedDate]);
    if (!controller)
        return null;
    const data = controller.snapshot;
    const rows = data.recurring.flatMap(r => { const dates = new Set([...occurrencesInMonth(r, month), ...(data.financial?.occurrences ?? []).filter(o => o.scheduleId === r.id && o.date.slice(0, 7) === month).map(o => o.date)]); return [...dates].map(date => ({ r, date, state: data.financial?.occurrences?.find(o => o.scheduleId === r.id && o.date === date) })); }).sort((a, b) => a.date.localeCompare(b.date) || a.r.name.localeCompare(b.r.name));
    const expectedCounts=new Map<string,number>();for(const row of rows)expectedCounts.set(row.date,(expectedCounts.get(row.date)??0)+1);
    const recordedRows=data.txns.filter(t=>!t.archived&&t.date.slice(0,7)===month).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    const recordedCounts=new Map<string,number>();for(const row of recordedRows)recordedCounts.set(row.date,(recordedCounts.get(row.date)??0)+1);
    const visibleRows=selectedDate?rows.filter(r=>r.date===selectedDate):rows,visibleRecords=selectedDate?recordedRows.filter(r=>r.date===selectedDate):recordedRows;
    const run = (action: () => void) => { try {
        action();
        setError('');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update occurrence');
    } };
    const schedule = entry ? data.recurring.find(r => r.id === entry.scheduleId) : undefined;
    return <section className="card"><h2 className="card-title">Financial timeline</h2><div className="field"><label className="label" htmlFor="timeline-month">Timeline month</label><input className="input" type="month" id="timeline-month" value={month} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
        setMonth(e.target.value);setSelectedDate(undefined); }}/></div><p>Expected income and commitments are separate from recorded money. Not matched does not mean unpaid.</p><MonthCalendar month={month} expectedCounts={expectedCounts} recordedCounts={recordedCounts} selected={selectedDate} onSelect={setSelectedDate}/><h3>{selectedDate?dateLabel(selectedDate):'All dates'} · scheduled entries</h3>{visibleRows.length === 0 && <p>No scheduled entries in this selection.</p>}{visibleRows.map(({ r, date, state }) => { const linked = data.txns.filter(t => state?.transactionIds.includes(t.id) && !t.archived), recorded = sumMinor(linked.map(t => t.amount)); return <article className="notebook-section" key={r.id + date}><h3>{r.name}</h3><p>{dateLabel(date)} · expected {money(state?.expectedAmount ?? r.amount)} · {r.kind}</p><p>{state?.state === 'matched' ? `Linked recorded total: ${money(recorded)}${!linked.length ? ' · linked records are excluded' : ''}` : state?.state ?? (date < todayKey() ? 'Not matched' : date === todayKey() ? 'Due · not matched' : 'Upcoming')}</p>{r.note && <p>{r.note}</p>}<div className="action-row"><button className="btn btn-secondary" onClick={() => setMatching({ scheduleId: r.id, date })}>Link recorded transaction</button>{!state && <><button className="btn btn-primary" onClick={() => setEntry({ scheduleId: r.id, date })}>Record this transaction</button><button className="btn btn-secondary" onClick={() => run(() => controller.decideOccurrence(r.id, date, 'skipped'))}>Skip occurrence</button><button className="btn btn-ghost" onClick={() => run(() => controller.decideOccurrence(r.id, date, 'no-longer-expected'))}>No longer expected</button></>}{state?.transactionIds.map(id => <button className="btn btn-secondary" key={id} onClick={() => navigate('transactions', 'edit', id)}>View linked record</button>)}{state && <button className="btn btn-ghost" onClick={() => setUnlink({ scheduleId: r.id, date })}>{state.state === 'matched' ? 'Unlink occurrence' : 'Reopen occurrence'}</button>}</div>{state?.state === 'matched' && recorded !== state.expectedAmount && <p className="field-help">Recorded and expected amounts differ. This is not a claim that a remainder is unpaid.</p>}</article>; })}<h3>Recorded transactions</h3><p className="field-help">Included ledger entries, separate from expected schedules. Transfers are movements between accounts, not earned income. No schedule is matched automatically.</p>{visibleRecords.length===0&&<p>No included transactions in this selection.</p>}{visibleRecords.slice(0,shownRecords).map(t=><article className="notebook-section" key={t.id}><h4>{dateLabel(t.date)} · {t.type} · <span className="amount">{money(t.amount)}</span></h4><p>{data.accounts.find(a=>a.id===t.accountId)?.name}{t.type==='transfer'&&' → '+data.accounts.find(a=>a.id===t.toAccountId)?.name}{t.note&&' · '+t.note}</p><button type="button" className="btn btn-small btn-secondary" onClick={()=>navigate('transactions','edit',t.id)}>View recorded transaction</button></article>)}{visibleRecords.length>shownRecords&&<button type="button" className="btn btn-secondary" onClick={()=>setShownRecords(n=>n+100)}>Show 100 more recorded transactions</button>}{error && <p role="alert">{error}</p>}<EntryDialog open={!!matching} title="Match scheduled occurrence" onClose={() => setMatching(undefined)}>{matching && <OccurrenceMatch {...matching} onClose={() => setMatching(undefined)}/>}</EntryDialog><EntryDialog open={!!unlink} title="Reopen occurrence" onClose={() => setUnlink(undefined)}><p>Linked transactions remain in your ledger. Reopening changes only the occurrence decision. Link the existing records again instead of recording the same movement twice.</p><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setUnlink(undefined)}>Cancel</button><button className="btn btn-primary" onClick={() => run(() => { if (unlink)
        controller.reopenOccurrence(unlink.scheduleId, unlink.date); setUnlink(undefined); })}>Reopen; keep transactions</button></div></EntryDialog><EntryDialog open={!!entry} title="Record scheduled transaction" onClose={() => setEntry(undefined)}>{entry && schedule && <TransactionForm onClose={() => setEntry(undefined)} scheduledOccurrence={entry} initial={{ type: schedule.kind, date: entry.date, amount: schedule.amount, accountId: schedule.accountId, categoryId: schedule.categoryId, note: schedule.note ?? schedule.name }}/>}</EntryDialog></section>;
}
