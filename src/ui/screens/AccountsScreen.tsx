import { EntryDialog as Modal } from '../components/EntryDialog';
import { useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { formatMinor, INR } from '../../domain/money.js';
import { AccountForm } from '../forms/AccountForm.js';


export function AccountsScreen({startCreate=false}:{startCreate?:boolean} = {}) {
  const { controller, controllerRevision } = useSession();
  const [showAdd, setShowAdd] = useState(startCreate);
  const [showEdit, setShowEdit] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  void controllerRevision;
  if (!controller) return null;
  const { accounts: allAccounts, balances, consolidated: activeConsolidated } = controller.getAccountBalances(false);
  const displayAccounts = showArchived ? allAccounts : allAccounts.filter(a => !a.archived);
  const fmt = (n:number) => formatMinor(n, {symbol: INR.symbol, minorDigits: INR.minorDigits, indianGrouping: INR.indianGrouping});
  const consolidated = activeConsolidated;

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Accounts</h1>
          <div className="screen-sub">
            Active account total: {fmt(consolidated)}
            <span style={{ marginLeft: 12 }}>
              <label htmlFor="show-archived-accounts" className="checkbox-label">
                <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} id="show-archived-accounts" />
                <span>Show archived</span>
              </label>
            </span>
          </div>
        </div>
        <div className="screen-actions"><button className="btn btn-primary" onClick={()=>setShowAdd(true)}>Add account</button></div>
      </div>
      <p className="scope-note">Opening balances plus included transactions. Archived accounts are excluded from the active total. Separate Debt records are not deducted. This is not net worth or available spending money.</p>
      <div className="card">
        {displayAccounts.length===0 ? (
          <div className="empty-state">
            
            <h3>No accounts</h3>
            <p>Create an account to track balances and transactions.</p>
          </div>
        ) : (
          <div className="list">
            {displayAccounts.map(a => {
              const bal = balances.get(a.id) ?? 0;
              const archived = a.archived;
              return (
                <div className="list-row" key={a.id} style={{ opacity: archived ? 0.6 : 1, textDecoration: archived ? 'line-through' : 'none' }}>
                  <div className="list-row-main" onClick={() => setShowEdit(a.id)} style={{ cursor: 'pointer' }}>
                    <div className="list-row-title" style={{ textDecoration: archived ? 'line-through' : 'none' }}>{a.name}</div>
                    <div className="list-row-sub">{a.type}{a.color ? <span style={{ marginLeft: 8 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: a.color, verticalAlign: 'middle' }} /></span> : null}</div>
                  </div>
                  <div className="amount" style={{ textDecoration: archived ? 'line-through' : 'none' }}>{fmt(bal)}</div>
                  <div>
                    {archived ? (
                      <button className="btn btn-small btn-secondary" onClick={(e)=>{ e.stopPropagation(); controller.setAccountArchived(a.id, false); }}>Restore</button>
                    ) : (
                      <>
                        <button className="btn btn-small btn-secondary" onClick={(e)=>{ e.stopPropagation(); setShowEdit(a.id); }}>Edit</button>
                        <button className="btn btn-small btn-secondary" onClick={(e)=>{ e.stopPropagation(); controller.setAccountArchived(a.id, true); }}>Archive</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="New account">
        <AccountForm onClose={()=>setShowAdd(false)} />
      </Modal>
      <Modal open={!!showEdit} onClose={()=>setShowEdit(null)} title="Edit account">
        {showEdit ? (
          (() => {
            const acc = allAccounts.find(a => a.id === showEdit);
            if (!acc) return null;
            return <AccountForm
              onClose={()=>setShowEdit(null)}
              editingAccountId={acc.id}
              initialName={acc.name}
              initialType={acc.type}
              initialOpeningBalanceMinor={acc.openingBalance}
            />;
          })()
        ) : null}
      </Modal>
    </div>
  );
}
