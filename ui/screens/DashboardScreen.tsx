import {usePresentation} from '../usePresentation';
import {useMemo} from 'react';
import {adjustedBalances,goalAllocationBalances} from '../../domain/financialRecords';
import {consolidatedBalance} from '../../domain/ledger';
import {summarizeMonthlyCashFlow} from '../../domain/cashflow';
import {projectGoal} from '../../domain/goal';
import { useSession } from '../../application/FolioProvider';
import { todayKey } from '../../domain/dates';

import { navigate } from '../navigation';

export function DashboardScreen() {
  const {money,dateLabel,monthLabel}=usePresentation();
  const { controller, controllerRevision, saveStatus } = useSession();
  const data=useMemo(()=>controller?.snapshot,[controller,controllerRevision]);
  const month=controller?.getCurrentMonthKey()??'',asOf=todayKey();
  const summary=useMemo(()=>{
    if(!data)return null;
    const accountBalances=adjustedBalances(data),accounts=data.accounts.filter(a=>!a.archived);
    const context={accountBalances,goalAllocations:goalAllocationBalances(data)};
    return {
      balances:{accounts,balances:accountBalances,consolidated:consolidatedBalance(accounts,accountBalances)},
      cash:summarizeMonthlyCashFlow(data.txns,data.recurring,month),
      recent:data.txns.filter(t=>!t.archived).sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt)).slice(0,5),
      projections:new Map(data.goals.filter(g=>g.active).map(g=>[g.id,projectGoal(g,asOf,0,context)])),
    };
  },[data,month,asOf]);
  if (!controller||!data||!summary) return null;
  const {balances,cash,recent,projections}=summary;
  const goals = data.goals.filter(g=>g.active).slice(0,3);
  const goalsWithoutDate = [...projections.values()].some(p=>p.remaining>0&&!p.projectedTargetMonth);
  const name = (id:string) => data.accounts.find(a=>a.id===id)?.name ?? 'Unknown account';
  const needsAccount = balances.accounts.length === 0;
  const recordOrAddAccount = () => navigate(needsAccount ? 'accounts' : 'transactions', 'create');
  return <div className="overview">
    <header className="screen-header"><div><p className="eyebrow">Your financial notebook</p><h1 className="screen-title">Dashboard</h1><p className="screen-sub">{monthLabel(month)} · Recorded so far</p></div><button className="btn btn-primary" onClick={recordOrAddAccount}>{needsAccount?'Add an account':'Record transaction'}</button></header>
    {(needsAccount || recent.length === 0) && <section className="setup-path">
      <h2>{needsAccount ? 'Start with an active account' : 'Record your first transaction'}</h2>
      <p>{needsAccount
        ? 'Add a bank or cash account with the balance you want to start tracking.'
        : 'Use Record transaction to add income, an expense, or a transfer.'}</p>
      {needsAccount && data.accounts.length > 0 && <button className="link-btn" onClick={()=>navigate('accounts','archived')}>Review archived accounts</button>}
      <div><button className="link-btn" onClick={()=>navigate('settings','exports')}>Backups &amp; exports</button></div>
    </section>}
    {data.accounts.length > 0 && <>
      <section className="overview-snapshot"><div className="stat"><p className="eyebrow stat-label">Active account total</p><p className="headline-amount stat-value">{money(balances.consolidated)}</p><p className="field-help">Opening balances, included transactions and balance adjustments across active accounts. Separate Debt plans are not deducted; this is not net worth or spendable funds.</p></div><div className="month-metrics"><h2>Recorded this month</h2><dl className="metric-list"><div className="stat"><dt className="stat-label">Recorded income</dt><dd className="stat-value">{money(cash.actual.income)}</dd></div><div className="stat"><dt className="stat-label">Recorded expenses</dt><dd className="stat-value">{money(cash.actual.expense)}</dd></div><div className="stat"><dt className="stat-label">Recorded surplus</dt><dd className="stat-value">{money(cash.actual.net)}</dd></div></dl><p className="field-help">Recorded income less net expenses for this calendar month, including future-dated records. Not verified savings.</p></div></section>
      {(cash.actual.net<0||goalsWithoutDate) && <section className="notebook-section"><h2>Figures to review</h2>{cash.actual.net<0&&<p>Recorded expenses exceed income for this calendar month. Your records may be incomplete. <button className="link-btn" onClick={()=>navigate('transactions')}>Review recorded transactions</button></p>}{goalsWithoutDate&&<p>Some active goal completion dates cannot be calculated. <button className="link-btn" onClick={()=>navigate('goals')}>Review goal assumptions</button></p>}</section>}
      <div className="overview-columns"><section className="notebook-section"><div className="section-heading"><h2>Accounts</h2><button className="link-btn" onClick={()=>navigate('accounts')}>View accounts</button></div><div className="list">{balances.accounts.map(a=><button className="list-row" key={a.id} onClick={()=>navigate('transactions','account',a.id)}><span className="list-row-main"><strong>{a.name}</strong><span className="record-meta">{a.type}</span></span><span className="amount">{money(balances.balances.get(a.id) ?? 0)}</span></button>)}</div></section>
      <section className="notebook-section"><div className="section-heading"><h2>Schedule templates this month</h2><button className="link-btn" onClick={()=>navigate('recurring')}>Review schedules</button></div><dl className="metric-list"><div><dt>Template income</dt><dd>{money(cash.committed.income)}</dd></div><div><dt>Template expenses</dt><dd>{money(cash.committed.expense)}</dd></div></dl><p className="field-help">Whole-month totals from current schedule rules. Skipped or no-longer-expected occurrence decisions are not deducted here. Open Scheduled to review individual occurrences and recorded-payment links; these totals do not show what is still due.</p>{saveStatus==='error' && <p role="alert">Your changes need attention. Review the save message before continuing.</p>}</section></div>
      {goals.length > 0 && <section className="notebook-section"><div className="section-heading"><h2>Active goals</h2><button className="link-btn" onClick={()=>navigate('goals')}>Review all goals</button></div><div className="overview-goals">{goals.map(g=>{const p=projections.get(g.id)!;return <button className="goal-preview" key={g.id} onClick={()=>navigate('goals')}><strong>{g.name}</strong><span>{money(p.remaining)} remaining</span><span className="record-meta">{p.projectedTargetMonth?monthLabel(p.projectedTargetMonth):'Completion cannot be calculated'}</span>{g.funding!=='allocations' && g.linkedAccountId && <span className="record-meta">Linked balance may overlap other goals</span>}</button>;})}</div><p className="field-help">Contribution comparisons use the amount you enter in Goals; no shared available amount is assumed.</p></section>}
    </>}
    <section className="notebook-section"><div className="section-heading"><h2>Recent transactions</h2><button className="link-btn" onClick={()=>navigate('transactions')}>View history</button></div>{recent.length ? <div className="list">{recent.map(t=><button key={t.id} className="list-row" onClick={()=>t.debtPaymentId ? navigate('debts') : navigate('transactions','edit',t.id)}><span className="list-row-main"><strong>{t.type==='transfer'?`${name(t.accountId)} → ${name(t.toAccountId!)}`:data.categories.find(c=>c.id===t.categoryId)?.name ?? t.type}</strong><span className="record-meta">{dateLabel(t.date)} · {t.type} · {name(t.accountId)}</span></span><span className="amount">{money(t.amount)}</span></button>)}</div> : <div className="empty-state"><h3>No transactions yet</h3><p>Record what happened to start building your financial picture.</p></div>}</section>
  </div>;
}
