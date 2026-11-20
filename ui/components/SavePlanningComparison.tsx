import {useProduct} from '../../application/productNavigation';
import {useEffect,useId,useRef,useState} from 'react';
import {useSession} from '../../application/FolioProvider';
import type {ComparisonSnapshot} from '../../domain/savedComparisons';

/** Flush before claiming durability; retry the same identity after a failed flush. */
export function SavePlanningComparison({snapshot}:{snapshot:ComparisonSnapshot}){
  const product=useProduct();
  const {controller,session}=useSession(),labelId=useId();
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
  const id=useRef<string|undefined>(undefined),committing=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  if(!controller||!session)return null;
  return <section className="notebook-section"><h4>Keep this comparison</h4><p>{product.example?'Save a fictional snapshot in the public example sandbox. Keep private financial information in a personal profile.':'Save an encrypted snapshot of these assumptions and source figures.'} Reopen, edit or delete it in Planner → Saved planning comparisons. It will not track later account or plan changes.</p><div className="field"><label className="label" htmlFor={labelId}>Comparison name</label><input className="input" id={labelId} maxLength={100} value={name} disabled={busy||saved} onChange={e=>setName(e.target.value)}/></div><button type="button" className="btn btn-secondary" disabled={busy||saved||!name.trim()} onClick={async()=>{
    if(committing.current)return;committing.current=true;setBusy(true);setError('');
    try{id.current=controller.savePlanningComparison(name,snapshot,id.current);await session.flush();if(mounted.current){setSaved(true);document.getElementById(labelId)?.dispatchEvent(new CustomEvent('folio:formSaved',{bubbles:true}));}}
    catch(e){if(mounted.current)setError((id.current?'The comparison is in memory, but saving has not been confirmed. Retry this same comparison or use Folio’s save recovery controls. ':'')+(e instanceof Error?e.message:'Could not save comparison.'));}
    finally{committing.current=false;if(mounted.current)setBusy(false);}
  }}>{busy?'Saving comparison…':saved?'Comparison saved':'Save named comparison'}</button>{saved&&<p role="status">Comparison saved with its captured assumptions. Recorded money and plans are unchanged.</p>}{error&&<p role="alert">{error}</p>}<p className="field-help">Uses profile format 2. Save an encrypted backup to preserve snapshots outside this device. The released 1.0.0 client cannot read this financial format.</p></section>;
}
