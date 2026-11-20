import {SavePlanningComparison} from './SavePlanningComparison';
import type {ComparisonSnapshot} from '../../domain/savedComparisons';
import {todayKey} from '../../domain/dates';
import { useEffect, useMemo, useState } from 'react';
import { useEntryCheckpoint } from '../hooks/useEntryCheckpoint';
import { useSession } from '../../application/FolioProvider';
import { compareDebtPayoff } from '../../domain/debtComparison';
import { usePresentation } from '../usePresentation';

export function DebtComparison({debtId}:{debtId:string}) {
  const checkpoint=useEntryCheckpoint<HTMLFormElement>();
  const {controller,controllerRevision}=useSession(), {money,inputAmount,parseAmount}=usePresentation();
  const debt=useMemo(()=>controller?.getResolvedDebts().find(d=>d.id===debtId),[controller,controllerRevision,debtId]);
  const [monthly,setMonthly]=useState(()=>debt?inputAmount(debt.monthlyPayment):''),[oneTime,setOneTime]=useState('0'),[rate,setRate]=useState(()=>String(debt?.annualRatePct??'')),[error,setError]=useState('');
  const [result,setResult]=useState<ReturnType<typeof compareDebtPayoff>>();
  const [draft,setDraft]=useState<ComparisonSnapshot>();
  useEffect(()=>{setResult(undefined);},[JSON.stringify(debt)]);
  if(!debt)return null;
  const changed=()=>{setResult(undefined);setError('');};
  return <form ref={checkpoint.ref} onSubmit={e=>{e.preventDefault();setResult(undefined);setError('');try{if(!monthly.trim()||!oneTime.trim()||!rate.trim())throw new Error('Supply all assumptions');if(!/^\d+(\.\d+)?$/.test(rate))throw new Error('Enter an annual percentage using a decimal point');const input={monthlyPayment:parseAmount(monthly),oneTimePayment:parseAmount(oneTime),annualRatePct:Number(rate)};setResult(compareDebtPayoff(debt,input));setDraft({version:1,kind:'debt',asOf:todayKey(),source:debt,input});checkpoint.markSaved();}catch(e){setError(e instanceof Error?e.message:'Could not compare');}}}>
    <p><strong>{debt.name}</strong> · current {debt.linkedLiabilityAccountId?'linked liability':'manually tracked'} balance {money(debt.balance)}. This comparison records no payment and changes no plan.</p>
    <div className="field"><label className="label" htmlFor="compare-debt-monthly">Alternative monthly payment</label><input className="input" inputMode="decimal" id="compare-debt-monthly" value={monthly} onChange={e=>{setMonthly(e.target.value);changed();}}/></div>
    <div className="field"><label className="label" htmlFor="compare-debt-once">Additional one-time payment now</label><input className="input" inputMode="decimal" id="compare-debt-once" value={oneTime} onChange={e=>{setOneTime(e.target.value);changed();}}/></div>
    <div className="field"><label className="label" htmlFor="compare-debt-rate">Assumed annual interest rate (%)</label><input className="input" inputMode="decimal" id="compare-debt-rate" value={rate} onChange={e=>{setRate(e.target.value);changed();}}/></div>
    <p className="field-help">The one-time amount reduces principal before the first simulated month's interest. Each later month adds rounded interest at annual rate ÷ 12, then applies the monthly payment. Rates stay fixed; fees, daily compounding, lender-specific rules, penalties and new borrowing are excluded. Working comparisons are temporary unless you explicitly save a named snapshot.</p>
    <div className="modal-footer"><button className="btn btn-primary" type="submit">Compare payoff</button></div>{error&&<p role="alert">{error}</p>}
    {result&&<section aria-live="polite"><h3>Payoff comparison</h3><div className="grid grid-2">{[['Current plan',result.baseline],['Alternative',result.alternative]].map(([label,p])=>{const projection=p as typeof result.baseline;return <section className="plan-summary" key={String(label)}><h4>{String(label)}</h4><dl className="metric-list"><div><dt>Months to payoff</dt><dd>{projection.monthsToPayoff??(projection.truncated?'Beyond 1,200-month limit':'Does not cover interest')}</dd></div><div><dt>Estimated interest</dt><dd className="amount">{projection.totalInterest===null?'Cannot calculate':money(projection.totalInterest)}</dd></div><div><dt>Total paid from now</dt><dd className="amount">{projection.totalPaid===null?'Cannot calculate':money(projection.totalPaid)}</dd></div></dl></section>;})}</div><p>Months saved: {result.monthsSaved??'Cannot compare'}. Estimated interest saved: {result.interestSaved===null?'Cannot compare':money(result.interestSaved)}. Negative differences mean the alternative takes longer or costs more under these assumptions. Alternative total paid includes the one-time payment.</p><p className="field-help">Method {result.method}. These are conditional estimates, not a lender quote or a recommendation to use emergency funds. Check actual terms and cash needs before making a payment.</p></section>}
    {result&&draft&&<SavePlanningComparison key={JSON.stringify(draft)} snapshot={draft}/>}
  </form>;
}
