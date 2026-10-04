import { combinedGoalDemand, goalMethod, monthLabel } from '../presentation';
import { EntryDialog as Modal } from '../components/EntryDialog';
import { ConfirmDelete } from '../components/ConfirmDelete';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { formatMinor, INR, parseAmountToMinor } from '../../domain/money.js';
import { todayKey } from '../../domain/dates.js';
import type { Goal } from '../../domain/types.js';


export function GoalsScreen() {
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const { controller, controllerRevision } = useSession();
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState({ name:'', targetAmount:'', method:'fixed' as Goal['method'], monthlyContribution:'', targetDate:'', annualRatePct:'', linkedAccountId:'', manualSaved:'', active:true });
  const [errorField,setErrorField]=useState('');
  const [error, setError] = useState<string|null>(null);
  const [availableMonthlySurplusStr, setAvailableMonthlySurplusStr] = useState<string>('');
  const [surplusError, setSurplusError] = useState<string|null>(null);
  void controllerRevision;
  if (!controller) return null;
  const snap = controller.snapshot;
  const accounts = snap.accounts.filter(a=>!a.archived);
  const allAccounts = snap.accounts;
  const goals = snap.goals;
  useMemo(()=>{
    // compute balances via controller, retained for future use
    const res = controller.getAccountBalances();
    // no-op
    return res.balances;
  }, [controller, controllerRevision]);
  const fmt = (n:number)=>formatMinor(n, {symbol: INR.symbol, minorDigits: INR.minorDigits, indianGrouping: INR.indianGrouping});
  const asOf = todayKey();
  const demand = combinedGoalDemand(snap, controller.getAccountBalances(false).balances, asOf);
  // simple surplus: committed net? We'll compute actual net for current month
  const monthKey = controller.getCurrentMonthKey();
  const cash = controller.getMonthlyCashFlow(monthKey);
  const actualSurplus = cash.actual.net;

  const availableMonthlySurplusMinor = useMemo(()=>{
    if(!availableMonthlySurplusStr) return null;
    try{
      const minor = parseAmountToMinor(availableMonthlySurplusStr, {minorDigits: INR.minorDigits, symbol: INR.symbol});
      return minor;
    }catch(e:any){
      return null;
    }
  }, [availableMonthlySurplusStr]);

  // Side effect for surplus validation error (outside useMemo)
  useEffect(()=>{
    if(!availableMonthlySurplusStr) {
      setSurplusError(null);
      return;
    }
    try{
      parseAmountToMinor(availableMonthlySurplusStr, {minorDigits: INR.minorDigits, symbol: INR.symbol});
      setSurplusError(null);
    }catch(e:any){
      setSurplusError(e.message);
    }
  }, [availableMonthlySurplusStr]);

  const reset = ()=>{ setError(null);setErrorField('');setForm({ name:'', targetAmount:'', method:'fixed', monthlyContribution:'', targetDate:'', annualRatePct:'', linkedAccountId:'', manualSaved:'', active:true }); setEditingId(null); };

  const openEdit = (g:Goal)=>{
    setError(null);setErrorField('');
    setEditingId(g.id);
    setForm({
      name:g.name,
      targetAmount: String(g.targetAmount/100),
      method:g.method,
      monthlyContribution: String(g.monthlyContribution/100),
      targetDate:g.targetDate ?? '',
      annualRatePct:g.annualRatePct?.toString() ?? '',
      linkedAccountId:g.linkedAccountId ?? '',
      manualSaved: g.manualSaved ? String(g.manualSaved/100) : '',
      active:g.active
    });
    setShow(true);
  };

  const handleSave = ()=>{
    setError(null);
    let field='goal-name';
    try {
      const name = form.name.trim();
      if(!name) throw new Error('Name required');
      field='goal-targetAmount';
      const targetAmount = parseAmountToMinor(form.targetAmount, {minorDigits: INR.minorDigits, symbol: INR.symbol});
      field='goal-monthlyContribution';
      const monthlyContribution = parseAmountToMinor(form.monthlyContribution, {minorDigits: INR.minorDigits, symbol: INR.symbol});
      if(targetAmount<=0) {field='goal-targetAmount';throw new Error('Target amount must be greater than zero');};
      if(monthlyContribution<0) throw new Error('Monthly contribution must be zero or greater');
      const payload: any = { name, targetAmount, method:form.method, monthlyContribution, active:form.active };
      if(form.method==='fixed') {
        if(monthlyContribution<=0) throw new Error('Enter a positive monthly contribution for this plan');
        delete payload.targetDate;
        delete payload.annualRatePct;
      } else if(form.method==='target-date') {
        field='goal-targetDate';
        if(!form.targetDate) throw new Error('Target date required');
        payload.targetDate = form.targetDate;
        if(form.annualRatePct) payload.annualRatePct = Number(form.annualRatePct);
      } else if(form.method==='growth') {
        field='goal-annualRatePct-growth';
        if(!form.annualRatePct) throw new Error('Annual rate required for growth');
        payload.annualRatePct = Number(form.annualRatePct);
        delete payload.targetDate;
      }
      field='goal-linkedAccountId';
      const linkedId = form.linkedAccountId;
      const manualStr = form.manualSaved;
      if (linkedId !== '' && manualStr !== '') {
        throw new Error('Choose either a linked account or a manually entered saved amount.');
      }
      if (linkedId) {
        const acc = allAccounts.find(a=>a.id===linkedId);
        if(!acc) throw new Error('Linked account not found');
        if(!editingId && acc.archived) throw new Error('Cannot link to archived account for new goal');
      }
      if (editingId) {
        // Explicit source clearing contract: include both properties on edit
        // Distinguish absent vs explicit undefined
        // Ensure we always send both fields so editGoal can distinguish absent vs explicit clear
        payload.linkedAccountId = linkedId || undefined;
        if (manualStr) {
          field='goal-manualSaved';
          const manual = parseAmountToMinor(manualStr, {minorDigits: INR.minorDigits, symbol: INR.symbol});
          payload.manualSaved = manual;
        } else {
          payload.manualSaved = undefined;
        }
      } else {
        // Create: omit empty values to avoid validation errors
        if (linkedId) {
          payload.linkedAccountId = linkedId;
        }
        if (manualStr) {
          const manual = parseAmountToMinor(manualStr, {minorDigits: INR.minorDigits, symbol: INR.symbol});
          payload.manualSaved = manual;
        }
      }
      if(editingId) { controller.editGoal(editingId, payload); }
      else { controller.createGoal(payload); }
      setShow(false); reset(); setEditingId(null);
    } catch(e:any){ setError(e.message);setErrorField(field);document.getElementById(field)?.focus(); }
  };

  return (
    <div>
      <div className="screen-header"><div><h1 className="screen-title">Goals</h1>
        <div className="screen-sub"><label htmlFor="availableMonthlySurplus">Your entered available monthly amount for goals</label> 
          <div className="field-inline" style={{display:'inline-flex', gap:'8px', alignItems:'center'}}>
            <div className="input-money" style={{display:'inline-flex'}}>
              <span className="currency-prefix">{INR.symbol}</span>
              <input inputMode="decimal" className="input" aria-invalid={surplusError?true:false} aria-describedby={surplusError?'surplus-error':undefined} id="availableMonthlySurplus" name="availableMonthlySurplus" value={availableMonthlySurplusStr} onChange={e=>setAvailableMonthlySurplusStr(e.target.value)} placeholder="Not supplied" />
            </div>
            <button className="btn btn-secondary btn-small" type="button" onClick={()=>{ setAvailableMonthlySurplusStr(String(actualSurplus/100)); }}>Use this month's recorded surplus</button>
          </div>
          {surplusError && <div id="surplus-error" className="field-error">{surplusError}</div>}
        </div></div>
      <div className="screen-actions"><button className="btn btn-primary" onClick={()=>{reset(); setEditingId(null); setShow(true);}}>Add goal</button></div></div>
      <p className="scope-note">Your available amount is a temporary input for this screen. Helpers use recorded month-to-date income less expenses; this may not represent a typical month. Planned contributions do not become saved money automatically.</p>
      <section className="plan-summary" aria-label="Combined goal contributions"><h2>All active goals together</h2><dl className="metric-list"><div><dt>{demand.unavailable.length ? 'Calculable monthly demand' : 'Monthly demand'}</dt><dd>{fmt(demand.total)}</dd></div><div><dt>Your entered available amount</dt><dd>{availableMonthlySurplusMinor === null ? 'Not supplied' : fmt(availableMonthlySurplusMinor)}</dd></div></dl>{demand.unavailable.length > 0 ? <p role="status">Cannot calculate contributions for {demand.unavailable.join(', ')}. The total is incomplete; no overall fit judgment is available.</p> : availableMonthlySurplusMinor === null ? <p>Enter an amount to compare these plans.</p> : <p>{demand.total > availableMonthlySurplusMinor ? 'Plans exceed your entered amount by ' + fmt(demand.total - availableMonthlySurplusMinor) + ' per month.' : 'Plans fit within your entered amount. This does not verify your overall finances.'}</p>}</section>
      <div className="card">
        {goals.length===0 ? <div className="empty-state"><h3>No goals yet.</h3><p>Create a goal when there’s something you want to plan toward.</p></div> :
        <div className="goal-grid">{goals.map(g=>{
          const proj=controller.projectGoal(g.id,asOf,availableMonthlySurplusMinor ?? 0);
          const progress=Math.max(0,Math.min(100,Math.round(proj.savedSoFar/g.targetAmount*100)));
          return <article className="goal-plan" key={g.id}>
            <div className="plan-heading"><h2>{g.name}</h2><span className="status-label">{g.active?'Active':'Inactive'}</span></div>
            <p className="muted">{goalMethod(g.method)}</p>
            <p><strong>{fmt(proj.savedSoFar)}</strong> saved towards {fmt(g.targetAmount)}</p>
            <progress value={progress} max={100} aria-label={g.name+' progress'}>{progress}%</progress>
            <dl className="metric-list"><div><dt>Remaining</dt><dd>{fmt(proj.remaining)}</dd></div><div><dt>Monthly contribution needed</dt><dd>{proj.requiredMonthlyContribution === null ? 'Cannot calculate' : fmt(proj.requiredMonthlyContribution)}</dd></div><div><dt>{g.method==='fixed'?'Contributions remaining':'Months remaining'}</dt><dd>{proj.monthsToTarget ?? 'Cannot calculate'}</dd></div><div><dt>Estimated completion</dt><dd>{proj.projectedTargetMonth ? monthLabel(proj.projectedTargetMonth) : 'Cannot calculate'}</dd></div></dl>
            <p className="field-help">{proj.complete ? 'Target reached using the saved amount shown.' : proj.deadlinePassed ? 'The target date has passed; revise the plan.' : 'Projection assumes the first monthly contribution occurs this month.'} {g.method!=='fixed' && 'Any entered growth rate is an assumption, not a promised return.'}</p>
            <p className="field-help">{g.linkedAccountId ? 'Saved amount uses the entire linked account balance. It is not exclusively reserved and may overlap other goals.' : g.manualSaved === undefined ? 'No saved amount supplied; the projection starts from zero.' : 'Saved amount is maintained by you.'}</p>
            <p>{availableMonthlySurplusMinor === null ? 'Available amount: not supplied.' : proj.requiredMonthlyContribution === null ? 'Cannot compare this plan with your entered amount.' : proj.feasible ? 'Contribution fits your entered amount individually.' : 'Contribution exceeds your entered amount individually.'}</p>
            <div className="action-row"><button className="btn btn-secondary" onClick={()=>openEdit(g)}>Edit</button><button className="btn btn-ghost" onClick={()=>controller.setGoalActive(g.id,!g.active)}>{g.active?'Deactivate':'Activate'}</button><button className="btn btn-ghost" onClick={()=>setDeleteTarget(g)}>Delete</button></div>
          </article>;
        })}</div>}
      </div>
      {deleteTarget && <ConfirmDelete name={deleteTarget.name} kind="goal" onCancel={()=>setDeleteTarget(null)} onConfirm={()=>{controller.deleteGoal(deleteTarget.id); setDeleteTarget(null);}} />} 
      <Modal open={show} onClose={()=>setShow(false)} title={editingId?'Edit goal':'New goal'}>
        <fieldset>
          <legend className="sr-only">Goal details</legend>
          <div className="field"><label className="label" htmlFor="goal-name">Name</label><input id="goal-name" aria-invalid={errorField==='goal-name'} aria-describedby={errorField==='goal-name'?'goal-error':undefined} name="name" className="input"   value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
          <div className="form-row">
            <div className="field"><label className="label" htmlFor="goal-targetAmount">Target amount</label><div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="goal-targetAmount" aria-invalid={errorField==='goal-targetAmount'} aria-describedby={errorField==='goal-targetAmount'?'goal-error':undefined} name="targetAmount" className="input"   value={form.targetAmount} onChange={e=>setForm(f=>({...f,targetAmount:e.target.value}))} /></div></div>
            <div className="field"><label className="label" htmlFor="goal-method">Method</label>
              <select id="goal-method" aria-invalid={errorField==='goal-method'} aria-describedby={errorField==='goal-method'?'goal-error':undefined} name="method" className="select" value={form.method} onChange={e=>{ const m=e.target.value as Goal['method']; setForm(f=>{ let nf={...f, method:m}; if(m==='fixed'){ nf.targetDate=''; nf.annualRatePct=''; } else if(m==='growth'){ nf.targetDate=''; } return nf; })}}>
                <option value="fixed">Fixed monthly contribution</option>
                <option value="target-date">Target date</option>
                <option value="growth">Assumed growth</option>
              </select>
            </div>
          </div>
          <div className="field"><label className="label" htmlFor="goal-monthlyContribution">Monthly contribution</label><div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="goal-monthlyContribution" aria-invalid={errorField==='goal-monthlyContribution'} aria-describedby={errorField==='goal-monthlyContribution'?'goal-error':undefined} name="monthlyContribution" className="input"   value={form.monthlyContribution} onChange={e=>setForm(f=>({...f,monthlyContribution:e.target.value}))} /></div></div>
          {form.method==='target-date' && (
            <div className="form-row">
              <div className="field"><label className="label" htmlFor="goal-targetDate">Target date</label><input id="goal-targetDate" aria-invalid={errorField==='goal-targetDate'} aria-describedby={errorField==='goal-targetDate'?'goal-error':undefined} name="targetDate" type="date" className="input"   value={form.targetDate} onChange={e=>setForm(f=>({...f,targetDate:e.target.value}))} /></div>
              <div className="field"><label className="label" htmlFor="goal-annualRatePct">Annual rate % (optional)</label><input inputMode="decimal" id="goal-annualRatePct" aria-invalid={errorField==='goal-annualRatePct'} aria-describedby={errorField==='goal-annualRatePct'?'goal-error':undefined} name="annualRatePct" className="input"   value={form.annualRatePct} onChange={e=>setForm(f=>({...f,annualRatePct:e.target.value}))} /></div>
            </div>
          )}
          {form.method==='growth' && (
            <div className="field"><label className="label" htmlFor="goal-annualRatePct-growth">Annual rate %</label><input inputMode="decimal" id="goal-annualRatePct-growth" aria-invalid={errorField==='goal-annualRatePct-growth'} aria-describedby={errorField==='goal-annualRatePct-growth'?'goal-error':undefined} name="annualRatePct" className="input"   value={form.annualRatePct} onChange={e=>setForm(f=>({...f,annualRatePct:e.target.value}))} /></div>
          )}
          <div className="form-row">
            <div className="field"><label className="label" htmlFor="goal-linkedAccountId">Linked account (optional)</label>
              <select id="goal-linkedAccountId" aria-invalid={errorField==='goal-linkedAccountId'} aria-describedby={errorField==='goal-linkedAccountId'?'goal-error':undefined} name="linkedAccountId" className="select" value={form.linkedAccountId} onChange={e=>setForm(f=>({...f,linkedAccountId:e.target.value, manualSaved:''}))}>
                <option value="">None</option>
                {accounts.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
                {form.linkedAccountId && !accounts.some(a=>a.id===form.linkedAccountId) && (()=>{ const acc=allAccounts.find(a=>a.id===form.linkedAccountId); return acc ? <option key={acc.id} value={acc.id}>{acc.name} (archived)</option> : null; })()}
              </select>
            </div>
            <div className="field"><label className="label" htmlFor="goal-manualSaved">Amount already saved (optional)</label><div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="goal-manualSaved" aria-invalid={errorField==='goal-manualSaved'} aria-describedby={errorField==='goal-manualSaved'?'goal-error':undefined} name="manualSaved" className="input"   value={form.manualSaved} onChange={e=>setForm(f=>({...f,manualSaved:e.target.value, linkedAccountId:''}))} /></div></div>
          </div>
          <div className="field"><label className="checkbox-label" htmlFor="goal-active"><input id="goal-active" aria-invalid={errorField==='goal-active'} aria-describedby={errorField==='goal-active'?'goal-error':undefined} name="active" type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))} /> Active</label></div>
          {error && <div id="goal-error" className="field-error" role="alert">{error}</div>}
        </fieldset>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setShow(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>Save</button></div>
      </Modal>
    </div>
  );
}

