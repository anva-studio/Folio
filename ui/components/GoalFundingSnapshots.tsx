import {useMemo} from 'react';
import type {SavedPlanningComparison} from '../../domain/savedComparisons';
import {usePresentation} from '../usePresentation';
import {navigate} from '../navigation';

/** Captured stock and intentions are not reconstructed contribution/payment events. */
export function GoalFundingSnapshots({goalId,records}:{goalId:string;records?:SavedPlanningComparison[]}){
  const {money,dateLabel}=usePresentation();
  const snapshots=useMemo(()=>{
    const grouped=new Map<string,{record:Extract<SavedPlanningComparison,{kind:'goal'}>;count:number}>();
    for(const record of records??[]){if(record.kind!=='goal'||record.source.id!==goalId)continue;const source=record.source;
      const key=JSON.stringify({date:record.asOf,saved:record.savedAmount,target:source.targetAmount,method:source.method,monthly:source.monthlyContribution,deadline:source.targetDate,rate:source.annualRatePct,funding:source.funding,linked:source.linkedAccountId});
      const prior=grouped.get(key);if(prior){prior.count++;if(record.savedAt>prior.record.savedAt)prior.record=record;}else grouped.set(key,{record,count:1});
    }
    return [...grouped.values()].sort((a,b)=>b.record.asOf.localeCompare(a.record.asOf));
  },[records,goalId]);
  if(!snapshots.length)return null;
  return <details className="goal-funding-history notebook-section"><summary>Funding snapshots · {snapshots.length}</summary><p>Captured progress and plan assumptions from your saved contribution comparisons. This is not a complete contribution history. Changes can reflect earmarking, withdrawals, balance corrections or a different funding source—not newly saved money. Nothing is assumed before the first capture.</p>{snapshots.map(({record,count})=><section className="month-summary" key={record.id}><h3>{dateLabel(record.asOf)}</h3><dl className="metric-list"><div><dt>Recorded progress at capture</dt><dd className="amount">{money(record.savedAmount)}</dd></div><div><dt>Target at capture</dt><dd className="amount">{money(record.source.targetAmount)}</dd></div><div><dt>Plan at capture</dt><dd>{record.source.method==='target-date'&&record.source.targetDate?'Deadline '+dateLabel(record.source.targetDate):money(record.source.monthlyContribution)+' per month'}</dd></div><div><dt>Funding source at capture</dt><dd>{record.source.funding==='allocations'?'Backed earmarks':record.source.linkedAccountId?'Whole linked-account figure':'Manually reported figure'}</dd></div></dl>{count>1&&<p className="field-help">{count} comparisons reuse this capture; the money is shown once.</p>}<button type="button" className="btn btn-secondary" onClick={()=>navigate('planner','comparison',record.id)}>Open captured comparison</button></section>)}<p className="field-help">Later edits/copies of a comparison retain its source capture date. To capture current figures, run and save a new comparison from this goal. Projections and calendar time never create actual contributions.</p></details>;
}
