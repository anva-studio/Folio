import { useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { usePresentation } from '../usePresentation';
import { todayKey, daysInCalendarMonth } from '../../domain/dates';
import { targetProgress } from '../../domain/financialRecords';
export function SpendingTargets() {
    const { controller } = useSession(), { money, parseAmount, inputAmount } = usePresentation();
    const today = todayKey(), month = today.slice(0, 7), [year, numMonth] = month.split('-').map(Number);
    const [category, setCategory] = useState(''), [amount, setAmount] = useState(''), [from, setFrom] = useState(month + '-01'), [to, setTo] = useState(month + '-' + daysInCalendarMonth(year, numMonth)), [editing, setEditing] = useState<string>(), [error, setError] = useState('');
    if (!controller)
        return null;
    const data = controller.snapshot;
    return <section className="card"><h2 className="card-title">Spending targets</h2><p>Compare net recorded spending with your chosen category target. A target reserves no money.</p>{(data.financial?.targets ?? []).map(t => { const progress = targetProgress(data, t, today); return <div className="notebook-section" key={t.id}><h3>{data.categories.find(c => c.id === t.categoryId)?.name}</h3><p>{t.from} – {t.to}</p><dl className="metric-list"><div><dt>Target</dt><dd>{money(t.amount)}</dd></div><div><dt>Net recorded spending</dt><dd>{money(progress.spent)}</dd></div><div><dt>Remaining / over target</dt><dd>{money(progress.remaining)}</dd></div></dl><p>{progress.elapsed} of {progress.days} days elapsed. {today < t.from ? 'Period has not started.' : today > t.to ? 'Period ended.' : progress.abovePace ? 'Spending is above the straight-line target pace.' : 'Spending is within the straight-line target pace.'} This comparison is not a forecast.</p><div className="action-row"><button className="btn btn-secondary" onClick={() => { setEditing(t.id); setCategory(t.categoryId); setAmount(inputAmount(t.amount)); setFrom(t.from); setTo(t.to); }}>Edit target</button><button className="btn btn-ghost" onClick={() => controller.removeSpendingTarget(t.id)}>Remove target</button></div></div>; })}<details><summary>{editing ? 'Edit target' : 'Add a spending target'}</summary><form onSubmit={e => { e.preventDefault(); try {
        controller.saveSpendingTarget({ categoryId: category, amount: parseAmount(amount), from, to }, editing);
        setError('');
        setEditing(undefined);
        setAmount('');
    }
    catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save target');
    } }}><div className="field"><label className="label" htmlFor="target-category">Target category</label><select className="select" id="target-category" value={category} onChange={e => setCategory(e.target.value)}><option value="">Select</option>{data.categories.filter(c => c.kind === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label className="label" htmlFor="target-amount">Spending target amount</label><input className="input" inputMode="decimal" id="target-amount" value={amount} onChange={e => setAmount(e.target.value)}/></div><div className="form-row"><div className="field"><label className="label" htmlFor="target-from">Target start</label><input className="input" type="date" id="target-from" value={from} onChange={e => setFrom(e.target.value)}/></div><div className="field"><label className="label" htmlFor="target-to">Target end</label><input className="input" type="date" id="target-to" value={to} onChange={e => setTo(e.target.value)}/></div></div>{error && <p role="alert">{error}</p>}<p className="field-help">Uses profile format 2. Previous Folio versions cannot open this profile after saving.</p><button className="btn btn-primary" type="submit">Save target</button></form></details></section>;
}
