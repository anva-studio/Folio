import {useProduct} from '../../application/productNavigation';
import {useEffect,useMemo,useState} from 'react';
import {useSession} from '../../application/FolioProvider';
import {analyzePlanningHealth,summarizePlanningChecks,type CheckState} from '../../domain/planningHealth';
import type {evaluateHealthComponents} from '../../domain/health';
import {analyzeHistory} from '../../domain/historyInsights';
import {todayKey} from '../../domain/dates';
import {usePresentation} from '../usePresentation';
import {navigate} from '../navigation';

export function PlanningHealth({components,monthlyIncome}:{components:ReturnType<typeof evaluateHealthComponents>;monthlyIncome:number|null}){
  const product=useProduct();
  const {controller,controllerRevision}=useSession(),{money,parseAmount,inputAmount}=usePresentation();
  const snapshot=useMemo(()=>controller?.snapshot,[controller,controllerRevision]);
  const asOf=todayKey();
  const context=useMemo(()=>{try{return snapshot?{value:analyzePlanningHealth(snapshot,asOf),error:''}:undefined;}catch{return {value:undefined,error:'Planning checks could not be calculated safely. Review the underlying plans; no records were changed.'};}},[snapshot,asOf]);
  const [amount,setAmount]=useState(''),[confirmed,setConfirmed]=useState(false),[inventoryConfirmed,setInventoryConfirmed]=useState(false),[showSummary,setShowSummary]=useState(false);
  const [history,setHistory]=useState<Awaited<ReturnType<typeof analyzeHistory>>>(),[historyError,setHistoryError]=useState(false);
  useEffect(()=>{setConfirmed(false);setInventoryConfirmed(false);},[components,controllerRevision,asOf]);
  useEffect(()=>{let current=true;setHistory(undefined);setHistoryError(false);if(snapshot)void analyzeHistory(snapshot,asOf.slice(0,7)).then(value=>{if(current)setHistory(value);}).catch(()=>{if(current)setHistoryError(true);});return ()=>{current=false;};},[snapshot,asOf]);
  if(!controller||!snapshot||!context)return null;
  if(!context.value)return <section className="card"><h2>Planning context</h2><p role="alert">{context.error}</p></section>;
  const value=context.value;
  let available:number|undefined,error='';
  if(amount.trim())try{available=parseAmount(amount);if(available<0)throw Error('Use zero or a positive planning amount.');}catch(e){available=undefined;error=e instanceof Error?e.message:'Invalid planning amount';}
  const fit=available===undefined||value.unknownGoals.length>0?null:value.knownGoalDemand<=available;
  const recent=history?.periods.slice(-2),reviewedRecent=recent?.filter(p=>p.state==='reviewed').length??0;
  const state=(result:boolean|null|undefined):CheckState=>result==null?'unknown':result?'met':'attention';
  const states:CheckState[]=[
    state(components.emergencyFund&&components.emergencyFund.monthsCovered!==null&&components.emergencyFund.targetMonths>0?components.emergencyFund.meetsTarget:null),
    state(components.savings?.meetsTarget),
    state(inventoryConfirmed&&!value.unrepresentedLiabilities.length&&components.debtToIncome?.ratio!==null?components.debtToIncome?.meetsTarget:null),
    state(inventoryConfirmed?fit:null),
    state(inventoryConfirmed?value.nonAmortizing.length===0:null),
    state(value.unsupportedAssignments.length===0),
  ];
  if((snapshot.financial?.targets??[]).some(t=>t.from<=asOf&&t.to>=asOf))states.push(state(value.exceededTargets.length===0));
  const summary=summarizePlanningChecks(states,confirmed&&inventoryConfirmed,reviewedRecent===2);
  return <section className="card planning-health"><h2 className="card-title">Planning context</h2>
    <p>Bring your checks together without treating account balances, planned contributions or missing records as verified savings.</p>
    <div className="field"><label className="label" htmlFor="health-planning-amount">Monthly amount available for all goals</label><input className="input" id="health-planning-amount" inputMode="decimal" value={amount} aria-invalid={!!error} aria-describedby="health-planning-scope" onChange={e=>{setAmount(e.target.value);setConfirmed(false);}}/><p id="health-planning-scope" className="field-help">Enter what remains after ordinary spending, required debt payments and other provisions. Do not deduct these again from the goal demand. This working amount is temporary; nothing is assigned or moved.</p>{error&&<p role="alert">{error}</p>}</div>
    {snapshot.financial?.assumptions?.some(a=>a.key==='monthlySurplus')&&<button type="button" className="btn btn-secondary" onClick={()=>{const saved=snapshot.financial?.assumptions?.find(a=>a.key==='monthlySurplus');if(saved){setAmount(inputAmount(saved.value));setConfirmed(false);}}}>Use saved monthly planning amount</button>}
    <dl className="metric-list"><div><dt>Known active-goal demand per month</dt><dd className="amount">{money(value.knownGoalDemand)}</dd></div><div><dt>Combined goal fit</dt><dd>{fit===null?'Cannot assess yet':fit?'Fits the entered amount':'Exceeds the entered amount'}</dd></div><div><dt>Planned active-debt payments per month</dt><dd className="amount">{money(value.monthlyDebtPlans)}</dd></div><div><dt>Planned payments / entered monthly income</dt><dd>{monthlyIncome!==null&&monthlyIncome>0?(value.monthlyDebtPlans/monthlyIncome*100).toFixed(1)+'%':'Cannot calculate'}</dd></div></dl>
    <p className="field-help">Goal demand adds each active goal’s required monthly contribution under its own method and funding source. Complete goals contribute zero. Debt payments are plan assumptions, not verified lender obligations or actual payments. The payment ratio has no universal pass/fail threshold.</p>
    {value.unknownGoals.length>0&&<p>Demand cannot be calculated for: {value.unknownGoals.map(g=>g.name).join(', ')}. The displayed known amount is a lower bound, so no overall fit is claimed.</p>}
    {value.nonAmortizing.length>0&&<p>Review repayment assumptions for {value.nonAmortizing.map(d=>d.name).join(', ')}: planned payments do not reduce principal under the recorded rate. Actual lender calculations may differ.</p>}
    {value.unrepresentedLiabilities.length>0&&<p>Debt coverage is incomplete: {value.unrepresentedLiabilities.map(a=>a.name).join(', ')} have recorded liabilities without an active linked Debt plan. The Debt-plan total above does not include them.</p>}
    {value.unsupportedAssignments.length>0&&<p>Review earmarked funds in {value.unsupportedAssignments.map(s=>s.account.name).join(', ')}. Some assignments are not backed by an active, eligible account balance. They are not counted as funded goal progress.</p>}
    {value.exceededTargets.map(t=><p key={t.id}>{snapshot.categories.find(c=>c.id===t.categoryId)?.name??'Category'} is {money(t.over)} above its chosen spending target. Check refunds, unusual spending and whether the target still suits your needs.</p>)}
    <div className="action-row"><button type="button" className="btn btn-secondary" onClick={()=>navigate('goals')}>Review goal plans</button><button type="button" className="btn btn-secondary" onClick={()=>navigate('debts')}>Review debt plans</button></div>
    <details className="notebook-section"><summary>Data confidence and optional summary</summary><p><strong>{reviewedRecent} of 2 recent completed months reviewed and unchanged.</strong> {historyError?'History review status could not be checked.':!history?'Checking review status…':product.example?'Seeded reviews are part of the fictional example; they do not describe your finances.':'A self-review is your confirmation, not independent verification. Record count, wealth and a zero balance do not establish completeness.'}</p><button type="button" className="link-btn" onClick={()=>navigate('reports')}>Review completed months in Reports</button>
      <label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I reviewed these working figures and the monthly goal amount represents money remaining after spending, debt payments and provisions.</span></label>
      <label className="checkbox-label"><input type="checkbox" checked={inventoryConfirmed} onChange={e=>setInventoryConfirmed(e.target.checked)}/><span>I reviewed the active Debt and Goal plans, including any missing commitments. Empty lists mean none only because I confirm that here.</span></label>
      <label className="checkbox-label"><input type="checkbox" checked={showSummary} onChange={e=>setShowSummary(e.target.checked)}/><span>Show an overall planning summary</span></label>
      {showSummary&&<div role="status"><h3>{summary.result==='insufficient-information'?'More information needed':summary.result==='review-suggested'?'Review suggested':'No flags in the chosen checks'}</h3><p>{summary.assessed} of {summary.total} components assessable. {summary.result==='insufficient-information'?'Complete missing inputs, confirm the scope above and review both recent completed months. A missing result is not a healthy result.':'This describes these inputs and chosen targets only. It does not establish that your finances are healthy or predict future outcomes.'}</p></div>}
      <p className="field-help">Confirmations are temporary and reset when the assessed inputs or financial records change. Saved assumptions are never automatically reconfirmed.</p>
    </details>
    <details><summary>Calculation rules and limits</summary><p>Method {value.method}. No numerical score, weights, credit rating or wealth ranking is used. The optional summary checks emergency coverage against your target, input-based surplus rate against your target, recorded Debt balances against your annual-income target, combined goal demand against your entered amount, whether active debt plans reduce principal, and whether assignments are backed. Active spending targets add a check when present. Any unknown component or missing confirmation/recent review prevents a positive summary; otherwise any flagged component suggests review. There is no compensation between components.</p><p>Schedules, allocations and debt payments can overlap; they are not added to your entered expense figure. Known record omissions remain visible. Folio cannot establish unrecorded debts, savings, expenses or the suitability of financial products. The current partial month is excluded from history confidence. Future-dated records can still affect recorded balances and plans. Changes to this method will use a new method version.</p></details>
  </section>;
}
