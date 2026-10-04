import { useNarrowScreen } from '../hooks/useNarrowScreen';
import { monthLabel } from '../presentation';
import { useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { formatMinor, INR } from '../../domain/money.js';
import { addMonths, todayKey } from '../../domain/dates.js';

export function ReportsScreen() {
  const narrow = useNarrowScreen();
  const { controller, controllerRevision } = useSession();
  void controllerRevision;
  if (!controller) return null;

  const baseMonthKey = useMemo(() => controller.getCurrentMonthKey(), [controller, controllerRevision]);

  const fmt = (n: number) => formatMinor(n, { symbol: INR.symbol, minorDigits: INR.minorDigits, indianGrouping: INR.indianGrouping });

  const [months, setMonths] = useState<number>(6);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => controller.snapshot.txns.filter(t=>!t.archived).map(t=>t.date.slice(0,7)).sort().at(-1) ?? controller.getCurrentMonthKey());
  const monthKeys = useMemo(() => {
    const arr: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const key = addMonths(baseMonthKey, -i);
      arr.push(key);
    }
    return arr;
  }, [months, baseMonthKey, controllerRevision]);

  const hasMeaningfulActivity = useMemo(() => {
    const rows = monthKeys.map(k => controller.getMonthlyCashFlow(k));
    const hasActivity = rows.some(cf => cf.actual.income !== 0 || cf.actual.expense !== 0 || cf.committed.income !== 0 || cf.committed.expense !== 0);
    return hasActivity;
  }, [monthKeys, controller, controllerRevision]);

  const rows = useMemo(() => {
    return monthKeys.map(k => {
      const cf = controller.getMonthlyCashFlow(k);
      return {
        monthKey: k,
        hasRecords:controller.snapshot.txns.some(t=>!t.archived&&t.date.slice(0,7)===k),
        actualIncome: cf.actual.income,
        actualExpense: cf.actual.expense,
        actualNet: cf.actual.net,
        committedIncome: cf.committed.income,
        committedExpense: cf.committed.expense,
        committedNet: cf.committed.net,
      };
    });
  }, [monthKeys, controller, controllerRevision]);

  const categoryTotals = useMemo(() => {
    if (!selectedMonth) return null;
    const totalsMap = controller.getMonthlyCategoryTotals(selectedMonth);
    const categories = controller.snapshot.categories;
    const mapById = new Map(categories.map(c => [c.id, c]));
    const rowsArr: { catId: string; catName: string; kind: string; income: number; expense: number }[] = [];
    totalsMap.forEach((v, catId) => {
      const cat = mapById.get(catId);
      rowsArr.push({ catId, catName: cat?.name ?? 'Uncategorized', kind: cat?.kind ?? 'expense', income: v.income, expense: v.expense });
    });
    return rowsArr.sort((a,b)=> b.expense-a.expense || a.catName.localeCompare(b.catName));
  }, [selectedMonth, controller, controllerRevision]);

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Reports</h1>
          <div className="screen-sub">Recorded transactions and separate schedules. Transfers and excluded transactions do not contribute to cash flow.</div>
        </div>
        <div className="screen-actions">
          <select className="select" value={months} onChange={e=>setMonths(parseInt(e.target.value))} aria-label="Number of months to display">
            {[3,6,12].map(m => <option key={m} value={m}>{m} months</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Cash flow overview</h2>
        {hasMeaningfulActivity ? (
          <>
            {!narrow && <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Recorded income</th>
                    <th className="num">Recorded expenses</th>
                    <th className="num">Recorded surplus</th>
                    <th className="num">Scheduled income</th>
                    <th className="num">Scheduled expenses</th>
                    <th className="num">Scheduled income less expenses</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.monthKey}>
                      <td>
                        <button className="link-btn" onClick={() => setSelectedMonth(r.monthKey)} aria-label={`Select ${r.monthKey} for category breakdown`}>{monthLabel(r.monthKey)}</button>{!r.hasRecords&&<span className="record-meta">No recorded transactions in this month.</span>}
                      </td>
                      <td className="num">{fmt(r.actualIncome)}</td>
                      <td className="num">{fmt(r.actualExpense)}</td>
                      <td className="num">{fmt(r.actualNet)}</td>
                      <td className="num">{fmt(r.committedIncome)}</td>
                      <td className="num">{fmt(r.committedExpense)}</td>
                      <td className="num">{fmt(r.committedNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
            {narrow && <div className="monthly-summaries">{[...rows].reverse().map(r=><section className="month-summary" key={r.monthKey}><button className="link-btn" onClick={()=>setSelectedMonth(r.monthKey)}>{monthLabel(r.monthKey)}</button>{!r.hasRecords&&<p className="field-help">No recorded transactions in this month.</p>}<dl className="metric-list"><div><dt>Recorded income</dt><dd>{fmt(r.actualIncome)}</dd></div><div><dt>Recorded expenses</dt><dd>{fmt(r.actualExpense)}</dd></div><div><dt>Recorded surplus</dt><dd>{fmt(r.actualNet)}</dd></div></dl><details><summary>Scheduled figures</summary><p>Income {fmt(r.committedIncome)} · Expenses {fmt(r.committedExpense)} · Difference {fmt(r.committedNet)}</p></details></section>)}</div>}
          </>
        ) : (
          <div className="empty-state">
            
            <h3>No report data yet.</h3>
            <p>Record transactions or add schedules to see their separate summaries.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Category spending</h2><label className="field">Month<input className="input" type="month" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}/></label>
        {!selectedMonth ? (
          <div className="empty-state">
            
            <h3>Select a month</h3>
            <p>Choose a month from the cash flow table above to view category totals.</p>
          </div>
        ) : categoryTotals && categoryTotals.length === 0 ? (
          <div className="empty-state">
            
            <h3>No transactions</h3>
            <p>No transactions for {selectedMonth}.</p>
          </div>
        ) : categoryTotals ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Expense</th>
                  <th className="num">% of total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const expenseRows = categoryTotals.filter(r => r.kind === 'expense' && r.expense > 0);
                  const totalExpense = expenseRows.reduce((s, r) => s + r.expense, 0);
                  return expenseRows.map(row => {
                    const pct = totalExpense > 0 ? (row.expense / totalExpense) * 100 : 0;
                    return (
                      <tr key={row.catId}>
                        <td>{row.catName}</td>
                        <td className="num">{fmt(row.expense)}</td>
                        <td className="num">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">Account balances</h2>
          {(() => {
            const balances = controller.getAccountBalances(false);
            const accounts = balances.accounts;
            if (accounts.length === 0) {
              return (
                <div className="empty-state">
                  
                  <h3>No accounts</h3>
                  <p>Add accounts to see recorded balances.</p>
                </div>
              );
            }
            return (
              <div className="list"><p className="scope-note">The total includes active accounts only. Debt plans are separate; this is not net worth or available spending money.</p>
                {accounts.map(a => {
                  const bal = balances.balances.get(a.id) ?? 0;
                  return (
                    <div className="list-row" key={a.id}>
                      <div className="list-row-main">
                        <div className="list-row-title">{a.name}</div>
                        <div className="list-row-sub">{a.type}{a.archived ? ' · archived' : ''}</div>
                      </div>
                      <div className={`amount ${bal >= 0 ? 'neutral' : 'negative'}`}>{fmt(bal)}</div>
                    </div>
                  );
                })}
                <div className="list-row" style={{ fontWeight: 600 }}>
                  <div className="list-row-main"><div className="list-row-title">Active account total</div></div>
                  <div className="amount">{fmt(balances.consolidated)}</div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="card">
          <h2 className="card-title">Debt summary</h2>
          {(() => {
            const summary = controller.getDebtSummary();
            if (summary.activeCount === 0) {
              return (
                <div className="empty-state">
                  
                  <h3>No active debts</h3>
                  <p>Add debts to track payoff plans.</p>
                </div>
              );
            }
            return (
              <div className="grid grid-1">
                <div className="stat"><div className="stat-label">Total balance</div><div className="stat-value">{fmt(summary.totalBalance)}</div></div>
                <div className="stat"><div className="stat-label">Monthly payment</div><div className="stat-value">{fmt(summary.totalMonthlyPayment)}</div></div>
                <div className="stat"><div className="stat-label">Active debts</div><div className="stat-value">{summary.activeCount}</div></div>
                <div className="stat"><div className="stat-label">Payments not covering interest</div><div className="stat-value">{summary.nonAmortizingCount}</div></div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Goal summary</h2><p className="scope-note">Linked goals use their whole account balance. Goals can overlap; these amounts are not exclusive allocations.</p>
        {(() => {
          const goals = controller.snapshot.goals;
          const activeGoals = goals.filter(g => g.active);
          if (activeGoals.length === 0) {
            return (
              <div className="empty-state">
                
                <h3>No active goals</h3>
                <p>Create goals to track progress.</p>
              </div>
            );
          }
          const asOf = todayKey();
          return (
            <>{narrow ? <div>{activeGoals.map(g=>{const p=controller.projectGoal(g.id,asOf,0);return <section className="month-summary" key={g.id}><h3>{g.name}</h3><dl className="metric-list"><div><dt>Target</dt><dd>{fmt(g.targetAmount)}</dd></div><div><dt>Saved under this goal's source</dt><dd>{fmt(p.savedSoFar)}</dd></div><div><dt>Remaining</dt><dd>{fmt(p.remaining)}</dd></div></dl></section>;})}</div>:<div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="num">Target</th>
                    <th className="num">Saved</th>
                    <th className="num">Remaining</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {activeGoals.map(g => {
                    const proj = controller.projectGoal(g.id, asOf, 0);
                    const progressPct = g.targetAmount > 0 ? Math.min(100, Math.round((proj.savedSoFar / g.targetAmount) * 100)) : 0;
                    return (
                      <tr key={g.id}>
                        <td>{g.name}</td>
                        <td className="num">{fmt(g.targetAmount)}</td>
                        <td className="num">{fmt(proj.savedSoFar)}</td>
                        <td className="num">{fmt(proj.remaining)}</td>
                        <td>{progressPct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}</>
          );
        })()}
      </div>
    </div>
  );
}
