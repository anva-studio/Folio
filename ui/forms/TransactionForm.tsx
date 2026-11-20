import {usePresentation} from '../usePresentation';
import { navigate } from '../navigation';
import { lastAccounts } from '../sessionPreferences';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';

import { todayKey } from '../../domain/dates.js';
import type {Txn} from '../../domain/types';

export function TransactionForm({
  onClose,
  editingTxnId,
  initial,
  scheduledOccurrence,
}: {
  onClose: () => void;
  editingTxnId?: string;
  scheduledOccurrence?: {scheduleId:string;date:string};
  initial?: {
    type?: Txn['type'];
    splits?: Txn['splits'];
    refundOf?: string;
    date?: string;
    amount?: number;
    accountId?: string;
    toAccountId?: string;
    categoryId?: string;
    note?: string;
  };
}) {
  const {currency,parseAmount,inputAmount}=usePresentation();
  const { controller, controllerRevision } = useSession();
  const snapshot = useMemo(()=>controller?.snapshot,[controller,controllerRevision]);
  if (!controller) return null;
  const snap = snapshot!;
  const activeAccounts = useMemo(()=>snap.accounts.filter(a=>!a.archived), [snap.accounts]);
  const defaultDate = todayKey();
  const formRef = useRef<HTMLFormElement>(null);
  const [savedCount, setSavedCount] = useState(0);
  const submitting = useRef(false);
  useLayoutEffect(() => { if (savedCount) { formRef.current?.dispatchEvent(new Event('folio:formSaved', {bubbles:true})); formRef.current?.querySelector<HTMLInputElement>('#transaction-amount')?.focus(); } }, [savedCount]);
  const [kind, setKind] = useState<Txn['type']>(initial?.type ?? 'expense');
  const [refundOf,setRefundOf]=useState(initial?.refundOf??'');
  const [splitEnabled,setSplitEnabled]=useState(!!initial?.splits);
  const [splitRows,setSplitRows]=useState(initial?.splits?.map(s=>({categoryId:s.categoryId,amount:inputAmount(s.amount)}))??[{categoryId:'',amount:''},{categoryId:'',amount:''}]);
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [amount, setAmount] = useState(initial?.amount===undefined?'':inputAmount(initial.amount));
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
  const cats = kind==='income'?incomeCats:kind==='expense'||kind==='refund'?expenseCats:[];
  const grouped=editingTxnId?snap.txns.find(t=>t.id===editingTxnId)?.debtPaymentId:undefined;
  if(grouped)return <section><p>This transaction belongs to a debt payment group. Correct all of its parts together in Debt payment history.</p><div className="action-row"><button className="btn btn-primary" onClick={()=>{onClose();navigate('debts');}}>Open Debt payment history</button><button className="btn btn-secondary" onClick={onClose}>Close record</button></div></section>;

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
        if (!categoryId&&!(kind==='expense'&&splitEnabled)) throw new Error('Please select a category');
      }
      field='transaction-amount';
      const minor = parseAmount(amount);
      if (!Number.isFinite(minor)) throw new Error('Amount must be a valid number');
      if (minor <= 0) throw new Error('Amount must be greater than zero');
      field='transaction-date';
      const payload = {
        type: kind,
        date,
        amount: minor,
        accountId,
        toAccountId: kind==='transfer'?toAccountId:undefined,
        categoryId: kind==='transfer'||(kind==='expense'&&splitEnabled)?undefined:categoryId,
        splits:kind==='expense'&&splitEnabled?splitRows.map(row=>({categoryId:row.categoryId,amount:parseAmount(row.amount)})):undefined,
        refundOf:kind==='refund'?refundOf:undefined,
        note: note||undefined,
        scheduledOccurrence,
      };
      if (editingTxnId) {
        controller.editTransaction(editingTxnId, payload);
      } else {
        controller.createTransaction(payload);
      }
      lastAccounts.set(controller, accountId);
      if (another && !editingTxnId) { setAmount(''); setCategoryId(''); setNote(''); setToAccountId('');setRefundOf('');setSplitEnabled(false);setSplitRows([{categoryId:'',amount:''},{categoryId:'',amount:''}]); setSavedCount(n=>n+1); }
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
          {(['income','expense','transfer','refund'] as const).map(k=>(
            <button type="button" key={k} className={kind===k?'active':''} onClick={()=>setKind(k)} disabled={!!editingTxnId} aria-pressed={kind===k}>{k}</button>
          ))}
        </div>
      </fieldset>
      <div className="form-row">
        <div className="field"><label htmlFor="transaction-date" className="label">Date</label><input id="transaction-date" aria-invalid={errorField==='transaction-date'} aria-describedby={errorField==='transaction-date'?'transaction-error':undefined} type="date" className="input" value={date} onChange={e=>setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="transaction-amount" className="label">Amount</label><div className="input-money"><span className="currency-prefix">{currency.symbol}</span><input inputMode="decimal" data-initial-focus={!editingTxnId || undefined} aria-invalid={errorField==='transaction-amount'} aria-describedby={errorField==='transaction-amount' ? "transaction-error" : undefined} id="transaction-amount" value={amount} onChange={e=>setAmount(e.target.value)} /></div></div>
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
      {kind==='refund'&&<div className="field"><label className="label" htmlFor="refund-source">Original purchase</label><select id="refund-source" className="select" value={refundOf} onChange={e=>{setRefundOf(e.target.value);const source=snap.txns.find(t=>t.id===e.target.value);if(source)setCategoryId(source.categoryId??source.splits?.[0]?.categoryId??'');}}><option value="">Select purchase</option>{snap.txns.filter(t=>t.type==='expense'&&!t.archived).map(t=><option key={t.id} value={t.id}>{t.date} · {inputAmount(t.amount)} · {t.note??snap.categories.find(c=>c.id===t.categoryId)?.name??'Split purchase'}</option>)}</select><p className="field-help">A refund reduces recorded spending in its own period; it is not earned income.</p></div>}
      {kind==='expense'&&<div className="field"><label className="checkbox-label"><input type="checkbox" checked={splitEnabled} onChange={e=>setSplitEnabled(e.target.checked)}/><span>Split across categories</span></label></div>}
      {kind==='expense'&&splitEnabled&&<fieldset><legend>Category split</legend>{splitRows.map((row,i)=><div className="form-row" key={i}><div className="field"><label className="label" htmlFor={'split-category-'+i}>Category {i+1}</label><select className="select" id={'split-category-'+i} value={row.categoryId} onChange={e=>setSplitRows(rows=>rows.map((r,j)=>j===i?{...r,categoryId:e.target.value}:r))}><option value="">Select</option>{expenseCats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label className="label" htmlFor={'split-amount-'+i}>Split amount {i+1}</label><input className="input" inputMode="decimal" id={'split-amount-'+i} value={row.amount} onChange={e=>setSplitRows(rows=>rows.map((r,j)=>j===i?{...r,amount:e.target.value}:r))}/></div>{splitRows.length>2&&<button type="button" className="btn btn-secondary" onClick={()=>setSplitRows(rows=>rows.filter((_,j)=>j!==i))}>Remove split {i+1}</button>}</div>)}<button type="button" className="btn btn-secondary" disabled={splitRows.length>=100} onClick={()=>setSplitRows(rows=>[...rows,{categoryId:'',amount:''}])}>Add split</button><p className="field-help">Split amounts must equal the total above. Only one account movement is recorded.</p></fieldset>}
      {kind!=='transfer' && !(kind==='expense'&&splitEnabled) && (
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
      {(splitEnabled||kind==='refund'||scheduledOccurrence)&&<p className="field-help">Uses Folio profile format 2. Backups remain encrypted; older Folio versions cannot open this profile after saving.</p>}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {!editingTxnId && !scheduledOccurrence && <button className="btn btn-secondary" type="submit" value="another">Save and add another</button>}
        <button className="btn btn-primary" type="submit">{editingTxnId ? 'Save' : 'Create'}</button>
      </div>
    </form>
  );
}

