import {AccountBalanceHistory} from '../components/AccountBalanceHistory';
import {BalanceCheckForm} from '../forms/BalanceCheckForm';
import {navigate} from '../navigation';
import {usePresentation} from '../usePresentation';
import { EntryDialog as Modal } from '../components/EntryDialog';
import { useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';

import { AccountForm } from '../forms/AccountForm.js';


export function AccountsScreen({startCreate=false,startArchived=false}:{startCreate?:boolean;startArchived?:boolean} = {}) {
  const {money}=usePresentation();
  const { controller, controllerRevision } = useSession();
  const [historyAccount,setHistoryAccount]=useState<string|null>(null);
  const [checkAccount,setCheckAccount]=useState<string|null>(null);
  const [showAdd, setShowAdd] = useState(startCreate);
  const [showEdit, setShowEdit] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(startArchived);
  void controllerRevision;
  if (!controller) return null;
  const { accounts: allAccounts, balances } = controller.getAccountBalances(false);
  const displayAccounts = showArchived ? allAccounts : allAccounts.filter(a => !a.archived);
  const fmt = money;
  const consolidated = controller.getAccountBalances(true).consolidated;

  return (
    <div className="accounts-screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Accounts</h1>
        </div>
        <div className="screen-actions"><button className="btn btn-primary" onClick={()=>setShowAdd(true)}>Add account</button></div>
      </div>
      <section className="account-summary" aria-label="Active account total"><span>Active account total</span><strong className="amount">{fmt(consolidated)}</strong></section>
      <div className="accounts-toolbar"><label htmlFor="show-archived-accounts" className="checkbox-label"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} id="show-archived-accounts" /><span>Show archived</span></label></div>
      <details className="balance-explanation"><summary>How this total is calculated</summary><p className="scope-note">Opening balances plus included transactions and explicit balance adjustments. Archived accounts are excluded from the active total. Separate Debt records are not deducted. This is not net worth or available spending money.</p></details>
      <div className="card accounts-card">
        {displayAccounts.length===0 ? (
          <div className="empty-state">
            
            <h3>No accounts</h3>
            <p>Create an account to track balances and transactions.</p>
          </div>
        ) : (
          <div className="list account-list">
            {displayAccounts.map(a => {
              const bal = balances.get(a.id) ?? 0;
              const archived = a.archived;
              return (
                <div className="list-row account-item" key={a.id} style={{ opacity: archived ? 0.6 : 1 }}>
                  <div className="list-row-main">
                    <div className="list-row-title" style={{ textDecoration: archived ? 'line-through' : 'none' }}>{a.name}</div>
                    <div className="list-row-sub">{a.type}{a.color ? <span style={{ marginLeft: 8 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: a.color, verticalAlign: 'middle' }} /></span> : null}</div>
                  </div>
                  <div className="amount" style={{ textDecoration: archived ? 'line-through' : 'none' }}>{fmt(bal)}</div>
                  <div className="account-actions"><button className="btn btn-small btn-secondary" onClick={()=>navigate('transactions','account',a.id)}>Transactions</button><button className="btn btn-small btn-secondary" onClick={()=>setHistoryAccount(a.id)}>Balance history</button>{!archived&&<button className="btn btn-small btn-secondary" onClick={()=>setCheckAccount(a.id)}>Balance check</button>}
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
      <Modal open={!!historyAccount} onClose={()=>setHistoryAccount(null)} title="Balance history">{historyAccount&&<AccountBalanceHistory accountId={historyAccount}/>}</Modal><Modal open={!!checkAccount} onClose={()=>setCheckAccount(null)} title="Balance check">{checkAccount&&<BalanceCheckForm accountId={checkAccount}/>}</Modal><Modal open={showAdd} onClose={()=>setShowAdd(false)} title="New account">
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
