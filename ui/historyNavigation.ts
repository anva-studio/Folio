import {isValidDate} from '../domain/dates';
import {navigate} from './navigation';
export interface HistoryRange {from:string;to:string;categoryId?:string}
export function parseHistoryRange(value?:string):HistoryRange|undefined{
  if(!value)return undefined;
  try{const parsed=JSON.parse(value);if(!parsed||typeof parsed.from!=='string'||typeof parsed.to!=='string'||!isValidDate(parsed.from)||!isValidDate(parsed.to)||parsed.from>parsed.to||parsed.categoryId!==undefined&&typeof parsed.categoryId!=='string')return undefined;
    return {from:parsed.from,to:parsed.to,...(parsed.categoryId?{categoryId:parsed.categoryId}:{})};
  }catch{return undefined;}
}
export function navigateHistory(range:HistoryRange){const checked=parseHistoryRange(JSON.stringify(range));if(!checked)throw new Error('Invalid history range');navigate('transactions','range',JSON.stringify(checked));}
