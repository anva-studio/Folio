import {useEffect, useState} from 'react';
import {Capacitor, registerPlugin} from '@capacitor/core';

const privacy = registerPlugin<{captureProtection(options: {enabled?: boolean}): Promise<{enabled: boolean}>}>('FolioAppearance');

export function CaptureProtection() {
  const [enabled, setEnabled] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let active = true;
    void privacy.captureProtection({}).then(result => {if(active)setEnabled(result.enabled);}).catch(()=>{if(active)setError('Screenshot protection could not be read.');});
    return () => {active=false;};
  }, []);
  if (Capacitor.getPlatform() !== 'android') return null;
  return <section>
    <label className="checkbox-label"><input type="checkbox" checked={enabled??false} disabled={enabled===undefined||busy} onChange={e=>{
      const value=e.target.checked;
      setBusy(true);setError('');
      void privacy.captureProtection({enabled:value}).then(result=>setEnabled(result.enabled)).catch(()=>setError('Screenshot protection could not be changed.')).finally(()=>setBusy(false));
    }}/><span>Block screenshots and screen sharing on Android</span></label>
    <p className="field-help">Optional and off by default. Applies to all Folio screens on this installation, including recovery. Turn it off before taking a support screenshot. System and device limitations still apply.</p>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
