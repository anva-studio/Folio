import { daysInCalendarMonth, isValidMonthKey } from './dates';
export function monthCalendar(month:string, firstDayOfWeek:0|1|6=1) {
  if(!isValidMonthKey(month)||![0,1,6].includes(firstDayOfWeek))throw new Error('Invalid calendar month or week start');
  const [year,monthNumber]=month.split('-').map(Number),days=daysInCalendarMonth(year,monthNumber);
  const offset=(new Date(month+'-01T00:00:00Z').getUTCDay()-firstDayOfWeek+7)%7;
  const cells:(string|null)[]=Array(offset).fill(null);
  for(let day=1;day<=days;day++)cells.push(month+'-'+String(day).padStart(2,'0'));
  while(cells.length%7)cells.push(null);
  return {weekdays:Array.from({length:7},(_,i)=>(firstDayOfWeek+i)%7),weeks:Array.from({length:cells.length/7},(_,i)=>cells.slice(i*7,i*7+7)),days};
}
