import {useEffect,useRef,useState} from 'react';
import {useProduct} from '../../application/productNavigation';
import {defaultReminderPreferences,readReminders,saveReminders,remindersSupported,openReminderSettings,type ReminderState} from '../../application/nativeReminders';
import {usePresentation} from '../usePresentation';

export function ReminderSettings(){
  const product=useProduct(),{currency}=usePresentation(),supported=remindersSupported();
  const [state,setState]=useState<ReminderState>(),[commitments,setCommitments]=useState(false),[backups,setBackups]=useState(false),[weekday,setWeekday]=useState(0),[time,setTime]=useState('18:00'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const mounted=useRef(true),saving=useRef(false);
  const apply=(value:ReminderState)=>{setState(value);setCommitments(value.commitments);setBackups(value.backups);setWeekday(value.weekday);setTime(String(value.hour).padStart(2,'0')+':'+String(value.minute).padStart(2,'0'));};
  const refresh=async()=>{try{const value=await readReminders();if(mounted.current)apply(value);}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Could not read local reminders.');}};
  useEffect(()=>{mounted.current=true;if(supported&&!product.example)void refresh();return()=>{mounted.current=false;};},[supported,product.example]);
  const save=async(off=false)=>{
    if(saving.current)return;setError('');setStatus('');let hour:number,minute:number;
    if(off){hour=state?.hour??defaultReminderPreferences.hour;minute=state?.minute??defaultReminderPreferences.minute;}
    else{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){setError('Choose a local time using hours and minutes.');return;}[hour,minute]=time.split(':').map(Number);}
    saving.current=true;setBusy(true);
    try{const value=await saveReminders({commitments:off?false:commitments,backups:off?false:backups,weekday:off?(state?.weekday??0):weekday,hour,minute});if(mounted.current){apply(value);setStatus(value.commitments||value.backups?'Weekly review reminders scheduled on this device. Android may delay delivery.':'Local reminders are off.');}}
    catch(e){if(mounted.current){setError(e instanceof Error?e.message:'Reminder settings could not be saved.');await refresh();}}
    finally{saving.current=false;if(mounted.current)setBusy(false);}
  };
  return <section className="card"><h2 className="card-title">Local review reminders</h2>{product.example?<p>Configure device reminders from a personal profile. Experiments in this public example do not enable device alerts.</p>:!supported?<p>Scheduled local reminders are available in the Android app. This desktop/browser build does not schedule alerts while closed. Your finance and backup tools remain available here.</p>:<>
    <p>Optional, device-wide weekly prompts to review commitments or backups. They apply to Folio as a whole, not one profile. Notifications contain no account names, amounts, balances or profile details.</p>
    {!state&&!error&&<p role="status">Reading reminder preferences…</p>}
    <fieldset disabled={busy||!state}><legend className="label">Remind me to review</legend><div className="reminder-options"><label className="checkbox-label"><input type="checkbox" checked={commitments} onChange={e=>{setCommitments(e.target.checked);setStatus('');}}/><span>Planned commitments</span></label><label className="checkbox-label"><input type="checkbox" checked={backups} onChange={e=>{setBackups(e.target.checked);setStatus('');}}/><span>Encrypted backups</span></label></div><div className="form-row"><div className="field"><label className="label" htmlFor="reminder-weekday">Weekly reminder day</label><select className="select" id="reminder-weekday" value={weekday} onChange={e=>{setWeekday(Number(e.target.value));setStatus('');}}>{Array.from({length:7},(_,i)=>(i+(currency.firstDayOfWeek??1))%7).map(day=><option key={day} value={day}>{new Intl.DateTimeFormat(currency.locale??'en',{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,10,1+day)))}</option>)}</select></div><div className="field"><label className="label" htmlFor="reminder-time">Around this local time</label><input className="input" id="reminder-time" type="time" step={60} value={time} onChange={e=>{setTime(e.target.value);setStatus('');}}/></div></div><div className="action-row"><button type="button" className="btn btn-primary" onClick={()=>void save()}>{busy?'Saving reminder preferences…':'Save reminder preferences'}</button><button type="button" className="btn btn-secondary" onClick={()=>void save(true)}>Turn off all reminders</button></div></fieldset>
    <p className="field-help">Off by default. Saving enabled reminders may ask Android for notification permission. These are gentle review prompts, not per-bill deadlines or paid/unpaid alerts. Android may delay them under battery restrictions; missed prompts are not replayed in a burst.</p>
    {state&&!state.notificationsAllowed&&(state.commitments||state.backups)&&<p>Android is blocking these notifications. Open Android settings to allow them, or turn the reminders off here.</p>}
    <button type="button" className="link-btn" disabled={busy} onClick={()=>{void openReminderSettings().then(()=>{if(mounted.current)setStatus('Return here and refresh after changing Android notification settings.');}).catch(e=>{if(mounted.current)setError(e instanceof Error?e.message:'Android settings could not open.');});}}>Android notification settings</button> <button type="button" className="link-btn" disabled={busy} onClick={()=>{setError('');void refresh();}}>Refresh reminder status</button>
    <p className="field-help">No server, internet connection or unlocked vault is used for delivery. Only reminder choices/timing are stored in app-private device preferences; they are separate from encrypted profile backups. Uninstalling or force-stopping Folio can remove or pause reminders. A notification also offers “Turn off reminders.”</p>{error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
  </>}</section>;
}
