import { navigate } from '../navigation';
import { lastAccounts } from '../sessionPreferences';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { parseAmountToMinor, INR } from '../../domain/money.js';
import { todayKey } from '../../domain/dates.js';

function formatAmountForInput(minor?: number) {
  if (minor == null) return '';
  // Simple decimal conversion avoids floating quirks for typical sizes
  const divisor = Math.pow(10, INR.minorDigits);
  const whole = Math.trunc(Math.abs(minor) / divisor);
  const frac = Math.abs(minor) % divisor;
  const fracStr = String(frac).padStart(INR.minorDigits, '0');
  // Use plain numeric string for input to avoid grouping issues in parsing
  return (minor < 0 ? '-' : '') + `${whole}.${fracStr}`;
}

export function TransactionForm({
  onClose,
  editingTxnId,
  initial,
}: {
  onClose: () => void;
  editingTxnId?: string;
  initial?: {
    type?: 'income' | 'expense' | 'transfer';
    date?: string;
    amount?: number;
    accountId?: string;
    toAccountId?: string;
    categoryId?: string;
    note?: string;
  };
}) {
  const { controller } = useSession();
  if (!controller) return null;
  const snap = controller.snapshot;
  const activeAccounts = useMemo(()=>snap.accounts.filter(a=>!a.archived), [snap.accounts]);
  const defaultDate = todayKey();
  const formRef = useRef<HTMLFormElement>(null);
  const [savedCount, setSavedCount] = useState(0);
  const submitting = useRef(false);
  useLayoutEffect(() => { if (savedCount) { formRef.current?.dispatchEvent(new Event('folio:formSaved', {bubbles:true})); formRef.current?.querySelector<HTMLInputElement>('#transaction-amount')?.focus(); } }, [savedCount]);
  const [kind, setKind] = useState<'income'|'expense'|'transfer'>(initial?.type ?? 'expense');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [amount, setAmount] = useState(formatAmountForInput(initial?.amount));
  const [accountId, setAccountId] = useState(initial?.accountId ?? activeAccounts.find(a => a.id === lastAccounts.get(controller))?.id ?? activeAccounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [errorField,setErrorField] = useState('');
  const [error, setError] = useState<string|null>(null);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameError, setNewCatNameError] = useState<string | null>(null);

  const incomeCats = useMemo(()=>snap.categories.filter(c=>c.kind==='income'), [snap.categories]);
  const expenseCats = useMemo(()=>snap.categories.filter(c=>c.kind==='expense'), [snap.categories]);
  const cats = kind==='income'?incomeCats:kind==='expense'?expenseCats:[];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const another = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'another';
    setError(null);setErrorField('');
    let field='transaction-account';
    try {
      if (!accountId) throw new Error('Please select an account');
      if (kind==='transfer') {
        field='transaction-to-account';
        if (!toAccountId) throw new Error('Please select a destination account');
        if (accountId===toAccountId) throw new Error('Source and destination accounts must be different');
      } else {
        field='transaction-category';
        if (!categoryId) throw new Error('Please select a category');
      }
      field='transaction-amount';
      const minor = parseAmountToMinor(amount, { minorDigits: INR.minorDigits, symbol: INR.symbol });
      if (!Number.isFinite(minor)) throw new Error('Amount must be a valid number');
      if (minor <= 0) throw new Error('Amount must be greater than zero');
      field='transaction-date';
      const payload = {
        type: kind,
        date,
        amount: minor,
        accountId,
        toAccountId: kind==='transfer'?toAccountId:undefined,
        categoryId: kind==='transfer'?undefined:categoryId,
        note: note||undefined,
      };
      if (editingTxnId) {
        controller.editTransaction(editingTxnId, payload);
      } else {
        controller.createTransaction(payload);
      }
      lastAccounts.set(controller, accountId);
      if (another && !editingTxnId) { setAmount(''); setCategoryId(''); setNote(''); setToAccountId(''); setSavedCount(n=>n+1); }
      else onClose();
    } catch (e:any) { setError(e.message);setErrorField(field); document.getElementById(field)?.focus(); }
    finally { queueMicrotask(() => { submitting.current = false; }); }
  };

  if (!activeAccounts.length) return <div className="empty-state"><h3>Add an account first</h3><p>Transactions need an account to record where money moved.</p><button className="btn btn-primary" onClick={()=>{onClose();navigate('accounts','create');}}>Add an account</button></div>;
  return (
    <form ref={formRef} onSubmit={submit}>
      <fieldset className="field" role="group" aria-label="Type">
        <legend className="label">Type</legend>
        <div className="segmented">
          {(['income','expense','transfer'] as const).map(k=>(
            <button type="button" key={k} className={kind===k?'active':''} onClick={()=>setKind(k)} disabled={!!editingTxnId} aria-pressed={kind===k}>{k}</button>
          ))}
        </div>
      </fieldset>
      <div className="form-row">
        <div className="field"><label htmlFor="transaction-date" className="label">Date</label><input id="transaction-date" aria-invalid={errorField==='transaction-date'} aria-describedby={errorField==='transaction-date'?'transaction-error':undefined} type="date" className="input" value={date} onChange={e=>setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="transaction-amount" className="label">Amount</label><div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" data-initial-focus={!editingTxnId || undefined} aria-invalid={errorField==='transaction-amount'} aria-describedby={errorField==='transaction-amount' ? "transaction-error" : undefined} id="transaction-amount" value={amount} onChange={e=>setAmount(e.target.value)} /></div></div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="transaction-account" className="label">Account</label>
          <select id="transaction-account" aria-invalid={errorField==='transaction-account'} aria-describedby={errorField==='transaction-account'?'transaction-error':undefined} className="select" value={accountId} onChange={e=>setAccountId(e.target.value)}>
            {activeAccounts.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {kind==='transfer' && (
          <div className="field"><label htmlFor="transaction-to-account" className="label">To account</label>
            <select id="transaction-to-account" aria-invalid={errorField==='transaction-to-account'} aria-describedby={errorField==='transaction-to-account'?'transaction-error':undefined} className="select" value={toAccountId} onChange={e=>setToAccountId(e.target.value)}>
              <option value="">Select</option>
              {activeAccounts.filter(a=>a.id!==accountId).map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {kind!=='transfer' && (
        <div className="field">
          <label htmlFor="transaction-category" className="label">Category</label>
          {showNewCat ? (
            <div className="input-row" style={{display:'flex', gap:'8px'}}>
              <input id="new-category-name" className="input" placeholder="Category name" value={newCatName} onChange={e=>{ setNewCatName(e.target.value); setNewCatNameError(null); }} aria-invalid={!!newCatNameError} aria-describedby={newCatNameError ? 'new-cat-error' : undefined} />
              {newCatNameError && <div id="new-cat-error" className="field-error">{newCatNameError}</div>}
              <button type="button" className="btn btn-secondary" onClick={()=>{
                const name = newCatName.trim();
                if (!name) { setNewCatNameError('Name is required'); return; }
                const kindForCat = kind === 'income' ? 'income' : 'expense';
                const newId = controller.createCategory({ name, kind: kindForCat });
                setCategoryId(newId);
                setShowNewCat(false);
                setNewCatName('');
                setNewCatNameError(null);
              }}>Create</button>
              <button type="button" className="btn btn-secondary" onClick={()=>{ setShowNewCat(false); setNewCatName(''); setNewCatNameError(null); }}>Cancel</button>
            </div>
          ) : (
            <div className="input-row" style={{display:'flex', gap:'8px'}}>
              <select id="transaction-category" aria-invalid={errorField==='transaction-category'} aria-describedby={errorField==='transaction-category'?'transaction-error':undefined} className="select" value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
                <option value="">Select</option>
                {cats.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!editingTxnId && (
                <button type="button" className="btn btn-secondary" onClick={()=>setShowNewCat(true)}>New</button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="field"><label htmlFor="transaction-note" className="label">Note</label><input id="transaction-note" className="input" value={note} onChange={e=>setNote(e.target.value)} /></div>
      {savedCount > 0 && <p role="status">Transaction recorded. Next entry date: {date}.</p>}
      {error && <div id="transaction-error" role="alert" className="field-error">{error}</div>}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {!editingTxnId && <button className="btn btn-secondary" type="submit" value="another">Save and add another</button>}
        <button className="btn btn-primary" type="submit">{editingTxnId ? 'Save' : 'Create'}</button>
      </div>
    </form>
  );
}

