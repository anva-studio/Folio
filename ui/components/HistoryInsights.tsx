import {useProduct} from '../../application/productNavigation';
import { useEffect, useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { analyzeHistory } from '../../domain/historyInsights';
import { usePresentation } from '../usePresentation';
import { navigate } from '../navigation';

export function HistoryInsights() {
  const product=useProduct();
  const {controller,controllerRevision}=useSession(), {money,monthLabel}=usePresentation();
  const [open,setOpen]=useState(false),[result,setResult]=useState<Awaited<ReturnType<typeof analyzeHistory>>>(),[error,setError]=useState('');
  const month=controller?.getCurrentMonthKey();
  useEffect(()=>{
    let current=true;setResult(undefined);setError('');
    if(open&&controller&&month) void analyzeHistory(controller.snapshot,month).then(value=>{if(current)setResult(value);}).catch(()=>{if(current)setError('Could not analyze recorded history. Your records have not been changed.');});
    return ()=>{current=false;};
  },[open,controller,controllerRevision,month]);
  return <details className="card history-insights" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>What your recorded history shows</summary>{open&&<><p>Six completed calendar months. The current partial month is excluded. Income excludes transfers and refunds; spending is expenses less refunds in each month. A recorded surplus is not proof of money saved.</p>{error&&<p role="alert">{error}</p>}{!result&&!error&&<p role="status">Checking history and review status…</p>}{result&&<>
    <p><strong>{result.reviewedMonths} of 6 months reviewed and unchanged.</strong> {result.monthsWithRecords} months contain included records. Record volume alone does not establish completeness. {product.example?'Seeded reviews are fictional demonstrations, not checks you made on real finances.':'Reviews are your own confirmations, not bank verification.'}</p>
    {result.reviewedMonths===0?<p>No reviewed history is available for a reliable period comparison. Review a completed month in Reports before drawing conclusions from empty or partial records.</p>:<p>Recorded spending exceeded earned income in {result.reviewedShortfallMonths} of the {result.reviewedMonths} reviewed months. This can include planned use of existing savings; check the context before changing a plan.</p>}
    {result.comparison?<section><h3>{monthLabel(result.comparison.to)} compared with {monthLabel(result.comparison.from)}</h3><dl className="metric-list"><div><dt>Earned income change</dt><dd className="amount">{money(result.comparison.incomeChange)}</dd></div><div><dt>Net spending change</dt><dd className="amount">{money(result.comparison.spendingChange)}</dd></div><div><dt>Recorded surplus change</dt><dd className="amount">{money(result.comparison.netChange)}</dd></div></dl><p className="field-help">Differences in recorded amounts, not forecasts. Refund timing and unusual purchases can change these figures. No percentage is invented when a prior value is zero.</p></section>:<p>The two most recent completed months are not both reviewed and unchanged, so no headline improvement or decline is claimed.</p>}
    <div className="history-insight-periods">{result.periods.slice().reverse().map(p=><article className="balance-history-day" key={p.month}><h3>{monthLabel(p.month)}</h3><p>{p.state==='reviewed'?(product.example?'Sample review · unchanged':'Reviewed by you · unchanged'):p.state==='changed'?'Changed since review · review again':'Not reviewed · completeness unknown'}{p.transactionCount===0?' · no included transactions':''}</p><dl className="metric-list"><div><dt>Recorded earned income</dt><dd className="amount">{money(p.income)}</dd></div><div><dt>Net spending</dt><dd className="amount">{money(p.expense)}</dd></div><div><dt>Income less net spending</dt><dd className="amount">{money(p.net)}</dd></div></dl><button type="button" className="btn btn-small btn-secondary" onClick={()=>navigate('transactions','month',p.month)}>View {monthLabel(p.month)} transactions</button></article>)}</div>
    <details><summary>Method and limits</summary><p>Method {result.method}. All six months are shown, including missing periods. Only a reviewed month whose content digest still matches is counted as reviewed. Transfers and balance adjustments do not become earned income or spending. A review can contain omissions; a matching digest does not prove completeness. No overall health or credit score is calculated from transaction history.</p></details>
  </>}</>}</details>;
}
