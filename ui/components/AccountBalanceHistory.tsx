import { useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { accountBalanceHistory, historyBalanceThrough } from '../../domain/balanceHistory';
import { usePresentation } from '../usePresentation';

export function AccountBalanceHistory({ accountId }: { accountId: string }) {
  const { controller, controllerRevision } = useSession();
  const { money, dateLabel } = usePresentation();
  const [shown, setShown] = useState(100);
  const data = controller?.snapshot;
  const points = useMemo(() => data ? accountBalanceHistory(data, accountId) : [], [data, accountId, controllerRevision]);
  const account = data?.accounts.find(a => a.id === accountId);
  if (!account || !data) return null;
  const latest = points.slice(-60), min = Math.min(...latest.map(p => p.balance)), max = Math.max(...latest.map(p => p.balance));
  const start = latest.length ? Date.parse(latest[0].date) : 0, end = latest.length ? Date.parse(latest.at(-1)!.date) : 0;
  const line = latest.map(p => `${12 + (Date.parse(p.date) - start) / (end - start || 1) * 576},${108 - (p.balance - min) / (max - min || 1) * 96}`).join(' ');
  const checks = (data.financial?.checks ?? []).filter(c => c.accountId === accountId).slice().sort((a,b) => b.checkedAt.localeCompare(a.checkedAt));
  return <section className="balance-history" aria-label="Recorded balance history"><h3>{account.name} · balance history</h3><p>Opening balance: <strong className="amount">{money(account.openingBalance)}</strong>. This is an undated starting amount, not a verified historical balance. Each row shows the closing balance on a date with recorded activity; future-dated records are included on their dates.</p>
    {latest.length > 1 && <figure><svg viewBox="0 0 600 120" width="100%" role="img" aria-label={`Recorded closing balances from ${dateLabel(latest[0].date)} to ${dateLabel(latest.at(-1)!.date)}. Exact values appear in the table below.`}><polyline points={line} fill="none" stroke="var(--accent, currentColor)" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><figcaption className="field-help">Latest {latest.length} activity dates · {money(min)} to {money(max)}. Line connects recorded points; no bank verification or forecast.</figcaption></figure>}
    {!points.length ? <p>No recorded movements yet.</p> : <><div className="balance-history-table table-wrap"><table className="table"><caption>Recorded closing balances, newest first</caption><thead><tr><th scope="col">Date</th><th scope="col">Movement</th><th scope="col">Closing balance</th><th scope="col">Records</th></tr></thead><tbody>{points.slice().reverse().slice(0,shown).map(p=><tr key={p.date}><th scope="row">{dateLabel(p.date)}</th><td className="amount">{money(p.movement)}</td><td className="amount">{money(p.balance)}</td><td>{p.transactions} transactions · {p.adjustments} adjustments</td></tr>)}</tbody></table></div><div className="balance-history-mobile">{points.slice().reverse().slice(0,shown).map(p=><article className="balance-history-day" key={p.date}><h4>{dateLabel(p.date)}</h4><dl className="metric-list"><div><dt>Closing balance</dt><dd className="amount">{money(p.balance)}</dd></div><div><dt>Movement</dt><dd className="amount">{money(p.movement)}</dd></div></dl><p className="field-help">{p.transactions} transactions · {p.adjustments} adjustments</p></article>)}</div>{shown < points.length && <button type="button" className="btn btn-secondary" onClick={()=>setShown(n=>n+100)}>Show 100 more activity dates</button>}</>}
    <h3>Previously checked balances</h3><p className="field-help">A check records what you entered at the time. Agreement today does not prove the records are complete or unchanged.</p>{!checks.length ? <p>No balance checks recorded.</p> : checks.slice(0,shown).map(c=>{const current=historyBalanceThrough(points,account.openingBalance,c.date);return <p key={c.id}>{dateLabel(c.date)} · entered {money(c.actual)} · recorded when checked {money(c.recorded)} · recorded now {money(current)} · {current===c.recorded?'Still agrees with the recorded amount at check time':'Recorded balance changed since this check; review it again'}.</p>;})}{checks.length>shown&&<button type="button" className="btn btn-secondary" onClick={()=>setShown(n=>n+100)}>Show more balance checks</button>}
  </section>;
}
