import type { ProfileData } from './types';
import { txnEffectOn } from './ledger';
import { addMinor } from './money';

export interface BalanceHistoryPoint { date: string; movement: number; balance: number; transactions: number; adjustments: number }
/** Activity-date closing balances. Opening balances have no inferred effective date. */
export function accountBalanceHistory(data: ProfileData, accountId: string): BalanceHistoryPoint[] {
  const account = data.accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Unknown account');
  const days = new Map<string, { movement: number; transactions: number; adjustments: number }>();
  const day = (date: string) => {
    let entry = days.get(date);
    if (!entry) { entry = { movement: 0, transactions: 0, adjustments: 0 }; days.set(date, entry); }
    return entry;
  };
  for (const tx of data.txns) {
    if (tx.archived || (tx.accountId !== accountId && (tx.type !== 'transfer' || tx.toAccountId !== accountId))) continue;
    const entry = day(tx.date);
    entry.movement = addMinor(entry.movement, txnEffectOn(tx, accountId));
    entry.transactions++;
  }
  for (const adjustment of data.financial?.adjustments ?? []) {
    if (adjustment.accountId !== accountId) continue;
    const entry = day(adjustment.date);
    entry.movement = addMinor(entry.movement, adjustment.delta);
    entry.adjustments++;
  }
  let balance = account.openingBalance;
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, entry]) => {
    balance = addMinor(balance, entry.movement);
    return { date, ...entry, balance };
  });
}

export function historyBalanceThrough(points: readonly BalanceHistoryPoint[], openingBalance: number, date: string) {
  let balance = openingBalance;
  for (const point of points) { if (point.date > date) break; balance = point.balance; }
  return balance;
}
