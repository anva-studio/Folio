import { useNarrowScreen } from '../hooks/useNarrowScreen';
import { EntryDialog as Modal } from '../components/EntryDialog';
import { useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { formatMinor, INR } from '../../domain/money.js';
import { RecurringForm } from '../forms/RecurringForm.js';


const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function scheduleSummary(r: any) {
  if (r.frequency === 'weekly') {
    const w = weekdayNames[r.dayOfWeek ?? 0];
    return `Every week on ${w}`;
  }
  const d = r.dayOfMonth ?? 1;
  return r.frequency==='quarterly'?`Every 3 months on day ${d}`:r.frequency==='yearly'?`Every year on day ${d} of the start month`:`Day ${d} of month`;
}

export function RecurringScreen() {
  const narrow = useNarrowScreen();
  const { controller, controllerRevision } = useSession();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  void controllerRevision;
  if (!controller) return null;
  const snap = controller.snapshot;
  const fmt = (n:number)=>formatMinor(n, {symbol: INR.symbol, minorDigits: INR.minorDigits, indianGrouping: INR.indianGrouping});

  const accountMap = useMemo(()=>new Map(snap.accounts.map(a=>[a.id, a.name])), [snap.accounts]);
  const categoryMap = useMemo(()=>new Map(snap.categories.map(c=>[c.id, c.name])), [snap.categories]);

  const handleEdit = (r: any) => { setEditingId(r.id); };
  const handleCloseEdit = () => setEditingId(null);
  const handleToggleActive = (id: string, active: boolean) => { controller.setRecurringActive(id, !active); };
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const handleDelete = (id: string) => { setConfirmDeleteId(id); };

  const editingRecurring = editingId ? snap.recurring.find(r=>r.id===editingId) : null;

  return (
    <div>
      <div className="screen-header">
        <div><h1 className="screen-title">Scheduled</h1></div>
        <div className="screen-actions"><button className="btn btn-primary" onClick={()=>setShowCreate(true)}>Add schedule</button></div>
      </div>
      <p className="scope-note">Schedules do not move money or tell you whether a payment happened. Scheduled totals cover the whole selected month.</p>
      <div className={narrow && snap.recurring.length ? 'schedule-list' : 'card'}>
        {snap.recurring.length===0 ? (
          <div className="empty-state">
            
            <h3>No schedules yet</h3>
            <p>Schedules describe expected income and expenses. Record actual transactions separately.</p>
          </div>
        ) : (
          !narrow && <div className="table-wrap desktop-data">
            <table>
              <thead><tr><th>Name</th><th>Kind</th><th>Amount</th><th>Frequency</th><th>Schedule</th><th>Active</th><th>Linked account</th><th>Category</th><th>Start date</th><th>End date</th><th>Actions</th></tr></thead>
              <tbody>
                {snap.recurring.map(r=>(
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.kind}</td>
                    <td className="num">{fmt(r.amount)}</td>
                    <td>{r.frequency}</td>
                    <td>{scheduleSummary(r)}</td>
                    <td>{r.active ? 'Active' : 'Inactive'}</td>
                    <td>{r.accountId ? accountMap.get(r.accountId) ?? '' : ''}</td>
                    <td>{r.categoryId ? categoryMap.get(r.categoryId) ?? '' : ''}</td>
                    <td>{r.startDate}</td>
                    <td>{r.endDate ?? ''}</td>
                    <td>
                      <div className="action-row">
                        <button className="btn btn-secondary" onClick={()=>handleEdit(r)}>Edit</button>
                        <button className="btn btn-secondary" onClick={()=>handleToggleActive(r.id, r.active)}>{r.active ? 'Deactivate' : 'Activate'}</button>
                        <button className="btn btn-secondary" onClick={()=>handleDelete(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {narrow && <div className="mobile-data">{snap.recurring.map(r=><details className="mobile-record" key={r.id}><summary><span><strong>{r.name}</strong><span className="record-meta">{scheduleSummary(r)} · {r.frequency} · {r.active ? 'Active' : 'Inactive'}</span></span><span className="amount">{fmt(r.amount)}</span></summary><div className="record-detail"><p>{r.kind} · {accountMap.get(r.accountId ?? '') || 'No linked account'} · {categoryMap.get(r.categoryId ?? '') || 'No category'}</p><p>{r.startDate} — {r.endDate || 'No end date'}</p><div className="action-row"><button className="btn btn-secondary" onClick={()=>handleEdit(r)}>Edit</button><button className="btn btn-ghost" onClick={()=>handleToggleActive(r.id,r.active)}>{r.active?'Deactivate':'Activate'}</button><button className="btn btn-ghost" onClick={()=>handleDelete(r.id)}>Delete</button></div></div></details>)}</div>}
      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="New schedule">
        <RecurringForm onClose={()=>setShowCreate(false)} />
      </Modal>
      <Modal open={!!editingId} onClose={handleCloseEdit} title="Edit schedule">
        {editingRecurring && <RecurringForm onClose={handleCloseEdit} editingRecurringId={editingRecurring.id} initial={editingRecurring} />}
      </Modal>
      <Modal open={!!confirmDeleteId} onClose={()=>setConfirmDeleteId(null)} title="Delete schedule">
        <p>Delete this schedule?</p>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={()=>setConfirmDeleteId(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={()=>{ if (confirmDeleteId) { controller.deleteRecurring(confirmDeleteId); setConfirmDeleteId(null); } }}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
