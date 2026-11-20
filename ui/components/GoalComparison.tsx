import {SavePlanningComparison} from './SavePlanningComparison';
import type {ComparisonSnapshot} from '../../domain/savedComparisons';
import {goalSavedSoFar} from '../../domain/goal';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { usePresentation } from '../usePresentation';
import { useEntryCheckpoint } from '../hooks/useEntryCheckpoint';
import { todayKey } from '../../domain/dates';
import { compareGoalContributions } from '../../domain/goalComparison';
import { adjustedBalances, goalAllocationBalances } from '../../domain/financialRecords';

export function GoalComparison({goalId}:{goalId:string}) {
  const {controller,controllerRevision}=useSession(), {money,inputAmount,parseAmount,monthLabel}=usePresentation();
  const data=useMemo(()=>controller?.snapshot,[controller,controllerRevision]);
  const goal=data?.goals.find(g=>g.id===goalId),checkpoint=useEntryCheckpoint<HTMLFormElement>();
  const basis=useMemo(()=>goal&&data?JSON.stringify({goal,saved:goalSavedSoFar(goal,{accountBalances:adjustedBalances(data),goalAllocations:goalAllocationBalances(data)})}):'',[goal,data]);
  const [draft,setDraft]=useState<ComparisonSnapshot>();
  const [monthly,setMonthly]=useState(()=>goal&&goal.monthlyContribution>0?inputAmount(goal.monthlyContribution):''),[additional,setAdditional]=useState('0'),[error,setError]=useState(''),[result,setResult]=useState<ReturnType<typeof compareGoalContributions>>();
  useEffect(()=>{setResult(undefined);},[basis]);
  if(!goal||!controller)return null;
  return <form ref={checkpoint.ref} onSubmit={e=>{e.preventDefault();setError('');setResult(undefined);try{if(!monthly.trim()||!additional.trim())throw new Error('Supply both assumptions');const data=controller.snapshot;const source=data.goals.find(g=>g.id===goalId);if(!source)throw new Error('The source goal is no longer present.');const asOf=todayKey(),input={monthlyContribution:parseAmount(monthly),additionalNow:parseAmount(additional)},comparison=compareGoalContributions(source,asOf,{accountBalances:adjustedBalances(data),goalAllocations:goalAllocationBalances(data)},input.monthlyContribution,input.additionalNow);setResult(comparison);setDraft({version:1,kind:'goal',asOf,source,savedAmount:comparison.baseline.savedSoFar,input});checkpoint.markSaved();}catch(e){setError(e instanceof Error?e.message:'Could not compare');}}}>
    <p><strong>{goal.name}</strong> · target {money(goal.targetAmount)}. Explore a different contribution using the saved amount under this goal’s current funding source. No account, goal or allocation is changed.</p>
    <div className="field"><label className="label" htmlFor="goal-compare-monthly">Alternative monthly contribution</label><input id="goal-compare-monthly" className="input" inputMode="decimal" value={monthly} onChange={e=>{setMonthly(e.target.value);setResult(undefined);}}/></div>
    <div className="field"><label className="label" htmlFor="goal-compare-additional">Hypothetical additional amount now</label><input id="goal-compare-additional" className="input" inputMode="decimal" value={additional} onChange={e=>{setAdditional(e.target.value);setResult(undefined);}}/></div>
    <p className="field-help">The first monthly contribution is assumed this month. The additional amount is hypothetical, not proof of spare cash or a transfer. Your goal’s existing growth assumption is retained; no return is guaranteed. Working comparisons are temporary unless you explicitly save a named snapshot.</p>
    <div className="modal-footer"><button className="btn btn-primary" type="submit">Compare contributions</button></div>{error&&<p role="alert">{error}</p>}{result&&<section aria-live="polite"><h3>Contribution comparison</h3><div className="grid grid-2">{[['Existing goal',result.baseline],['Alternative contribution',result.alternative]].map(([name,p])=>{const projection=p as typeof result.baseline;return <section className="plan-summary" key={String(name)}><h4>{String(name)}</h4><dl className="metric-list"><div><dt>Starting saved amount</dt><dd className="amount">{money(projection.savedSoFar)}</dd></div><div><dt>Contributions remaining</dt><dd>{projection.monthsToTarget??'Cannot estimate'}</dd></div><div><dt>Target month</dt><dd>{projection.projectedTargetMonth?monthLabel(projection.projectedTargetMonth):'Cannot estimate'}</dd></div></dl></section>;})}</div>{goal.method==='target-date'&&<p>The existing goal column uses its chosen deadline and calculated required contribution. The alternative estimates a completion month from your entered contribution; it does not change that deadline.</p>}<p>Alternative contribution: {money(result.monthlyContribution)} per month. Additional amount now: {money(result.additionalNow)}. Assumed annual growth: {result.annualRatePct}%.</p><p className="field-help">Method {result.method}. No affordability claim is made: other goals, debt payments and liquidity needs compete for the same money. Use the combined goal demand check before adopting a contribution. Growth simulations stop after 1,200 months.</p></section>}
    {result&&draft&&<SavePlanningComparison key={JSON.stringify(draft)} snapshot={draft}/>}
  </form>;
}
