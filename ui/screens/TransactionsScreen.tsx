import {navigate} from '../navigation';
import type {HistoryRange} from '../historyNavigation';
import {searchTransactions,type HistoryQuery} from '../../domain/transactionSearch';
import {todayKey,isValidMonthKey,daysInCalendarMonth} from '../../domain/dates';
import {usePresentation} from '../usePresentation';
import { transactionFilters } from '../sessionPreferences';
import { useNarrowScreen } from '../hooks/useNarrowScreen';
import { EntryDialog as Modal } from '../components/EntryDialog';

import type { Txn } from '../../domain/types';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';

import { monthKeyOf } from '../../domain/dates.js';
import { TransactionForm } from '../forms/TransactionForm.js';
import CategoryManager from '../components/CategoryManager.js';


export function TransactionsScreen({startCreate=false,startSearch=false,initialEdit,initialAccount,initialMonth,initialRange}:{startCreate?:boolean;startSearch?:boolean;initialEdit?:string;initialAccount?:string;initialMonth?:string;initialRange?:HistoryRange} = {}) {
  const {money,dateLabel,parseAmount}=usePresentation();
  const narrow = useNarrowScreen();
  const { controller, controllerRevision } = useSession();
  const [shown, setShown] = useState(100);
  const explicitRange=!!initialMonth||!!initialRange||startSearch;
  const [query,setQuery]=useState<HistoryQuery>(()=>{if(initialRange)return {...initialRange};if(!initialMonth||!isValidMonthKey(initialMonth))return {};const [year,month]=initialMonth.split('-').map(Number);return {from:initialMonth+'-01',to:initialMonth+'-'+daysInCalendarMonth(year,month)};});
  const [minimum,setMinimum]=useState(''),[maximum,setMaximum]=useState('');
  const [copySource,setCopySource]=useState<Txn|null>(null);
  const [actionError,setActionError]=useState('');
  const safely=(action:()=>void)=>{try{action();setActionError('');}catch(e){setActionError(e instanceof Error?e.message:'Could not change this record');}};
  const [excludeTarget, setExcludeTarget] = useState<Txn | null>(null);
  const [showTxn, setShowTxn] = useState(startCreate || !!initialEdit);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(initialEdit ?? null);
  const [showCats, setShowCats] = useState(false);
  const [filterArchived, setFilterArchived] = useState(() => explicitRange ? false : controller ? transactionFilters.get(controller)?.excluded ?? false : false);
  const [monthFilter, setMonthFilter] = useState<'current'|'all'>(()=>initialAccount || explicitRange ? 'all' : controller ? transactionFilters.get(controller)?.month ?? 'current' : 'current');
  const [typeFilter, setTypeFilter] = useState<'all'|Txn['type']>(()=>explicitRange ? 'all' : controller ? transactionFilters.get(controller)?.type ?? 'all' : 'all');
  const [accountFilter, setAccountFilter] = useState<string>(()=>initialAccount ?? (explicitRange ? 'all' : controller ? transactionFilters.get(controller)?.account ?? 'all' : 'all'));
  useEffect(()=>{if(controller) transactionFilters.set(controller,{excluded:filterArchived,month:monthFilter,type:typeFilter,account:accountFilter});},[controller,filterArchived,monthFilter,typeFilter,accountFilter]);
  const snap = useMemo(()=>controller?.snapshot,[controller,controllerRevision]);
  if (!controller || !snap) return null;
  const fmt = money;
  const currentMonth = controller.getCurrentMonthKey();
  const activeAccounts = snap.accounts;

  let filterError='';let amountQuery:Pick<HistoryQuery,'minimum'|'maximum'>={};try{amountQuery={minimum:minimum?parseAmount(minimum):undefined,maximum:maximum?parseAmount(maximum):undefined};searchTransactions([],snap,{...query,...amountQuery});}catch(e){filterError=e instanceof Error?e.message:'Invalid filters';}
  const filteredTxns = useMemo(()=>{
    let list = snap.txns;
    if (!filterArchived) list = list.filter(t=>!t.archived);
    if (monthFilter==='current') list = list.filter(t=>monthKeyOf(t.date)===currentMonth);
    if (typeFilter!=='all') list = list.filter(t=>t.type===typeFilter);
    if (accountFilter!=='all') list = list.filter(t=>t.accountId===accountFilter || t.toAccountId===accountFilter);
    if(filterError)return [];return searchTransactions(list,snap,{...query,...amountQuery});
  }, [snap.txns, snap.categories,snap.accounts,filterArchived, monthFilter, typeFilter, accountFilter, currentMonth,query,minimum,maximum,filterError]);

  useEffect(() => setShown(100), [filterArchived, monthFilter, typeFilter, accountFilter,query,minimum,maximum]);
  const flow = (t: Txn) => t.type === 'transfer' ? `${snap.accounts.find(a=>a.id===t.accountId)?.name ?? 'Unknown account'} → ${snap.accounts.find(a=>a.id===t.toAccountId)?.name ?? 'Unknown account'}` : t.splits?'Split purchase':snap.categories.find(c=>c.id===t.categoryId)?.name ?? 'Uncategorized';
  const actions = (t: Txn) => t.debtPaymentId?<button className="btn btn-secondary" onClick={()=>navigate('debts')}>Open payment history</button>:<><button className="btn btn-secondary btn-small" onClick={()=>{setEditingTxnId(null);setCopySource({...t,date:todayKey(),archived:false});setShowTxn(true);}}>Duplicate</button>{t.type==='expense'&&!t.archived&&<button className="btn btn-secondary btn-small" onClick={()=>{setEditingTxnId(null);setCopySource({...t,type:'refund',splits:undefined,categoryId:t.categoryId??t.splits?.[0]?.categoryId,refundOf:t.id,date:todayKey()});setShowTxn(true);}}>Record refund</button>}<button className="btn btn-secondary btn-small" onClick={()=>{setEditingTxnId(t.id);setShowTxn(true);}}>Edit</button><button className="btn btn-ghost btn-small" onClick={()=>safely(()=>t.archived ? controller.setTxnArchived(t.id,false) : setExcludeTarget(t))}>{t.archived ? 'Include again' : 'Exclude from calculations'}</button></>;
  const editingTxn = editingTxnId ? snap.txns.find(t=>t.id===editingTxnId) : copySource??undefined;

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Transactions</h1>{!narrow&&<p className="field-help">Keyboard: Ctrl/Command+K to search; Ctrl/Command+Alt+N to record. Available outside text fields and dialogs.</p>}
          <label className="label" htmlFor="history-search">Search full history</label><input className="input" type="search" id="history-search" aria-keyshortcuts="Control+K Meta+K" placeholder="Notes, categories or accounts" value={query.text??''} onChange={e=>{setQuery(q=>({...q,text:e.target.value}));setMonthFilter('all');}}/><details className="txn-filters" open={!narrow}><summary>Filters · {monthFilter==='current'?'Current month':'All transactions'}</summary><div className="screen-sub" style={{display:'flex', gap:'16px', flexWrap:'wrap', alignItems:'center'}}>
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
                <option value="transfer">Transfer</option><option value="refund">Refund</option>
              </select>
            </div>
            <div className="field" style={{margin:0, minWidth:'180px'}}>
              <label htmlFor="txn-account-filter" className="label" style={{fontSize:'12px'}}>Account</label>
              <select id="txn-account-filter" className="select" value={accountFilter} onChange={e=>setAccountFilter(e.target.value)} style={{marginTop:'4px'}}>
                <option value="all">All accounts</option>
                {activeAccounts.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          <div className="field"><label className="label" htmlFor="history-category">Category</label><select className="select" id="history-category" value={query.categoryId??''} onChange={e=>setQuery(q=>({...q,categoryId:e.target.value}))}><option value="">All categories</option>{snap.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="form-row"><div className="field"><label className="label" htmlFor="history-from">From</label><input className="input" type="date" id="history-from" value={query.from??''} onChange={e=>{setQuery(q=>({...q,from:e.target.value}));setMonthFilter('all');}}/></div><div className="field"><label className="label" htmlFor="history-to">Through</label><input className="input" type="date" id="history-to" value={query.to??''} onChange={e=>{setQuery(q=>({...q,to:e.target.value}));setMonthFilter('all');}}/></div></div><div className="form-row"><div className="field"><label className="label" htmlFor="history-min">Minimum amount</label><input className="input" inputMode="decimal" id="history-min" value={minimum} onChange={e=>setMinimum(e.target.value)}/></div><div className="field"><label className="label" htmlFor="history-max">Maximum amount</label><input className="input" inputMode="decimal" id="history-max" value={maximum} onChange={e=>setMaximum(e.target.value)}/></div></div><div className="field"><label className="label" htmlFor="history-sort">Sort</label><select className="select" id="history-sort" value={query.sort??'date-desc'} onChange={e=>setQuery(q=>({...q,sort:e.target.value as HistoryQuery['sort']}))}>{[['date-desc','Newest first'],['date-asc','Oldest first'],['amount-desc','Largest amount'],['amount-asc','Smallest amount'],['category','Category'],['account','Account']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div><button className="btn btn-ghost" onClick={()=>{setQuery({});setMinimum('');setMaximum('');setFilterArchived(false);setMonthFilter('current');setTypeFilter('all');setAccountFilter('all');}}>Clear filters</button></details>
        </div>
        <div className="screen-actions">
          <button className="btn btn-secondary" onClick={()=>setShowCats(true)}>Manage categories</button>
          <button className="btn btn-primary" aria-keyshortcuts="Control+Alt+N Meta+Alt+N" title="New transaction (Ctrl/Command+Alt+N, outside text fields)" onClick={()=>{ setEditingTxnId(null);setCopySource(null); setShowTxn(true); }}>New transaction</button>
        </div>
      </div>
      
      <div className="card">{(filterError||actionError)&&<p role="alert">{filterError||actionError}</p>}
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
                  const catName = t.splits?'Split purchase':t.categoryId ? snap.categories.find(c=>c.id===t.categoryId)?.name : null;
                  const noteSnippet = t.note ? (t.note.length>50 ? t.note.slice(0,50)+'…' : t.note) : '';
                  return (
                  <tr key={t.id}>
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
                    <td><div className="action-row">{actions(t)}</div></td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {narrow && <div className="mobile-data">{filteredTxns.slice(0,shown).map(t=><details className="mobile-record" key={t.id}><summary><span><strong>{flow(t)}</strong><span className="record-meta">{dateLabel(t.date)} · {t.type}{t.archived && ' · excluded'}</span>{t.type!=='transfer' && <span className="record-meta">{snap.accounts.find(a=>a.id===t.accountId)?.name}</span>}</span><span className="amount">{money(t.amount)}</span></summary><div className="record-detail">{t.splits&&<ul>{t.splits.map(split=><li key={split.categoryId}>{snap.categories.find(c=>c.id===split.categoryId)?.name} · {money(split.amount)}</li>)}</ul>}{t.note && <p>{t.note}</p>}<div className="action-row">{actions(t)}</div></div></details>)}</div>}
      {shown < filteredTxns.length && <button className="btn btn-secondary" onClick={()=>setShown(n=>n+100)}>Load more transactions</button>}
      {excludeTarget && <Modal open title="Exclude this transaction?" onClose={()=>setExcludeTarget(null)}><p>{flow(excludeTarget)} · {money(excludeTarget.amount)}</p><p>This record will remain, but balances and reports may change. You can include it again later.</p><div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setExcludeTarget(null)}>Cancel</button><button className="btn btn-danger" onClick={()=>{safely(()=>{controller.setTxnArchived(excludeTarget.id,true);setExcludeTarget(null);});}}>Exclude transaction</button></div></Modal>}
      <Modal open={showTxn} onClose={()=>{ setShowTxn(false); setEditingTxnId(null);setCopySource(null); }} title={editingTxnId ? 'Edit transaction' : 'New transaction'}>
        <TransactionForm
          onClose={()=>{ setShowTxn(false); setEditingTxnId(null); }}
          editingTxnId={editingTxnId ?? undefined}
          initial={editingTxn ? {
            type: editingTxn.type,
            splits:editingTxn.splits,refundOf:editingTxn.refundOf,
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
        <CategoryManager />
      </Modal>
    </div>
  );
}
