import { setAmountsHidden, useAmountsHidden } from '../privacyDisplay';
import {CaptureProtection} from './CaptureProtection';
export function PrivacyDisplayButton({onUsed,compact=false}:{onUsed?:()=>void;compact?:boolean}){
  const hidden=useAmountsHidden();
  const label=hidden?'Show amounts':'Hide amounts';
  return <button type="button" className={compact?'icon-btn':'btn btn-secondary'} aria-label={label} title={label} aria-pressed={hidden} onClick={()=>{setAmountsHidden(!hidden);onUsed?.();}}>{compact?<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{hidden&&<path d="m3 3 18 18"/>}</svg>:label}</button>;
}
export function PrivacyDisplaySettings(){
  const hidden=useAmountsHidden();
  return <section className="card"><h2 className="card-title">Privacy display</h2><label className="checkbox-label"><input type="checkbox" checked={hidden} onChange={e=>setAmountsHidden(e.target.checked)}/><span>Hide formatted financial amounts</span></label><p className="field-help">Masks displayed money amounts, including accessible amount text. Entry fields and exported files still contain actual values; notes, percentages and chart shapes remain visible. This is a presentation preference, not encryption or a profile lock. Use Lock when leaving Folio unattended. The preference is shared on this device, not stored in your financial records.</p><CaptureProtection/></section>;
}

