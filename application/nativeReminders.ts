import {Capacitor,registerPlugin} from '@capacitor/core';
export interface ReminderPreferences {commitments:boolean;backups:boolean;weekday:number;hour:number;minute:number}
export interface ReminderState extends ReminderPreferences {notificationsAllowed:boolean}
export const defaultReminderPreferences:ReminderPreferences={commitments:false,backups:false,weekday:0,hour:18,minute:0};
interface ReminderBridge {read():Promise<ReminderState>;configure(options:ReminderPreferences):Promise<ReminderState>;openSettings():Promise<void>}
let bridge:ReminderBridge|undefined;
export function remindersSupported(){return Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('FolioReminders');}
export function validateReminderPreferences(value:ReminderPreferences){
  if(typeof value.commitments!=='boolean'||typeof value.backups!=='boolean'||!Number.isInteger(value.weekday)||value.weekday<0||value.weekday>6||!Number.isInteger(value.hour)||value.hour<0||value.hour>23||!Number.isInteger(value.minute)||value.minute<0||value.minute>59)throw new Error('Choose valid reminder options, a weekday and a local time.');
  return {commitments:value.commitments,backups:value.backups,weekday:value.weekday,hour:value.hour,minute:value.minute};
}
function native(){if(!remindersSupported())throw new Error('Scheduled local reminders are available in the Android app.');return bridge??(bridge=registerPlugin<ReminderBridge>('FolioReminders'));}
function checked(value:ReminderState):ReminderState{if(typeof value.notificationsAllowed!=='boolean')throw new Error('Android reminder status could not be read.');return {...validateReminderPreferences(value),notificationsAllowed:value.notificationsAllowed};}
export async function readReminders(){return checked(await native().read());}
export async function saveReminders(value:ReminderPreferences){const options=validateReminderPreferences(value);return checked(await native().configure(options));}
export async function openReminderSettings(){await native().openSettings();}
