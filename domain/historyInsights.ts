import type { ProfileData } from './types';
import { addMonths, isValidMonthKey } from './dates';
import { summarizeTransactionsMonth } from './cashflow';
import { reviewContent, reviewDigest } from './financialRecords';
import { subMinor } from './money';

export const HISTORY_METHOD = 'recorded-history/1';
export async function analyzeHistory(data: ProfileData, currentMonth: string) {
  if (!isValidMonthKey(currentMonth)) throw new Error('Invalid current month');
  const periods = await Promise.all(Array.from({length:6}, async (_, index) => {
    const month = addMonths(currentMonth, index - 6);
    const totals = summarizeTransactionsMonth(data.txns, month);
    const review = data.financial?.reviews.find(r=>r.month===month);
    const state = review ? review.digest === await reviewDigest(reviewContent(data,month)) ? 'reviewed' : 'changed' : 'unreviewed';
    return {month, ...totals, state};
  }));
  const reviewed = periods.filter(p=>p.state==='reviewed');
  const previous = periods.at(-2)!, latest = periods.at(-1)!;
  // Never compare an empty/unreviewed period as though it were a verified zero.
  const comparison = previous.state==='reviewed' && latest.state==='reviewed' ? {
    from:previous.month, to:latest.month,
    incomeChange:subMinor(latest.income,previous.income),
    spendingChange:subMinor(latest.expense,previous.expense),
    netChange:subMinor(latest.net,previous.net),
  } : null;
  return {method:HISTORY_METHOD, periods, reviewedMonths:reviewed.length,
    reviewedShortfallMonths:reviewed.filter(p=>p.net<0).length,
    monthsWithRecords:periods.filter(p=>p.transactionCount>0).length,
    comparison};
}
