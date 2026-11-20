import { useEffect,useMemo,useRef,useState } from 'react';
import { useSession } from '../../application/FolioProvider';
import { usePresentation } from '../usePresentation';
import type { AffordabilityScenarioInput } from '../../domain/scenario';
export function SavedScenarios({ input, onLoad }: {
    input: AffordabilityScenarioInput | null;
    onLoad: (input: AffordabilityScenarioInput) => void;
}) {
    const { controller,controllerRevision,session } = useSession(), { money } = usePresentation();
    const snapshot=useMemo(()=>controller?.snapshot,[controller,controllerRevision]);
    const [name, setName] = useState(''), [editing, setEditing] = useState<string>(), [chosen, setChosen] = useState<string[]>([]), [error, setError] = useState('');
    const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),committing=useRef(false),mounted=useRef(true);
    useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
    if (!controller||!session)
        return null;
    const scenarios = snapshot?.financial?.scenarios ?? [];
    return <section className="card"><h2 className="card-title">Saved what-ifs</h2><p>Named scenarios are planning snapshots stored with this profile. Opening one replaces only Planner inputs, never real balances or goals.</p><div className="field"><label className="label" htmlFor="scenario-name">Scenario name</label><input className="input" id="scenario-name" maxLength={100} disabled={busy} value={name} onChange={e => setName(e.target.value)}/></div><button className="btn btn-secondary" disabled={busy||!input||!name.trim()} onClick={async()=>{
      if(!input||committing.current)return;committing.current=true;setBusy(true);setStatus('');setError('');
      try{const id=controller.saveScenario(name,input,editing);setEditing(id);await session.flush();if(mounted.current){setName('');setEditing(undefined);setStatus('Named scenario saved. Actual records are unchanged.');}}
      catch(e){if(mounted.current)setError('Saving has not been confirmed. Retry this scenario or use Folio’s save recovery controls. '+(e instanceof Error?e.message:'Could not save scenario'));}
      finally{committing.current=false;if(mounted.current)setBusy(false);}
    }}>{busy?'Saving scenario…':editing?'Update named scenario':'Save named scenario'}</button>{status&&<p role="status">{status}</p>}{scenarios.map(s => <div className="notebook-section" key={s.id}><h3>{s.name}</h3><p>Saved {s.reviewedAt.slice(0, 10)} · supplied funds {money(s.input.currentLiquidFunds)} · monthly amount {money(s.input.currentMonthlySurplus)}</p><div className="action-row"><button className="btn btn-secondary" disabled={busy} onClick={() => { onLoad(s.input); setEditing(s.id); setName(s.name); }}>Open scenario</button><button className="btn btn-ghost" disabled={busy} onClick={() => { controller.deleteScenario(s.id); if (editing === s.id) {
        setEditing(undefined);
        setName('');
    } setChosen(v => v.filter(id => id !== s.id)); }}>Delete scenario</button><label className="checkbox-label"><input type="checkbox" checked={chosen.includes(s.id)} disabled={!chosen.includes(s.id) && chosen.length >= 2} onChange={e => setChosen(v => e.target.checked ? [...v, s.id] : v.filter(id => id !== s.id))}/><span>Compare {s.name}</span></label></div></div>)}{chosen.length > 0 && <div className="grid grid-2">{chosen.map(id => { const s = scenarios.find(s => s.id === id); if (!s)
        return null; const result = controller.evaluateScenario(s.input); return <article className="card" key={id}><h3>{s.name}</h3><dl className="metric-list"><div><dt>Upfront cost</dt><dd>{money(s.input.upfrontCost)}</dd></div><div><dt>Added monthly cost</dt><dd>{money(s.input.addedMonthlyCost)}</dd></div><div><dt>Reserve assumption</dt><dd>{money(s.input.emergencyReserve)}</dd></div><div><dt>Funds after purchase</dt><dd>{money(result.postPurchaseLiquidFunds)}</dd></div><div><dt>Monthly amount after costs</dt><dd>{money(result.postScenarioMonthlySurplus)}</dd></div><div><dt>Reserve shortfall</dt><dd>{money(result.reserveShortfall)}</dd></div></dl><p>{s.input.horizonMonths ?? 12}-month scenario. No future outcome is guaranteed.</p></article>; })}</div>}{error && <p role="alert">{error}</p>}</section>;
}
