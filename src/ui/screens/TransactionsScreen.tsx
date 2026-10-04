import { transactionFilters } from '../sessionPreferences';
import { useNarrowScreen } from '../hooks/useNarrowScreen';
import { EntryDialog as Modal } from '../components/EntryDialog';
import { dateLabel, money } from '../presentation';
import type { Txn } from '../../domain/types';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { formatMinor, INR } from '../../domain/money.js';
import { monthKeyOf } from '../../domain/dates.js';
import { TransactionForm } from '../forms/TransactionForm.js';
import CategoryManager from '../components/CategoryManager.js';


export function TransactionsScreen({startCreate=false,initialEdit,initialAccount}:{startCreate?:boolean;initialEdit?:string;initialAccount?:string} = {}) {
  const narrow = useNarrowScreen();
  const { controller, controllerRevision } = useSession();
  const [shown, setShown] = useState(100);
  const [excludeTarget, setExcludeTarget] = useState<Txn | null>(null);
  const [showTxn, setShowTxn] = useState(startCreate || !!initialEdit);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(initialEdit ?? null);
  const [showCats, setShowCats] = useState(false);
  const [filterArchived, setFilterArchived] = useState(() => controller ? transactionFilters.get(controller)?.excluded ?? false : false);
  const [monthFilter, setMonthFilter] = useState<'current'|'all'>(()=>initialAccount ? 'all' : controller ? transactionFilters.get(controller)?.month ?? 'current' : 'current');
  const [typeFilter, setTypeFilter] = useState<'all'|'income'|'expense'|'transfer'>(()=>controller ? transactionFilters.get(controller)?.type ?? 'all' : 'all');
  const [accountFilter, setAccountFilter] = useState<string>(()=>initialAccount ?? (controller ? transactionFilters.get(controller)?.account ?? 'all' : 'all'));
  useEffect(()=>{if(controller) transactionFilters.set(controller,{excluded:filterArchived,month:monthFilter,type:typeFilter,account:accountFilter});},[controller,filterArchived,monthFilter,typeFilter,accountFilter]);
  void controllerRevision;
  if (!controller) return null;
  const snap = controller.snapshot;
  const fmt = (n:number)=>formatMinor(n, {symbol: INR.symbol, minorDigits: INR.minorDigits, indianGrouping: INR.indianGrouping});
  const currentMonth = controller.getCurrentMonthKey();
  const activeAccounts = useMemo(()=>snap.accounts.filter(a=>!a.archived), [snap.accounts]);

  const filteredTxns = useMemo(()=>{
    let list = snap.txns;
    if (!filterArchived) list = list.filter(t=>!t.archived);
    if (monthFilter==='current') list = list.filter(t=>monthKeyOf(t.date)===currentMonth);
    if (typeFilter!=='all') list = list.filter(t=>t.type===typeFilter);
    if (accountFilter!=='all') list = list.filter(t=>t.accountId===accountFilter || t.toAccountId===accountFilter);
    return [...list].sort((a,b)=> (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  }, [snap.txns, filterArchived, monthFilter, typeFilter, accountFilter, currentMonth]);

  useEffect(() => setShown(100), [filterArchived, monthFilter, typeFilter, accountFilter]);
  const flow = (t: Txn) => t.type === 'transfer' ? `${snap.accounts.find(a=>a.id===t.accountId)?.name ?? 'Unknown account'} → ${snap.accounts.find(a=>a.id===t.toAccountId)?.name ?? 'Unknown account'}` : snap.categories.find(c=>c.id===t.categoryId)?.name ?? 'Uncategorized';
  const actions = (t: Txn) => <><button className="btn btn-secondary btn-small" onClick={()=>{setEditingTxnId(t.id);setShowTxn(true);}}>Edit</button><button className="btn btn-ghost btn-small" onClick={()=>t.archived ? controller.setTxnArchived(t.id,false) : setExcludeTarget(t)}>{t.archived ? 'Include again' : 'Exclude from calculations'}</button></>;
  const editingTxn = editingTxnId ? snap.txns.find(t=>t.id===editingTxnId) : undefined;

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Transactions</h1>
          <details className="txn-filters" open={!narrow}><summary>Filters · {monthFilter==='current'?'Current month':'All transactions'}</summary><div className="screen-sub" style={{display:'flex', gap:'16px', flexWrap:'wrap', alignItems:'center'}}>
            <label className="checkbox-label">
              <input type="checkbox" checked={filterArchived} onChange={e=>setFilterArchived(e.target.checked)} id="show-archived" />
              <span>Show excluded</span>
            </label>
            <div className="field" style={{margin:0}}>
              <fieldset className="label" role="group" aria-label="Month">
                <legend className="label" style={{fontSize:'12px'}}>Month</legend>
                <div className="segmented" style={{marginTop:'4px'}}>
                  <button type="button" className={monthFilter==='current'?'active':''} onClick={()=>setMonthFilter('current')}>Current month</button>
                  <button type="button" className={monthFilter==='all'?'active':''} onClick={()=>setMonthFilter('all')}>All transactions</button>
                </div>
              </fieldset>
            </div>
            <div className="field" style={{margin:0, minWidth:'140px'}}>
              <label htmlFor="txn-type-filter" className="label" style={{fontSize:'12px'}}>Type</label>
              <select id="txn-type-filter" className="select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value as any)} style={{marginTop:'4px'}}>
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div className="field" style={{margin:0, minWidth:'180px'}}>
              <label htmlFor="txn-account-filter" className="label" style={{fontSize:'12px'}}>Account</label>
              <select id="txn-account-filter" className="select" value={accountFilter} onChange={e=>setAccountFilter(e.target.value)} style={{marginTop:'4px'}}>
                <option value="all">All accounts</option>
                {activeAccounts.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div></details>
        </div>
        <div className="screen-actions">
          <button className="btn btn-secondary" onClick={()=>setShowCats(true)}>Manage categories</button>
          <button className="btn btn-primary" onClick={()=>{ setEditingTxnId(null); setShowTxn(true); }}>New transaction</button>
        </div>
      </div>
      <button className="btn btn-ghost" onClick={()=>{setFilterArchived(false);setMonthFilter('current');setTypeFilter('all');setAccountFilter('all');}}>Clear filters</button>
      <div className="card">
        <p className="result-count" role="status">Showing {Math.min(shown,filteredTxns.length)} of {filteredTxns.length} matching transactions</p>
        {filteredTxns.length===0 ? (
          <div className="empty-state">
            
            <h3>{snap.txns.length ? 'No transactions match these filters' : 'No transactions yet'}</h3>
            <p>Adjust filters or create a new transaction to get started.</p>
          </div>
        ) : (
          !narrow && <div className="table-wrap desktop-data">
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Category / Flow</th><th className="num">Amount</th><th>Note</th><th>Action</th></tr></thead>
              <tbody>
                {filteredTxns.slice(0,shown).map(t=>{
                  const accName = snap.accounts.find(a=>a.id===t.accountId)?.name ?? t.accountId;
                  const toName = t.toAccountId ? snap.accounts.find(a=>a.id===t.toAccountId)?.name : null;
                  const catName = t.categoryId ? snap.categories.find(c=>c.id===t.categoryId)?.name : null;
                  const noteSnippet = t.note ? (t.note.length>50 ? t.note.slice(0,50)+'…' : t.note) : '';
                  return (
                  <tr key={t.id} style={{cursor:'pointer'}} onClick={()=>{ setEditingTxnId(t.id); setShowTxn(true); }}>
                    <td>{dateLabel(t.date)}</td>
                    <td>{t.type}</td>
                    <td>{accName}</td>
                    <td>
                      {t.type==='transfer'
                        ? <span>{accName} → {toName ?? t.toAccountId}</span>
                        : <span>{catName ?? '-'}</span>
                      }
                    </td>
                    <td className="num">{fmt(t.amount)}</td>
                    <td style={{color:'var(--muted)', fontSize:'13px'}}>{noteSnippet}</td>
                    <td>
                      <button className="link-btn" onClick={(e)=>{ e.stopPropagation(); setEditingTxnId(t.id); setShowTxn(true); }}>Edit</button>
                      {' '}
                      <button className="link-btn" onClick={(e)=>{ e.stopPropagation(); t.archived ? controller.setTxnArchived(t.id, false) : setExcludeTarget(t); }}>
                        {t.archived ? 'Include again' : 'Exclude from calculations'}
                      </button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {narrow && <div className="mobile-data">{filteredTxns.slice(0,shown).map(t=><details className="mobile-record" key={t.id}><summary><span><strong>{flow(t)}</strong><span className="record-meta">{dateLabel(t.date)} · {t.type}{t.archived && ' · excluded'}</span>{t.type!=='transfer' && <span className="record-meta">{snap.accounts.find(a=>a.id===t.accountId)?.name}</span>}</span><span className="amount">{money(t.amount)}</span></summary><div className="record-detail">{t.note && <p>{t.note}</p>}<div className="action-row">{actions(t)}</div></div></details>)}</div>}
      {shown < filteredTxns.length && <button className="btn btn-secondary" onClick={()=>setShown(n=>n+100)}>Load more transactions</button>}
      {excludeTarget && <Modal open title="Exclude this transaction?" onClose={()=>setExcludeTarget(null)}><p>{flow(excludeTarget)} · {money(excludeTarget.amount)}</p><p>This record will remain, but balances and reports may change. You can include it again later.</p><div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setExcludeTarget(null)}>Cancel</button><button className="btn btn-danger" onClick={()=>{controller.setTxnArchived(excludeTarget.id,true);setExcludeTarget(null);}}>Exclude transaction</button></div></Modal>}
      <Modal open={showTxn} onClose={()=>{ setShowTxn(false); setEditingTxnId(null); }} title={editingTxnId ? 'Edit transaction' : 'New transaction'}>
        <TransactionForm
          onClose={()=>{ setShowTxn(false); setEditingTxnId(null); }}
          editingTxnId={editingTxnId ?? undefined}
          initial={editingTxn ? {
            type: editingTxn.type,
            date: editingTxn.date,
            amount: editingTxn.amount,
            accountId: editingTxn.accountId,
            toAccountId: editingTxn.toAccountId,
            categoryId: editingTxn.categoryId,
            note: editingTxn.note,
          } : undefined}
        />
      </Modal>
      <Modal open={showCats} onClose={()=>setShowCats(false)} title="Manage categories">
        <CategoryManager onClose={()=>setShowCats(false)} />
      </Modal>
    </div>
  );
}
