import {DebtComparison} from '../components/DebtComparison';
import {DebtPayments} from '../components/DebtPayments';
import {usePresentation} from '../usePresentation';
import { useNarrowScreen } from '../hooks/useNarrowScreen';
import { EntryDialog as Modal } from '../components/EntryDialog';
import { ConfirmDelete } from '../components/ConfirmDelete';
import { Fragment, useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';

import type { Debt } from '../../domain/types.js';


export function DebtScreen() {
  const {currency,money,parseAmount,inputAmount}=usePresentation();
  const narrow = useNarrowScreen();
  const [deleteError,setDeleteError]=useState('');
  const [deleteTarget, setDeleteTarget] = useState<Debt | null>(null);
  const { controller, controllerRevision } = useSession();
  const [comparisonDebt,setComparisonDebt]=useState<string>();
  const [paymentDebt,setPaymentDebt]=useState<string>();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState({ name:'', kind:'emi' as Debt['kind'], balance:'', annualRatePct:'', monthlyPayment:'', dueDay:'', startDate:'', active:true, note:'' });
  const [errorField,setErrorField]=useState('');
  const [error, setError] = useState<string|null>(null);
  void controllerRevision;
  if (!controller) return null;
  const debts = controller.getResolvedDebts();
  const fmt = money;
  const summary = useMemo(()=>controller.getDebtSummary(), [controller, controllerRevision]);

  const resetForm = () => {setError(null);setErrorField('');setForm({ name:'', kind:'emi', balance:'', annualRatePct:'', monthlyPayment:'', dueDay:'', startDate:'', active:true, note:'' });};

  const openEdit = (d: Debt) => {
    setErrorField('');
    setEditingId(d.id);
    setForm({
      name: d.name,
      kind: d.kind,
      balance: inputAmount(d.balance),
      annualRatePct: String(d.annualRatePct),
      monthlyPayment: inputAmount(d.monthlyPayment),
      dueDay: d.dueDay?.toString() ?? '',
      startDate: d.startDate ?? '',
      active: d.active,
      note: d.note ?? ''
    });
    setShowCreate(true);
    setError(null);
  };

  const handleSave = () => {
    setError(null);
    let field='debt-name';
    try {
      const name = form.name.trim();
      if (!name) throw new Error('Name required');
      field='debt-balance';
      const originalDebt=controller.snapshot.debts.find(d=>d.id===editingId);
      const balance = originalDebt?.linkedLiabilityAccountId?originalDebt.balance:parseAmount(form.balance);
      field='debt-payment';
      const monthlyPayment = parseAmount(form.monthlyPayment);
      field='debt-rate';
      const rateNum = Number(form.annualRatePct);
      if (isNaN(rateNum)) throw new Error('Rate required');
      if (balance <= 0) {field='debt-balance';throw new Error('Balance must be greater than zero');};
      if (monthlyPayment <= 0) {field='debt-payment';throw new Error('Monthly payment must be greater than zero');};
      const payload = {
        name,
        kind: form.kind,
        balance,
        annualRatePct: rateNum,
        monthlyPayment,
        dueDay: form.dueDay ? parseInt(form.dueDay) : undefined,
        startDate: form.startDate || undefined,
        active: form.active,
        note: form.note || undefined,
      };
      if (editingId) {
        controller.editDebt(editingId, payload);
      } else {
        controller.createDebt(payload);
      }
      setShowCreate(false);
      resetForm();
      setEditingId(null);
    } catch (e:any) { setError(e.message);setErrorField(field);document.getElementById(field)?.focus(); }
  };

  return (
    <div>
      <div className="screen-header">
        <div><h1 className="screen-title">Debt</h1><div className="screen-sub">Total balance {fmt(summary.totalBalance)} · Monthly payment {fmt(summary.totalMonthlyPayment)} · Active {summary.activeCount} · Payments not covering interest {summary.nonAmortizingCount}</div></div>
        <div className="screen-actions"><button className="btn btn-primary" onClick={()=>{resetForm(); setEditingId(null); setShowCreate(true);}}>Add debt</button></div>
      </div>
      <p className="scope-note">Manual debts are maintained by you. Explicitly linked debts use their liability account balance; grouped payments separate balance repayment from new interest and fees. Debt figures are not deducted from account totals a second time.</p>
      <div className="card">
        {debts.length===0 ? (
          <div className="empty-state"><h3>No debts yet</h3><p>Add a debt to track payoff plans.</p></div>
        ) : (
          <>{narrow ? <div>{debts.map(d=>{const p=controller.projectDebt(d.id);return <article className="mobile-record" key={d.id}><h2>{d.name}</h2><p>{d.active?'Active':'Inactive'} · {d.kind==='emi'?'Instalment loan':d.kind==='credit-card'?'Credit card':d.kind==='personal'?'Personal loan':'Other debt'}</p><dl className="metric-list"><div><dt>Entered balance</dt><dd>{fmt(d.balance)}</dd></div><div><dt>Monthly payment</dt><dd>{fmt(d.monthlyPayment)}</dd></div><div><dt>Annual rate</dt><dd>{d.annualRatePct}%</dd></div><div><dt>Estimated payoff</dt><dd>{p.amortizes&&p.monthsToPayoff!==null?`${p.monthsToPayoff} months`:'Cannot calculate'}</dd></div></dl><details><summary>Projection details</summary><p>Total interest: {p.totalInterest!==null?fmt(p.totalInterest):'Cannot calculate'}</p><p>Total paid: {p.totalPaid!==null?fmt(p.totalPaid):'Cannot calculate'}</p><p>Final payment: {p.finalPayment!==null?fmt(p.finalPayment):'Cannot calculate'}</p></details>{!p.amortizes&&<p className="warning">Payment does not cover interest. Balance will not decrease.</p>}<div className="row-actions"><button className="btn btn-secondary" onClick={()=>setPaymentDebt(d.id)}>Payments & account</button><button className="btn btn-secondary btn-small" onClick={()=>setComparisonDebt(d.id)}>Compare payoff</button><button className="btn btn-secondary" onClick={()=>openEdit(d)}>Edit</button><button className="btn btn-secondary" onClick={()=>controller.setDebtActive(d.id,!d.active)}>{d.active?'Deactivate':'Activate'}</button><button className="btn btn-danger" onClick={()=>{setDeleteTarget(d);setDeleteError('');}}>Delete</button></div></article>;})}</div> : <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Kind</th><th>Balance</th><th>Rate</th><th>Monthly payment</th><th>Amortizes</th><th>Months</th><th>Total interest</th><th>Total paid</th><th>Final payment</th><th>Active</th><th>Actions</th></tr></thead>
              <tbody>
                {debts.map(d=>{
                  const projection = controller.projectDebt(d.id);
                  const amortizes = projection.amortizes;
                  const months = amortizes && projection.monthsToPayoff !== null ? projection.monthsToPayoff : 'Cannot calculate';
                  const totalInterest = amortizes && projection.totalInterest !== null ? fmt(projection.totalInterest) : 'Cannot calculate';
                  const totalPaid = amortizes && projection.totalPaid !== null ? fmt(projection.totalPaid) : 'Cannot calculate';
                  const finalPayment = amortizes && projection.finalPayment !== null ? fmt(projection.finalPayment) : 'Cannot calculate';
                  return (
                    <Fragment key={d.id}>
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td>{d.kind}</td>
                        <td className="num">{fmt(d.balance)}</td>
                        <td className="num">{d.annualRatePct}%</td>
                        <td className="num">{fmt(d.monthlyPayment)}</td>
                        <td>{amortizes ? 'Yes' : 'No'}</td>
                        <td className="num">{months}</td>
                        <td className="num">{totalInterest}</td>
                        <td className="num">{totalPaid}</td>
                        <td className="num">{finalPayment}</td>
                        <td>{d.active ? 'Active' : 'Inactive'}</td>
                        <td>
                          <button className="btn btn-secondary btn-small" onClick={()=>setPaymentDebt(d.id)}>Payments & account</button><button className="btn btn-secondary btn-small" onClick={()=>setComparisonDebt(d.id)}>Compare payoff</button><button className="btn btn-secondary btn-small" onClick={()=>openEdit(d)}>Edit</button>
                          <button className="btn btn-secondary btn-small" onClick={()=>controller.setDebtActive(d.id, !d.active)}>{d.active ? 'Deactivate' : 'Activate'}</button>
                          <button className="btn btn-danger btn-small" onClick={()=>{setDeleteTarget(d);setDeleteError('');}}>Delete</button>
                        </td>
                      </tr>
                      {!amortizes && (
                        <tr key={`${d.id}-warning`}>
                          <td colSpan={12} className="warning" role="alert" aria-live="polite">Payment does not cover interest. Balance will not decrease.</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>}</>
        )}
      </div>
      {deleteTarget && <ConfirmDelete error={deleteError} name={deleteTarget.name} kind="debt" onCancel={()=>setDeleteTarget(null)} onConfirm={()=>{try{controller.deleteDebt(deleteTarget.id);setDeleteTarget(null);}catch(e){setDeleteError(e instanceof Error?e.message:'Could not delete debt');}}} />} 
      <Modal open={!!comparisonDebt} title="Compare debt payoff" onClose={()=>setComparisonDebt(undefined)}>{comparisonDebt&&<DebtComparison debtId={comparisonDebt}/>}</Modal><Modal open={!!paymentDebt} title="Debt payments & account" onClose={()=>setPaymentDebt(undefined)}>{paymentDebt&&<DebtPayments debtId={paymentDebt}/>}</Modal><Modal open={showCreate} onClose={()=>setShowCreate(false)} title={editingId?'Edit debt':'New debt'}>
        <fieldset>
          <legend className="sr-only">{editingId?'Edit debt':'New debt'}</legend>
          <div className="field"><label className="label" htmlFor="debt-name">Name</label><input id="debt-name" aria-invalid={errorField==='debt-name'} aria-describedby={errorField==='debt-name'?'debt-error':undefined} className="input" aria-required="true" value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} /></div>
          <div className="field"><label className="label" htmlFor="debt-kind">Kind</label>
            <select id="debt-kind" aria-invalid={errorField==='debt-kind'} aria-describedby={errorField==='debt-kind'?'debt-error':undefined} className="select" value={form.kind} onChange={e=>setForm(f=>({...f, kind:e.target.value as Debt['kind']}))}>
              {['emi','credit-card','personal','other'].map(k=> <option key={k} value={k}>{k==='emi'?'Instalment loan':k==='credit-card'?'Credit card':k==='personal'?'Personal loan':'Other debt'}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="field"><label className="label" htmlFor="debt-balance">Balance</label><div className="input-money"><span className="currency-prefix">{currency.symbol}</span><input inputMode="decimal" readOnly={!!controller.snapshot.debts.find(d=>d.id===editingId)?.linkedLiabilityAccountId} id="debt-balance" aria-invalid={errorField==='debt-balance'} aria-describedby={errorField==='debt-balance'?'debt-error':undefined} className="input"  value={form.balance} onChange={e=>setForm(f=>({...f, balance:e.target.value}))} /></div></div>
            <div className="field"><label className="label" htmlFor="debt-rate">Annual rate %</label><input inputMode="decimal" id="debt-rate" aria-invalid={errorField==='debt-rate'} aria-describedby={errorField==='debt-rate'?'debt-error':undefined} className="input"  value={form.annualRatePct} onChange={e=>setForm(f=>({...f, annualRatePct:e.target.value}))} /></div>
            <div className="field"><label className="label" htmlFor="debt-payment">Monthly payment</label><div className="input-money"><span className="currency-prefix">{currency.symbol}</span><input inputMode="decimal" id="debt-payment" aria-invalid={errorField==='debt-payment'} aria-describedby={errorField==='debt-payment'?'debt-error':undefined} className="input"  value={form.monthlyPayment} onChange={e=>setForm(f=>({...f, monthlyPayment:e.target.value}))} /></div></div>
          </div>
          <div className="form-row">
            <div className="field"><label className="label" htmlFor="debt-due">Due day</label><input inputMode="numeric" id="debt-due" aria-invalid={errorField==='debt-due'} aria-describedby={errorField==='debt-due'?'debt-error':undefined} className="input" value={form.dueDay} onChange={e=>setForm(f=>({...f, dueDay:e.target.value}))} /></div>
            <div className="field"><label className="label" htmlFor="debt-start">Start date</label><input id="debt-start" aria-invalid={errorField==='debt-start'} aria-describedby={errorField==='debt-start'?'debt-error':undefined} type="date" className="input" value={form.startDate} onChange={e=>setForm(f=>({...f, startDate:e.target.value}))} /></div>
          </div>
          <div className="field"><label className="label" htmlFor="debt-note">Note</label><input id="debt-note" aria-invalid={errorField==='debt-note'} aria-describedby={errorField==='debt-note'?'debt-error':undefined} className="input" value={form.note} onChange={e=>setForm(f=>({...f, note:e.target.value}))} /></div>
          <div className="field"><label className="checkbox-label" htmlFor="debt-active"><input id="debt-active" aria-invalid={errorField==='debt-active'} aria-describedby={errorField==='debt-active'?'debt-error':undefined} type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f, active:e.target.checked}))} /> Active</label></div>
          {error && <div id="debt-error" className="field-error" role="alert" aria-live="polite">{error}</div>}
          <div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setShowCreate(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
        </fieldset>
      </Modal>
    </div>
  );
}

