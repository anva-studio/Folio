import type { Goal } from './types';
import { projectGoal, type GoalContext } from './goal';
import { addMinor, assertMinorUnits } from './money';

export function compareGoalContributions(goal:Goal, asOf:string, context:GoalContext, monthlyContribution:number, additionalNow:number) {
  assertMinorUnits(additionalNow);
  const baseline=projectGoal(goal,asOf,0,context);
  if(additionalNow<0||additionalNow>baseline.remaining)throw new Error('Additional amount must be between zero and the remaining target');
  const annualRatePct=goal.annualRatePct??0;
  const alternativeGoal:Goal={...goal,funding:'legacy',linkedAccountId:undefined,manualSaved:addMinor(baseline.savedSoFar,additionalNow),method:annualRatePct>0?'growth':'fixed',annualRatePct:annualRatePct>0?annualRatePct:undefined,targetDate:undefined,monthlyContribution};
  const alternative=projectGoal(alternativeGoal,asOf,0);
  return {method:'goal-comparison/1',baseline,alternative,annualRatePct,monthlyContribution,additionalNow,
    monthsDifference:baseline.monthsToTarget===null||alternative.monthsToTarget===null?null:baseline.monthsToTarget-alternative.monthsToTarget};
}
