import type {ProfileData,Txn} from '../domain/types';
import {emptyFinancialRecords,reviewContent,reviewDigest} from '../domain/financialRecords';
import {computeAccountBalances} from '../domain/ledger';
import {monthlyDebtInterest} from '../domain/debt';
import {addMinor,subMinor} from '../domain/money';
import {addMonths,daysInCalendarMonth} from '../domain/dates';

/** Local calendar dates also work in UTC+14; an ISO conversion can change the day. */
export function exampleDate(anchor:Date,offset:number,day:number){const date=new Date(anchor.getFullYear(),anchor.getMonth()+offset,day,12);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}

/** Fictional data only. Existing sandboxes are never replaced except on explicit Reset. */
export function addExampleFeatures(data:ProfileData,anchor:Date){
  const now=data.createdAt,month=(offset:number,day:number)=>exampleDate(anchor,offset,day),today=month(0,anchor.getDate());
  data.version=2;const financial=emptyFinancialRecords();data.financial=financial;
  data.accounts.forEach((a,i)=>{a.color=['#547C99','#527D68','#9B742F'][i];});
  data.accounts.push({id:'loan-account',name:'Laptop loan · recorded liability',type:'credit',openingBalance:-7200000,archived:false,createdAt:now,color:'#826595'});
  const debt=data.debts[0];debt.name='Laptop loan';debt.balance=7200000;debt.linkedLiabilityAccountId='loan-account';debt.note='Opening liability is preserved. Recorded principal transfers reduce the account; interest is a separate expense.';
  const interestCategory=data.categories.find(c=>c.id==='debt')!;interestCategory.name='Loan interest';
  let outstanding=7200000;financial.debtPayments=[];
  const principalTransfers:Txn[]=[];
  for(const txn of data.txns.filter(t=>t.type==='expense'&&t.categoryId==='debt').sort((a,b)=>a.date.localeCompare(b.date))){
    const interest=monthlyDebtInterest(outstanding,debt.annualRatePct),principal=subMinor(txn.amount,interest),before=outstanding,id='example-payment-'+txn.id;
    outstanding=subMinor(outstanding,principal);const principalTxnId=txn.id+'-principal';
    principalTransfers.push({id:principalTxnId,type:'transfer',accountId:'daily',toAccountId:'loan-account',date:txn.date,amount:principal,createdAt:now,note:'Laptop installment · principal',debtPaymentId:id});
    txn.amount=interest;txn.note='Laptop installment · interest';txn.debtPaymentId=id;
    financial.debtPayments.push({id,debtId:debt.id,accountId:'daily',liabilityAccountId:'loan-account',date:txn.date,principal,interest,fees:0,principalTxnId,interestTxnId:txn.id,outstandingBefore:before,outstandingAfter:outstanding,excluded:false,note:'Fictional installment: principal transfer plus separately charged interest.',createdAt:now});
  }
  data.txns.push(...principalTransfers);
  const previous=month(-1,1).slice(0,7);
  const split=data.txns.find(t=>t.date===previous+'-03'&&t.categoryId==='groceries');
  if(split){const food=Math.floor(split.amount*4/5);split.splits=[{categoryId:'groceries',amount:food},{categoryId:'personal',amount:subMinor(split.amount,food)}];delete split.categoryId;split.note='Market trip · groceries and household items';}
  const returned=data.txns.find(t=>t.date===previous+'-23'&&t.categoryId==='personal');
  if(returned)data.txns.push({id:'example-refund',type:'refund',date:month(-1,26),amount:50000,accountId:'daily',categoryId:'personal',refundOf:returned.id,note:'Returned one item from the clothes purchase',createdAt:now});
  data.txns.push({id:'example-excluded',type:'expense',date:month(-1,15),amount:9900,accountId:'daily',categoryId:'personal',note:'Duplicate receipt · excluded after review',archived:true,createdAt:now});

  for(const goal of data.goals){goal.funding='allocations';delete goal.linkedAccountId;delete goal.manualSaved;}
  financial.allocations=[{id:'example-reserve',accountId:'savings',goalId:'emergency',purpose:'Emergency breathing room',amount:3000000,active:true,updatedAt:now},{id:'example-console',accountId:'savings',goalId:'console',purpose:'Handheld console',amount:200000,active:true,updatedAt:now},{id:'example-trip',accountId:'savings',goalId:'trip',purpose:'Mountain trip',amount:1200000,active:true,updatedAt:now},{id:'example-annual',accountId:'savings',purpose:'Annual commitments',amount:800000,active:true,updatedAt:now}];
  const cash=computeAccountBalances(data.accounts,data.txns).get('cash')!;
  financial.checks.push({id:'example-cash-check',accountId:'cash',date:today,recorded:cash,actual:addMinor(cash,25000),checkedAt:now});
  financial.adjustments.push({id:'example-cash-adjustment',accountId:'cash',date:today,delta:25000,reason:'Fictional balance check: corrected opening cash detail',createdAt:now});
  const lastDay=daysInCalendarMonth(anchor.getFullYear(),anchor.getMonth()+1);
  financial.targets=[{id:'example-grocery-target',categoryId:'groceries',from:month(0,1),to:month(0,lastDay),amount:650000},{id:'example-transport-target',categoryId:'transport',from:month(0,1),to:month(0,lastDay),amount:200000}];
  data.recurring.push({id:'month-end-pass',name:'Co-working top-up · month end',kind:'expense',amount:30000,frequency:'monthly',dayOfMonth:31,lastDayOfMonth:true,startDate:month(-2,1),active:true,accountId:'daily',categoryId:'personal',note:'Expected only; no transaction is generated.'},{id:'fortnightly-work',name:'Illustration session · fortnightly plan',kind:'income',amount:150000,frequency:'biweekly',dayOfMonth:5,dayOfWeek:new Date(anchor.getFullYear(),anchor.getMonth()-2,5,12).getDay(),startDate:month(-2,5),active:true,accountId:'daily',categoryId:'freelance',note:'An illustrative schedule, not recorded earnings.'});
  financial.occurrences=[];
  for(const [scheduleId,day] of [['salary-schedule',1],['rent-schedule',2],['subscription-schedule',6]] as const){const schedule=data.recurring.find(r=>r.id===scheduleId)!,date=month(0,day),txn=data.txns.find(t=>t.date===date&&t.type===schedule.kind&&t.categoryId===schedule.categoryId);if(txn)financial.occurrences.push({scheduleId,date,state:'matched',expectedAmount:schedule.amount,expectedKind:schedule.kind,transactionIds:[txn.id],note:'Fictional explicit association for the sample.'});}
  financial.occurrences.push({scheduleId:'month-end-pass',date:month(0,lastDay),state:'skipped',expectedAmount:30000,expectedKind:'expense',transactionIds:[],note:'Fictional decision: no top-up needed this month.'});
  financial.assumptions=[{key:'liquidFunds',value:4850000,scope:'current-estimate',origin:'user-confirmed',reviewedAt:now},{key:'monthlyIncome',value:5200000,scope:'monthly-estimate',origin:'user-confirmed',reviewedAt:now},{key:'monthlyExpenses',value:3850000,scope:'monthly-estimate',origin:'user-confirmed',reviewedAt:now},{key:'annualIncome',value:62400000,scope:'annual-estimate',origin:'user-confirmed',reviewedAt:now},{key:'emergencyReserve',value:23100000,scope:'current-estimate',origin:'user-confirmed',reviewedAt:now},{key:'monthlySurplus',value:1350000,scope:'monthly-estimate',origin:'user-confirmed',reviewedAt:now}];
  financial.scenarios=[{id:'example-purchase-now',name:'Console · a purchase to think through',reviewedAt:now,input:{currentLiquidFunds:4850000,emergencyReserve:23100000,currentMonthlySurplus:1350000,upfrontCost:800000,addedMonthlyCost:0,horizonMonths:12}},{id:'example-smaller-purchase',name:'A smaller purchase · keep more liquid',reviewedAt:now,input:{currentLiquidFunds:4850000,emergencyReserve:23100000,currentMonthlySurplus:1350000,upfrontCost:400000,addedMonthlyCost:0,horizonMonths:12}}];
  financial.planningComparisons=[{id:'example-savings-comparison',name:'A small monthly savings split',version:1,kind:'savings',asOf:today,savedAt:now,input:{monthlyBudget:50000,obligations:0,emergencyGap:240000,emergencyMonths:12,nearTermGap:800000,nearTermMonths:16,remainderPurpose:'accessible'}},{id:'example-debt-comparison',name:'Laptop loan · compare a higher payment',version:1,kind:'debt',asOf:today,savedAt:now,source:{...debt,balance:outstanding},input:{monthlyPayment:520000,oneTimePayment:500000,annualRatePct:debt.annualRatePct}},{id:'example-goal-comparison',name:'Console · compare contribution levels',version:1,kind:'goal',asOf:today,savedAt:now,source:{...data.goals.find(g=>g.id==='console')!},savedAmount:200000,input:{monthlyContribution:100000,additionalNow:100000}}];
}

export async function addFictionalReviews(data:ProfileData){
  const month=data.example!.anchorMonth;
  for(let offset=-6;offset<0;offset++){const key=addMonths(month,offset);data.financial!.reviews.push({month:key,reviewedAt:data.createdAt,note:'Fictional sample review to demonstrate changed-record detection; not a real statement.',digest:await reviewDigest(reviewContent(data,key))});}
}
