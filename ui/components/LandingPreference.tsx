import {useState} from 'react';
import {useSession} from '../../application/FolioProvider';
import {getLandingModule,setLandingModule,LANDING_MODULES,type LandingModule} from '../../application/devicePreferences';
export function LandingPreference(){
  const {profileId}=useSession(),[value,setValue]=useState(()=>getLandingModule(profileId)),[error,setError]=useState('');
  if(!profileId)return null;
  return <section className="card"><h2 className="card-title">Start where you work</h2><label className="label" htmlFor="landing-module">View after unlocking</label><select className="select" id="landing-module" value={value} onChange={e=>{try{const next=e.target.value as LandingModule;setLandingModule(profileId,next);setValue(next);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not change landing view');}}}>{Object.entries(LANDING_MODULES).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select><p className="field-help">Applies on the next unlock of this profile on this device. Welcome and password protection remain in place. This device preference is separate from your financial data and encrypted backups.</p>{error&&<p role="alert">{error}</p>}</section>;
}
