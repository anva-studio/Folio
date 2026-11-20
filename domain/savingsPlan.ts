import { assertMinorUnits, subMinor, sumMinor } from './money';
export interface SavingsPlanInput {
  monthlyBudget:number;
  emergencyGap:number;
  emergencyMonths:number;
  nearTermGap:number;
  nearTermMonths:number;
  obligations:number;
  remainderPurpose:'accessible'|'long-term';
}
function monthlyNeed(gap:number, months:number) {
  // BigInt ceiling avoids losing a final minor unit or overflowing gap+months-1.
  return Number((BigInt(gap)+BigInt(months)-1n)/BigInt(months));
}
export function compareSavingsPlans(input:SavingsPlanInput) {
  for(const amount of [input.monthlyBudget,input.emergencyGap,input.nearTermGap,input.obligations]) {
    assertMinorUnits(amount);if(amount<0)throw new Error('Planning amounts must be non-negative');
  }
  for(const months of [input.emergencyMonths,input.nearTermMonths])if(!Number.isSafeInteger(months)||months<1||months>1200)throw new Error('Choose a horizon of 1–1200 whole months');
  if(!['accessible','long-term'].includes(input.remainderPurpose))throw new Error('Choose a remainder purpose');
  const needs={obligations:input.obligations,emergency:monthlyNeed(input.emergencyGap,input.emergencyMonths),nearTerm:monthlyNeed(input.nearTermGap,input.nearTermMonths)};
  const run=(priority:'emergency'|'nearTerm')=>{
    let remaining=input.monthlyBudget;
    const allocated={obligations:0,emergency:0,nearTerm:0,remainder:0};
    const order = ['obligations',priority,priority==='emergency'?'nearTerm':'emergency'] as const;
    for(const key of order){allocated[key]=Math.min(remaining,needs[key]);remaining=subMinor(remaining,allocated[key]);}
    allocated.remainder=remaining;
    const months=(gap:number,amount:number)=>gap===0?0:amount===0?null:Number((BigInt(gap)+BigInt(amount)-1n)/BigInt(amount));
    return {priority,allocated,unmet:{obligations:subMinor(needs.obligations,allocated.obligations),emergency:subMinor(needs.emergency,allocated.emergency),nearTerm:subMinor(needs.nearTerm,allocated.nearTerm)},emergencyCompletionMonths:months(input.emergencyGap,allocated.emergency),nearTermCompletionMonths:months(input.nearTermGap,allocated.nearTerm),total:sumMinor(Object.values(allocated))};
  };
  return {method:'savings-purposes/1',needs,remainderPurpose:input.remainderPurpose,options:[run('emergency'),run('nearTerm')]};
}
