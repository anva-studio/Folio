import type {ProfileData} from './types';
import {isValidDate} from './dates';
import {adjustedBalances,allocationSummary,goalAllocationBalances,targetProgress} from './financialRecords';
import {projectGoal} from './goal';
import {nextDebtPayment} from './debt';
import {assertMinorUnits,sumMinor,subMinor} from './money';

export const PLANNING_HEALTH_METHOD='planning-checks/1';

/** Read-only context. Budget is explicitly after ordinary spending and debt payments. */
export function analyzePlanningHealth(data:ProfileData,asOf:string,monthlyPlanningAmount?:number){
  if(!isValidDate(asOf))throw new Error('Invalid assessment date');
  if(monthlyPlanningAmount!==undefined){assertMinorUnits(monthlyPlanningAmount);if(monthlyPlanningAmount<0)throw new Error('Planning amount cannot be negative');}
  const balances=adjustedBalances(data),goalAllocations=goalAllocationBalances(data);
  const debts=data.debts.filter(d=>d.active).map(d=>d.linkedLiabilityAccountId?{...d,balance:Math.max(0,-(balances.get(d.linkedLiabilityAccountId)??0))}:d).filter(d=>d.balance>0);
  const nonAmortizing=debts.filter(d=>!nextDebtPayment(d).amortizes);
  const linked=new Set(data.debts.filter(d=>d.active).map(d=>d.linkedLiabilityAccountId));
  const unrepresentedLiabilities=data.accounts.filter(a=>a.type==='credit'&&!a.archived&&(balances.get(a.id)??0)<0&&!linked.has(a.id));
  const goals=data.goals.filter(g=>g.active).map(goal=>{
    try{const projection=projectGoal(goal,asOf,monthlyPlanningAmount??0,{accountBalances:balances,goalAllocations});return {id:goal.id,name:goal.name,monthly:projection.requiredMonthlyContribution,remaining:projection.remaining,deadlinePassed:projection.deadlinePassed};}
    catch{return {id:goal.id,name:goal.name,monthly:null,remaining:null,deadlinePassed:false};}
  });
  const knownGoalDemand=sumMinor(goals.flatMap(g=>g.monthly===null?[]:[g.monthly]));
  const unknownGoals=goals.filter(g=>g.monthly===null);
  const goalFit=monthlyPlanningAmount===undefined||unknownGoals.length>0?null:knownGoalDemand<=monthlyPlanningAmount;
  const unsupportedAssignments=allocationSummary(data).filter(s=>s.assigned>0&&!s.backed);
  const exceededTargets=(data.financial?.targets??[]).filter(t=>t.from<=asOf&&t.to>=asOf).flatMap(target=>{
    const progress=targetProgress(data,target,asOf);
    return progress.spent>target.amount?[{id:target.id,categoryId:target.categoryId,over:subMinor(progress.spent,target.amount)}]:[];
  });
  return {method:PLANNING_HEALTH_METHOD,asOf,debts,nonAmortizing,unrepresentedLiabilities,
    monthlyDebtPlans:sumMinor(debts.map(d=>d.monthlyPayment)),goals,knownGoalDemand,unknownGoals,goalFit,
    goalShortfall:monthlyPlanningAmount===undefined?null:Math.max(0,subMinor(knownGoalDemand,monthlyPlanningAmount)),
    unsupportedAssignments,exceededTargets};
}

export type CheckState='met'|'attention'|'unknown';
/** No averaging, weights or wealth-based score. Confidence gates a positive summary. */
export function summarizePlanningChecks(states:readonly CheckState[],confirmedInputs:boolean,reviewedRecentHistory:boolean){
  return {method:PLANNING_HEALTH_METHOD,
    result:!confirmedInputs||!reviewedRecentHistory||!states.length||states.includes('unknown')?'insufficient-information' as const:states.includes('attention')?'review-suggested' as const:'within-chosen-checks' as const,
    assessed:states.filter(s=>s!=='unknown').length,total:states.length};
}
