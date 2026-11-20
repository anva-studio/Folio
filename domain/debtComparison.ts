import type { Debt } from './types';
import { assertValidDebt, projectDebtPayoff, type DebtProjection } from './debt';
import { addMinor, assertMinorUnits, subMinor } from './money';

export interface DebtAlternative { monthlyPayment:number; oneTimePayment:number; annualRatePct:number }
function zeroProjection():DebtProjection {
  return {openingBalance:0,firstMonthInterest:0,firstMonthPrincipal:0,amortizes:true,monthsToPayoff:0,totalInterest:0,totalPaid:0,finalPayment:0,truncated:false};
}
export function compareDebtPayoff(debt:Debt, alternative:DebtAlternative) {
  // Resolved linked liabilities may legitimately be paid off; validate all other fields.
  assertMinorUnits(debt.balance);
  if(debt.balance<0)throw new Error('Debt balance cannot be negative');
  assertValidDebt({...debt,balance:debt.balance || 1});
  assertMinorUnits(alternative.oneTimePayment);
  if(alternative.oneTimePayment<0||alternative.oneTimePayment>debt.balance)throw new Error('One-time payment must be between zero and the current debt balance');
  const remaining=subMinor(debt.balance,alternative.oneTimePayment);
  const next={...debt,balance:remaining || 1,monthlyPayment:alternative.monthlyPayment,annualRatePct:alternative.annualRatePct};
  assertValidDebt(next);
  const baseline=debt.balance===0?zeroProjection():projectDebtPayoff(debt);
  const projection=remaining===0?zeroProjection():projectDebtPayoff(next);
  const totalPaid=projection.totalPaid===null?null:addMinor(alternative.oneTimePayment,projection.totalPaid);
  return {method:'debt-comparison/1',baseline,alternative:{...projection,totalPaid},oneTimePayment:alternative.oneTimePayment,remainingBalance:remaining,
    monthsSaved:baseline.monthsToPayoff===null||projection.monthsToPayoff===null?null:baseline.monthsToPayoff-projection.monthsToPayoff,
    interestSaved:baseline.totalInterest===null||projection.totalInterest===null?null:subMinor(baseline.totalInterest,projection.totalInterest)};
}
