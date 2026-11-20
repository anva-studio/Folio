import {useProduct} from '../../application/productNavigation';
import { useEffect,useMemo,useRef,useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { usePresentation } from '../usePresentation';
import type { AssumptionKey } from '../../domain/financialRecords';
export function SharedAssumptions({ values, onLoad }: {
    values: Partial<Record<AssumptionKey, number | undefined | null>>;
    onLoad: (values: Partial<Record<AssumptionKey, number>>) => void;
}) {
    const product=useProduct();
    const { controller,controllerRevision,session } = useSession(), { money } = usePresentation();
    const snapshot=useMemo(()=>controller?.snapshot,[controller,controllerRevision]);
    const [status, setStatus] = useState(''), [error, setError] = useState('');
    const [busy,setBusy]=useState(false),committing=useRef(false),mounted=useRef(true);
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
    if (!controller||!session)
        return null;
    const keys = Object.keys(values) as AssumptionKey[], saved = (snapshot?.financial?.assumptions ?? []).filter(a => keys.includes(a.key)), valid = keys.length > 0 && keys.every(key => Number.isSafeInteger(values[key]));
    const labels: Record<AssumptionKey, string> = { liquidFunds: 'Current liquid funds', monthlyIncome: 'Typical monthly income', monthlyExpenses: 'Typical monthly expenses', annualIncome: 'Annual income', emergencyReserve: 'Reserve amount', monthlySurplus: 'Monthly planning amount' };
    return <details className="planning-assumptions"><summary>Shared planning assumptions</summary><p>{product.example?'Fictional estimates stored in the public example sandbox, not your financial assumptions.':'Explicit estimates, encrypted with this profile. They survive locking and reopening.'} Saving confirms these values as assumptions; it does not record money or verify that recorded helper figures represent a typical month.</p>{saved.length ? saved.map(a => <p key={a.key}>{labels[a.key]}: <strong className="amount">{money(a.value)}</strong> · {a.scope.replaceAll('-', ' ')} · confirmed {a.reviewedAt.slice(0, 10)} <button className="link-btn" disabled={busy} onClick={() => controller.removePlanningAssumption(a.key)}>Forget {labels[a.key].toLowerCase()}</button></p>) : <p>No shared values saved for these inputs. Missing information is not zero.</p>}<div className="action-row"><button type="button" className="btn btn-secondary" disabled={busy||!saved.length} onClick={() => { onLoad(Object.fromEntries(saved.map(a => [a.key, a.value]))); setStatus('Saved assumptions loaded explicitly.'); }}>Use saved assumptions</button><button type="button" className="btn btn-secondary" disabled={busy||!valid} onClick={async()=>{
      if(committing.current)return;committing.current=true;setBusy(true);setStatus('');setError('');
      try{controller.savePlanningAssumptions(values as Partial<Record<AssumptionKey,number>>);await session.flush();if(mounted.current)setStatus('Planning assumptions saved. Actual records are unchanged.');}
      catch(e){if(mounted.current)setError('Saving has not been confirmed. Retry these assumptions or use Folio’s save recovery controls. '+(e instanceof Error?e.message:'Could not save assumptions'));}
      finally{committing.current=false;if(mounted.current)setBusy(false);}
    }}>{busy?'Saving assumptions…':'Save these shared assumptions'}</button></div><p className="field-help">Uses profile format 2. Folio never silently replaces your estimates with inferred figures.</p>{error && <p role="alert">{error}</p>}<p role="status">{status}</p></details>;
}
