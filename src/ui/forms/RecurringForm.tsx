import { useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { parseAmountToMinor, INR } from '../../domain/money.js';
import { todayKey } from '../../domain/dates.js';
import type { Recurring } from '../../domain/types.js';

export function RecurringForm({
  onClose,
  editingRecurringId,
  initial,
}: {
  onClose: () => void;
  editingRecurringId?: string;
  initial?: Partial<Recurring>;
}) {
  const { controller } = useSession();
  if (!controller) return null;
  const snap = controller.snapshot;

  const defaultStartDate = todayKey();

  const formatInput = (minor?: number) => {
    if (minor === undefined) return '';
    const divisor = Math.pow(10, INR.minorDigits);
    const whole = Math.trunc(Math.abs(minor) / divisor);
    const frac = Math.abs(minor) % divisor;
    const fracStr = String(frac).padStart(INR.minorDigits, '0');
    // Use plain numeric string for input to avoid grouping issues in parsing
    return (minor < 0 ? '-' : '') + `${whole}.${fracStr}`;
  };

  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<'income'|'expense'>(initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(formatInput(initial?.amount));
  const [frequency, setFrequency] = useState<'weekly'|'monthly'|'quarterly'|'yearly'>(initial?.frequency ?? 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth ?? 1);
  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek ?? 1);
  const [accountId, setAccountId] = useState(initial?.accountId ?? snap.accounts.find(a=>!a.archived)?.id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? defaultStartDate);
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [errorField,setErrorField]=useState('');
  const [error, setError] = useState<string|null>(null);

  const activeAccounts = useMemo(()=>snap.accounts.filter(a=>!a.archived), [snap.accounts]);
  const cats = useMemo(()=>snap.categories.filter(c=>c.kind===kind), [snap.categories]);



  const changeKind = (nextKind: 'income'|'expense') => {
    if (nextKind !== kind) {
      setKind(nextKind);
      setCategoryId('');
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let field='recurring-name';
    try {
      if (!name.trim()) throw new Error('Name is required');
      field='recurring-amount';
      const minor = parseAmountToMinor(amount, { minorDigits: INR.minorDigits, symbol: INR.symbol });
      if (!Number.isFinite(minor)) throw new Error('Amount must be a valid number');
      if (minor <=0) throw new Error('Amount must be greater than zero');
      field=frequency==='weekly'?'recurring-day-of-week':'recurring-day-of-month';
      if (frequency==='weekly' && dayOfWeek===undefined) throw new Error('Please select a day of week');
      if (frequency!=='weekly' && (dayOfMonth <1 || dayOfMonth >28)) throw new Error('Day of month must be between 1 and 28');
      field='recurring-start-date';
      const payload = {
        name: name.trim(),
        kind,
        amount: minor,
        frequency,
        dayOfMonth: frequency==='weekly'?1:dayOfMonth,
        dayOfWeek: frequency==='weekly'?dayOfWeek:undefined,
        accountId: accountId||undefined,
        categoryId: categoryId||undefined,
        startDate,
        endDate: endDate||undefined,
      };
      if (editingRecurringId) {
        controller.editRecurring(editingRecurringId, payload);
      } else {
        controller.createRecurring({ ...payload, active: true });
      }
      onClose();
    } catch (e:any) { setError(e.message);setErrorField(field); document.getElementById(field)?.focus(); }
  };

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <div className="field"><label htmlFor="recurring-name" className="label">Name</label><input id="recurring-name" aria-invalid={errorField==='recurring-name'} aria-describedby={errorField==='recurring-name'?'recurring-error':undefined} className="input" value={name} onChange={e=>setName(e.target.value)} /></div>
        <div className="field">
          <fieldset className="label" role="group" aria-label="Kind">
            <legend className="label">Kind</legend>
            <div className="segmented">
              {(['income','expense'] as const).map(k=>(
                <button type="button" key={k} className={kind===k?'active':''} onClick={()=>changeKind(k)} aria-pressed={kind===k}>{k}</button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="recurring-amount" className="label">Amount</label><div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input id="recurring-amount" aria-invalid={errorField==='recurring-amount'} aria-describedby={errorField==='recurring-amount'?'recurring-error':undefined} value={amount} onChange={e=>setAmount(e.target.value)} /></div></div>
        <div className="field"><label htmlFor="recurring-frequency" className="label">Frequency</label>
          <select id="recurring-frequency" aria-invalid={errorField==='recurring-frequency'} aria-describedby={errorField==='recurring-frequency'?'recurring-error':undefined} className="select" value={frequency} onChange={e=>setFrequency(e.target.value as any)}>
            {['weekly','monthly','quarterly','yearly'].map(f=> <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      {frequency==='weekly' ? (
        <div className="field"><label htmlFor="recurring-day-of-week" className="label">Day of week</label>
          <select id="recurring-day-of-week" aria-invalid={errorField==='recurring-day-of-week'} aria-describedby={errorField==='recurring-day-of-week'?'recurring-error':undefined} className="select" value={dayOfWeek} onChange={e=>setDayOfWeek(Number(e.target.value))}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=> <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      ) : (
        <div className="field"><label htmlFor="recurring-day-of-month" className="label">Day of month</label>
          <input id="recurring-day-of-month" aria-invalid={errorField==='recurring-day-of-month'} aria-describedby={errorField==='recurring-day-of-month'?'recurring-error':undefined} type="number" min={1} max={28} className="input" value={dayOfMonth} onChange={e=>setDayOfMonth(Number(e.target.value))} />
        </div>
      )}
      <div className="form-row">
        <div className="field"><label htmlFor="recurring-account" className="label">Account (optional)</label>
          <select id="recurring-account" aria-invalid={errorField==='recurring-account'} aria-describedby={errorField==='recurring-account'?'recurring-error':undefined} className="select" value={accountId} onChange={e=>setAccountId(e.target.value)}>
            <option value="">None</option>
            {activeAccounts.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="recurring-category" className="label">Category (optional)</label>
          <select id="recurring-category" aria-invalid={errorField==='recurring-category'} aria-describedby={errorField==='recurring-category'?'recurring-error':undefined} className="select" value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
            <option value="">None</option>
            {cats.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="recurring-start-date" className="label">Start date</label><input id="recurring-start-date" aria-invalid={errorField==='recurring-start-date'} aria-describedby={errorField==='recurring-start-date'?'recurring-error':undefined} type="date" className="input" value={startDate} onChange={e=>setStartDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="recurring-end-date" className="label">End date (optional)</label><input id="recurring-end-date" aria-invalid={errorField==='recurring-end-date'} aria-describedby={errorField==='recurring-end-date'?'recurring-error':undefined} type="date" className="input" value={endDate} onChange={e=>setEndDate(e.target.value)} /></div>
      </div>
      {error && <div id="recurring-error" role="alert" className="field-error">{error}</div>}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="submit">{editingRecurringId ? 'Save' : 'Create'}</button>
      </div>
    </form>
  );
}


