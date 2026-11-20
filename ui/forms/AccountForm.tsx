import {usePresentation} from '../usePresentation';
import { useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';


type AccountType = 'cash'|'bank'|'investment'|'credit'|'other';

export function AccountForm({ onClose, editingAccountId, initialName, initialType, initialOpeningBalanceMinor }: {
  onClose: () => void;
  editingAccountId?: string;
  initialName?: string;
  initialType?: AccountType;
  initialOpeningBalanceMinor?: number;
}) {
  const {currency,parseAmount,inputAmount}=usePresentation();
  const { controller } = useSession();
  if (!controller) return null;
  const [name, setName] = useState(initialName ?? '');
  const [color,setColor]=useState(()=>controller.snapshot.accounts.find(a=>a.id===editingAccountId)?.color??'');
  const [type, setType] = useState<AccountType>(initialType ?? 'bank');
  const formatInput = (minor?:number) => minor===undefined?'':inputAmount(minor);
  const [balance, setBalance] = useState(() => {
    if (initialOpeningBalanceMinor !== undefined) {
      return formatInput(initialOpeningBalanceMinor);
    }
    return '';
  });
  const [errorField,setErrorField]=useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let field='account-name';
    try {
      if (!name.trim()) throw new Error('Account name is required');
      field='account-opening-balance';
      const minor = parseAmount(balance);
      if (!Number.isFinite(minor)) throw new Error('Opening balance must be a valid number');
      if (editingAccountId) {
        controller.editAccount(editingAccountId, { name: name.trim(), type, openingBalance: minor,color:color||undefined });
      } else {
        controller.createAccount({ name: name.trim(), type, openingBalance: minor,color:color||undefined });
      }
      onClose();
    } catch (e:any) { setError(e.message);setErrorField(field); document.getElementById(field)?.focus(); }
  };

  return (
    <form onSubmit={submit}>
      <div className="field"><label htmlFor="account-name" className="label">Name</label><input id="account-name" aria-invalid={errorField==='account-name'} aria-describedby={errorField==='account-name'?'account-error':undefined} className="input" value={name} onChange={e=>setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="account-type" className="label">Type</label>
        <select id="account-type" aria-invalid={errorField==='account-type'} aria-describedby={errorField==='account-type'?'account-error':undefined} className="select" value={type} onChange={e=>setType(e.target.value as any)}>
          {['cash','bank','investment','credit','other'].map(t=> <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="account-opening-balance" className="label">Opening balance</label>
        <div className="input-money"><span className="currency-prefix">{currency.symbol}</span><input inputMode="decimal" id="account-opening-balance" aria-invalid={errorField==='account-opening-balance'} aria-describedby={errorField==='account-opening-balance'?'account-error':undefined} value={balance} onChange={e=>setBalance(e.target.value)} placeholder="0.00" /></div>
      </div>
      <div className="field"><label className="label" htmlFor="account-color">Account color (optional)</label><input id="account-color" type="color" value={color||'#426b69'} onChange={e=>setColor(e.target.value)}/>{color&&<button type="button" className="btn btn-secondary" onClick={()=>setColor('')}>Remove color</button>}</div>
      <p className="field-help">Enter the balance where you will start recording. Do not also enter transactions already included in this balance.</p>
      {error && <div id="account-error" role="alert" className="field-error">{error}</div>}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="submit">{editingAccountId ? 'Save' : 'Create'}</button>
      </div>
    </form>
  );
}
