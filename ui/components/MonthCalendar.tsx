import { useEffect, useRef, useState } from 'react';
import { monthCalendar } from '../../domain/monthCalendar';
import { todayKey } from '../../domain/dates';
import { usePresentation } from '../usePresentation';

export function MonthCalendar({month,expectedCounts,recordedCounts,selected,onSelect}:{month:string;expectedCounts:ReadonlyMap<string,number>;recordedCounts:ReadonlyMap<string,number>;selected?:string;onSelect:(date?:string)=>void}) {
  const {currency,dateLabel,monthLabel}=usePresentation(),weekStart=currency.firstDayOfWeek??1;
  const layout=monthCalendar(month,weekStart),table=useRef<HTMLTableElement>(null);
  const initial=()=>selected??(todayKey().startsWith(month)?todayKey():month+'-01');
  const [focus,setFocus]=useState(initial);
  useEffect(()=>{setFocus(initial());},[month,selected]);
  const weekday=(day:number,style:'short'|'long')=>new Intl.DateTimeFormat(currency.locale??'en',{weekday:style,timeZone:'UTC'}).format(new Date(Date.UTC(2026,10,1+day)));
  const move=(date:string,key:string)=>{
    const day=Number(date.slice(-2)),position=(new Date(date+'T00:00:00Z').getUTCDay()-weekStart+7)%7;
    const shift=key==='ArrowLeft'?-1:key==='ArrowRight'?1:key==='ArrowUp'?-7:key==='ArrowDown'?7:key==='Home'?-position:key==='End'?6-position:0;
    const next=month+'-'+String(Math.min(layout.days,Math.max(1,day+shift))).padStart(2,'0');
    setFocus(next);table.current?.querySelector<HTMLButtonElement>(`button[data-date="${next}"]`)?.focus();
  };
  return <section className="month-calendar" aria-label={monthLabel(month)+' activity calendar'}><p className="field-help">P = scheduled entries, including earlier matching or skip decisions; R = recorded transactions. Counts stay separate and do not imply a payment is missing. Select a date to filter the lists below.</p><table ref={table}><caption>{monthLabel(month)}</caption><thead><tr>{layout.weekdays.map(day=><th scope="col" key={day}><abbr title={weekday(day,'long')}>{weekday(day,'short')}</abbr></th>)}</tr></thead><tbody>{layout.weeks.map((week,i)=><tr key={i}>{week.map((date,j)=><td key={date??'empty-'+j}>{date&&<button type="button" data-date={date} tabIndex={focus===date?0:-1} aria-pressed={selected===date} aria-current={date===todayKey()?'date':undefined} aria-label={`${dateLabel(date)} · ${expectedCounts.get(date)??0} scheduled entries · ${recordedCounts.get(date)??0} recorded transactions`} onFocus={()=>setFocus(date)} onClick={()=>onSelect(selected===date?undefined:date)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();move(date,e.key);}}}><span>{Number(date.slice(-2))}</span><span className="calendar-counts">{expectedCounts.has(date)&&<span>P{expectedCounts.get(date)!>999?'999+':expectedCounts.get(date)}</span>}{recordedCounts.has(date)&&<span>R{recordedCounts.get(date)!>999?'999+':recordedCounts.get(date)}</span>}</span></button>}</td>)}</tr>)}</tbody></table><button type="button" className="btn btn-small btn-secondary" disabled={!selected} onClick={()=>onSelect(undefined)}>Show all dates</button></section>;
}
