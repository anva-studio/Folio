import type {ProfileData,Txn} from './types';
import {isValidMonthKey,addMonths,monthsBetween,daysInCalendarMonth} from './dates';
import {summarizeTransactionsMonth} from './cashflow';
import {reviewContent,reviewDigest} from './financialRecords';
import {sumMinor,addMinor,subMinor} from './money';

export const PERIOD_ANALYSIS_METHOD='period-analysis/1';
const validMonth=(month:string)=>isValidMonthKey(month)&&Number(month.slice(0,4))>=1;
export function periodDateRange(from:string,to:string){
  if(!validMonth(from)||!validMonth(to)||from>to)throw new Error('Choose a valid month range in chronological order');
  const [year,month]=to.split('-').map(Number);
  return {from:from+'-01',to:to+'-'+String(daysInCalendarMonth(year,month)).padStart(2,'0')};
}

/** Equal-length adjacent calendar periods; no schedules, adjustments or inferred savings. */
export async function analyzePeriods(data:ProfileData,from:string,to:string,currentMonth:string){
  periodDateRange(from,to);
  if(!validMonth(currentMonth))throw new Error('Invalid current month');
  const count=monthsBetween(from,to)+1;
  if(count>60)throw new Error('Compare at most 60 months per period');
  const baselineFrom=addMonths(from,-count),baselineTo=addMonths(from,-1);
  if(!validMonth(baselineFrom)||!validMonth(baselineTo))throw new Error('The previous period falls outside supported calendar years');
  const monthKeys=Array.from({length:count*2},(_,i)=>addMonths(baselineFrom,i));
  const buckets=new Map(monthKeys.map(month=>[month,[] as Txn[]]));
  for(const txn of data.txns)buckets.get(txn.date.slice(0,7))?.push(txn);
  const months=await Promise.all(monthKeys.map(async month=>{
    const totals=summarizeTransactionsMonth(buckets.get(month)!,month),review=data.financial?.reviews.find(r=>r.month===month);
    const state=month>=currentMonth?'incomplete':!review?'unreviewed':review.digest===await reviewDigest(reviewContent(data,month))?'reviewed':'changed';
    return {month,...totals,state};
  }));
  const build=(start:number,fromMonth:string,toMonth:string)=>{
    const rows=months.slice(start,start+count),reviewed=rows.filter(m=>m.state==='reviewed').length;
    return {fromMonth,toMonth,...periodDateRange(fromMonth,toMonth),months:rows,reviewed,
      income:sumMinor(rows.map(m=>m.income)),expense:sumMinor(rows.map(m=>m.expense)),net:sumMinor(rows.map(m=>m.net)),
      transactionCount:rows.reduce((n,m)=>n+m.transactionCount,0)};
  };
  const baseline=build(0,baselineFrom,baselineTo),selected=build(count,from,to),comparable=months.every(m=>m.state==='reviewed');
  const categories=new Map<string,{id:string;name:string;baseline:number;selected:number}>();
  const names=new Map(data.categories.map(c=>[c.id,c.name]));
  for(const [month,txns] of buckets)for(const txn of txns){
    if(txn.archived||!['expense','refund'].includes(txn.type))continue;
    for(const part of txn.splits??[{categoryId:txn.categoryId??'uncategorized',amount:txn.amount}]){
      const row=categories.get(part.categoryId)??{id:part.categoryId,name:names.get(part.categoryId)??'Uncategorized',baseline:0,selected:0};
      const key=month<from?'baseline':'selected';row[key]=addMinor(row[key],txn.type==='refund'?-part.amount:part.amount);categories.set(row.id,row);
    }
  }
  return {method:PERIOD_ANALYSIS_METHOD,count,baseline,selected,comparable,
    differences:comparable?{income:subMinor(selected.income,baseline.income),expense:subMinor(selected.expense,baseline.expense),net:subMinor(selected.net,baseline.net)}:null,
    categories:[...categories.values()].map(row=>({...row,change:comparable?subMinor(row.selected,row.baseline):null})).sort((a,b)=>a.name.localeCompare(b.name))};
}
