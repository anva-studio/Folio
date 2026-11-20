import type {Debt,Goal} from './types';
import {isValidDate} from './dates';
import {assertMinorUnits} from './money';
import {compareSavingsPlans,type SavingsPlanInput} from './savingsPlan';
import {compareDebtPayoff,type DebtAlternative} from './debtComparison';
import {compareGoalContributions} from './goalComparison';
import {assertValidDebt} from './debt';
import {assertValidGoal,remainingGoalAmount} from './goal';

type SnapshotBase={version:1;asOf:string};
export type ComparisonSnapshot=SnapshotBase&(
  {kind:'savings';input:SavingsPlanInput}|
  {kind:'debt';source:Debt;input:DebtAlternative}|
  {kind:'goal';source:Goal;savedAmount:number;input:{monthlyContribution:number;additionalNow:number}}
);
export type SavedPlanningComparison=ComparisonSnapshot&{id:string;name:string;savedAt:string};

function goalContext(snapshot:Extract<ComparisonSnapshot,{kind:'goal'}>){return {accountBalances:new Map(snapshot.source.linkedAccountId?[[snapshot.source.linkedAccountId,snapshot.savedAmount]]:[]),goalAllocations:new Map([[snapshot.source.id,snapshot.savedAmount]])};}

/** Cheap structural/domain validation; never run 1,200-month projections on every ledger edit. */
export function assertComparisonSnapshot(snapshot:ComparisonSnapshot){
  if(snapshot.version!==1||!isValidDate(snapshot.asOf))throw new Error('Unsupported comparison version or invalid capture date');
  if(snapshot.kind==='savings'){compareSavingsPlans(snapshot.input);return;}
  if(snapshot.kind==='debt'){
    assertMinorUnits(snapshot.source.balance);if(snapshot.source.balance<0)throw new Error('Debt snapshot cannot have a negative balance');
    assertValidDebt({...snapshot.source,balance:snapshot.source.balance||1});assertMinorUnits(snapshot.input.oneTimePayment);
    if(snapshot.input.oneTimePayment<0||snapshot.input.oneTimePayment>snapshot.source.balance)throw new Error('Invalid one-time payment');
    assertValidDebt({...snapshot.source,balance:1,monthlyPayment:snapshot.input.monthlyPayment,annualRatePct:snapshot.input.annualRatePct});return;
  }
  if(snapshot.kind==='goal'){
    assertMinorUnits(snapshot.savedAmount);
    const goal=snapshot.source;
    if(goal.funding==='allocations'&&snapshot.savedAmount<0)throw new Error('Allocated goal progress cannot be negative');
    if(goal.funding!=='allocations'&&!goal.linkedAccountId&&snapshot.savedAmount!==(goal.manualSaved??0))throw new Error('Manual goal snapshot does not match its captured saved amount');
    const context=goalContext(snapshot);assertValidGoal(goal,context);assertMinorUnits(snapshot.input.monthlyContribution);assertMinorUnits(snapshot.input.additionalNow);
    if(snapshot.input.monthlyContribution<=0||snapshot.input.additionalNow<0||snapshot.input.additionalNow>remainingGoalAmount(goal,context))throw new Error('Invalid goal comparison contributions');return;
  }
  throw new Error('Unknown comparison kind');
}
/** Replays captured assumptions, never current entity references or balances. */
export function evaluateSavedComparison(snapshot:ComparisonSnapshot){
  assertComparisonSnapshot(snapshot);
  if(snapshot.kind==='savings')return {kind:snapshot.kind,result:compareSavingsPlans(snapshot.input)} as const;
  if(snapshot.kind==='debt')return {kind:snapshot.kind,result:compareDebtPayoff(snapshot.source,snapshot.input)} as const;
  return {kind:snapshot.kind,result:compareGoalContributions(snapshot.source,snapshot.asOf,goalContext(snapshot),snapshot.input.monthlyContribution,snapshot.input.additionalNow)} as const;
}
export function assertSavedComparison(record:SavedPlanningComparison){
  if(typeof record.id!=='string'||!record.id.trim()||typeof record.name!=='string'||!record.name.trim()||record.name.length>100||typeof record.savedAt!=='string'||!Number.isFinite(Date.parse(record.savedAt)))throw new Error('Invalid saved comparison identity, name or timestamp');
  assertComparisonSnapshot(record);
}
