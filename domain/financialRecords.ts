import type { ProfileData } from './types';
import { addMinor, subMinor, sumMinor, assertMinorUnits } from './money';
import { isValidDate } from './dates';
import { computeAccountBalances } from './ledger';
import { evaluateAffordabilityScenario, type AffordabilityScenarioInput } from './scenario';
import {assertSavedComparison,type SavedPlanningComparison} from './savedComparisons';
export interface BalanceAdjustment {
    id: string;
    accountId: string;
    date: string;
    delta: number;
    reason: string;
    createdAt: string;
    reversesId?: string;
}
export interface BalanceCheck {
    id: string;
    accountId: string;
    date: string;
    recorded: number;
    actual: number;
    checkedAt: string;
}
export interface SpendingTarget {
    id: string;
    categoryId: string;
    from: string;
    to: string;
    amount: number;
}
export interface PeriodReview {
    month: string;
    reviewedAt: string;
    note: string;
    digest: string;
}
export interface OccurrenceRecord {
    scheduleId: string;
    date: string;
    state: 'matched' | 'skipped' | 'no-longer-expected';
    expectedAmount: number;
    expectedKind?: 'income' | 'expense';
    transactionIds: string[];
    note?: string;
}
export interface Allocation {
    id: string;
    accountId: string;
    goalId?: string;
    purpose: string;
    amount: number;
    active: boolean;
    updatedAt: string;
}
export type AssumptionKey = 'liquidFunds' | 'monthlyIncome' | 'monthlyExpenses' | 'annualIncome' | 'emergencyReserve' | 'monthlySurplus';
export interface PlanningAssumption {
    key: AssumptionKey;
    value: number;
    origin: 'user-confirmed';
    scope: 'current-estimate' | 'monthly-estimate' | 'annual-estimate';
    reviewedAt: string;
}
export interface SavedScenario {
    id: string;
    name: string;
    input: AffordabilityScenarioInput;
    reviewedAt: string;
}
export interface RecordedDebtPayment {
    id: string;
    debtId: string;
    accountId: string;
    liabilityAccountId: string;
    date: string;
    principal: number;
    interest: number;
    fees: number;
    principalTxnId?: string;
    interestTxnId?: string;
    feesTxnId?: string;
    outstandingBefore: number;
    outstandingAfter: number;
    excluded: boolean;
    note: string;
    createdAt: string;
}
export interface FinancialRecords {
    adjustments: BalanceAdjustment[];
    checks: BalanceCheck[];
    targets: SpendingTarget[];
    reviews: PeriodReview[];
    occurrences?: OccurrenceRecord[];
    allocations?: Allocation[];
    assumptions?: PlanningAssumption[];
    scenarios?: SavedScenario[];
    planningComparisons?: SavedPlanningComparison[];
    debtPayments?: RecordedDebtPayment[];
}
export const emptyFinancialRecords = (): FinancialRecords => ({ adjustments: [], checks: [], targets: [], reviews: [] });
export function assertFinancialRecords(f: FinancialRecords, data: ProfileData) {
    for (const key of ['adjustments', 'checks', 'targets', 'reviews'] as const)
        if (!Array.isArray(f[key]))
            throw new Error('Incomplete financial record format');
    for (const key of ['allocations', 'assumptions', 'scenarios', 'planningComparisons', 'occurrences', 'debtPayments'] as const)
        if (f[key] !== undefined && !Array.isArray(f[key]))
            throw new Error('Invalid financial record collection');
    const ids = new Set<string>();
    const id = (value: string) => { if (typeof value !== 'string' || !value || ids.has(value))
        throw new Error('Invalid or duplicate financial record ID'); ids.add(value); };
    const account = (value: string) => { if (!data.accounts.some(a => a.id === value))
        throw new Error('Unknown account'); };
    for (const a of f.adjustments) {
        id(a.id);
        account(a.accountId);
        if (!isValidDate(a.date) || !a.reason?.trim() || !a.createdAt)
            throw new Error('An adjustment needs a valid date and reason');
        assertMinorUnits(a.delta);
        if (!a.delta)
            throw new Error('An adjustment must change the balance');
        if (a.reversesId) {
            const source = f.adjustments.find(x => x.id === a.reversesId);
            if (!source || source.accountId !== a.accountId || source.delta !== -a.delta || a.date < source.date || source.reversesId !== undefined || f.adjustments.filter(x => x.reversesId === source.id).length !== 1)
                throw new Error('Invalid adjustment reversal');
        }
    }
    for (const c of f.checks) {
        id(c.id);
        account(c.accountId);
        if (!isValidDate(c.date) || !c.checkedAt)
            throw new Error('Invalid balance check');
        assertMinorUnits(c.actual);
        assertMinorUnits(c.recorded);
        subMinor(c.actual, c.recorded);
    }
    for (const t of f.targets) {
        id(t.id);
        if (!data.categories.some(c => c.id === t.categoryId && c.kind === 'expense') || !isValidDate(t.from) || !isValidDate(t.to) || t.from > t.to)
            throw new Error('Invalid spending target period or category');
        assertMinorUnits(t.amount);
        if (t.amount <= 0)
            throw new Error('Target must be positive');
    }
    const months = new Set<string>();
    for (const r of f.reviews) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) || months.has(r.month) || !r.reviewedAt || typeof r.note !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(r.digest))
            throw new Error('Invalid period review');
        months.add(r.month);
    }
    for (const a of f.allocations ?? []) {
        id(a.id);
        account(a.accountId);
        if (a.goalId && !data.goals.some(g => g.id === a.goalId))
            throw new Error('Allocation goal does not exist');
        assertMinorUnits(a.amount);
        if (a.amount <= 0 || typeof a.active !== 'boolean' || !a.purpose?.trim() || a.purpose.length > 200 || !a.updatedAt)
            throw new Error('Invalid allocation');
    }
    if (f.allocations?.length)
        allocationSummary({ ...data, financial: f });
    const assumptionKeys = new Set<string>();
    for (const a of f.assumptions ?? []) {
        if (assumptionKeys.has(a.key) || !['liquidFunds', 'monthlyIncome', 'monthlyExpenses', 'annualIncome', 'emergencyReserve', 'monthlySurplus'].includes(a.key) || a.origin !== 'user-confirmed' || !['current-estimate', 'monthly-estimate', 'annual-estimate'].includes(a.scope) || !a.reviewedAt)
            throw new Error('Invalid planning assumption');
        assertMinorUnits(a.value);
        if (a.key !== 'monthlySurplus' && a.value < 0)
            throw new Error('Planning input must be nonnegative');
        assumptionKeys.add(a.key);
    }
    for (const s of f.scenarios ?? []) {
        id(s.id);
        if (!s.name?.trim() || s.name.length > 100 || !s.reviewedAt)
            throw new Error('Invalid scenario name');
        evaluateAffordabilityScenario(s.input);
    }
    for(const comparison of f.planningComparisons??[]){id(comparison.id);assertSavedComparison(comparison);}
    const liabilityLinks = new Set<string>();
    for (const d of data.debts) {
        if (d.linkedLiabilityAccountId) {
            const a = data.accounts.find(a => a.id === d.linkedLiabilityAccountId);
            if (!a || a.type !== 'credit' || liabilityLinks.has(a.id))
                throw new Error('A liability account can link to only one debt record');
            liabilityLinks.add(a.id);
        }
    }
    const paymentTxns = new Set<string>();
    for (const p of f.debtPayments ?? []) {
        id(p.id);
        account(p.accountId);
        account(p.liabilityAccountId);
        if (!data.debts.some(d => d.id === p.debtId) || p.accountId === p.liabilityAccountId || !isValidDate(p.date) || typeof p.excluded !== 'boolean' || typeof p.note !== 'string')
            throw new Error('Invalid debt payment');
        for (const v of [p.principal, p.interest, p.fees, p.outstandingBefore, p.outstandingAfter]) {
            assertMinorUnits(v);
            if (v < 0)
                throw new Error('Payment components must be nonnegative');
        }
        if (sumMinor([p.principal, p.interest, p.fees]) <= 0 || subMinor(p.outstandingBefore, p.principal) !== p.outstandingAfter)
            throw new Error('Invalid debt payment breakdown');
        for (const [value, txnId, type] of [[p.principal, p.principalTxnId, 'transfer'], [p.interest, p.interestTxnId, 'expense'], [p.fees, p.feesTxnId, 'expense']] as const) {
            if (!value) {
                if (txnId)
                    throw new Error('Unexpected zero payment component');
                continue;
            }
            const txn = data.txns.find(t => t.id === txnId);
            if (!txn || paymentTxns.has(txn.id) || txn.debtPaymentId !== p.id || txn.amount !== value || txn.type !== type || txn.accountId !== p.accountId || txn.date !== p.date || !!txn.archived !== p.excluded || (type === 'transfer' && txn.toAccountId !== p.liabilityAccountId))
                throw new Error('Debt payment transactions must be corrected together');
            paymentTxns.add(txn.id);
        }
    }
    for (const t of data.txns)
        if (t.debtPaymentId && !paymentTxns.has(t.id))
            throw new Error('Orphan debt payment transaction');
    const seen = new Set<string>(), linked = new Set<string>();
    for (const o of f.occurrences ?? []) {
        const key = o.scheduleId + ':' + o.date, schedule = data.recurring.find(r => r.id === o.scheduleId);
        if (seen.has(key) || !schedule || !isValidDate(o.date) || !['matched', 'skipped', 'no-longer-expected'].includes(o.state) || !Array.isArray(o.transactionIds))
            throw new Error('Invalid scheduled occurrence');
        seen.add(key);
        assertMinorUnits(o.expectedAmount);
        if (o.expectedAmount <= 0 || new Set(o.transactionIds).size !== o.transactionIds.length || o.transactionIds.some(id => !data.txns.some(t => t.id === id && t.type === (o.expectedKind ?? schedule.kind))))
            throw new Error('Invalid occurrence amount or transaction links');
        for (const id of o.transactionIds) {
            if (linked.has(id))
                throw new Error('Transaction is linked more than once');
            linked.add(id);
        }
        if (o.state !== 'matched' && o.transactionIds.length)
            throw new Error('Only matched occurrences can link transactions');
        if (o.state === 'matched' && !o.transactionIds.length)
            throw new Error('A match requires a recorded transaction');
    }
}
export function adjustedBalances(data: ProfileData, through?: string) {
    const balances = new Map(computeAccountBalances(data.accounts, through ? data.txns.filter(t => t.date <= through) : data.txns));
    for (const a of data.financial?.adjustments ?? [])
        if (!through || a.date <= through)
            balances.set(a.accountId, addMinor(balances.get(a.accountId) ?? 0, a.delta));
    return balances;
}
export function targetProgress(data: ProfileData, t: SpendingTarget, asOf: string) {
    const amounts: number[] = [];
    for (const tx of data.txns) {
        if (tx.archived || tx.date < t.from || tx.date > t.to || !['expense', 'refund'].includes(tx.type))
            continue;
        for (const part of tx.splits ?? [{ categoryId: tx.categoryId, amount: tx.amount }])
            if (part.categoryId === t.categoryId)
                amounts.push(tx.type === 'refund' ? -part.amount : part.amount);
    }
    const spent = sumMinor(amounts), days = Math.round((Date.parse(t.to + 'T00:00:00Z') - Date.parse(t.from + 'T00:00:00Z')) / 86400000) + 1, elapsed = Math.max(0, Math.min(days, Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(t.from + 'T00:00:00Z')) / 86400000) + 1));
    return { spent, remaining: subMinor(t.amount, spent), days, elapsed, abovePace: BigInt(spent) * BigInt(days) > BigInt(t.amount) * BigInt(elapsed) };
}
export function reviewContent(data: ProfileData, month: string) { return JSON.stringify({ txns: data.txns.filter(t => t.date.slice(0, 7) === month).sort((a, b) => a.id.localeCompare(b.id)), adjustments: (data.financial?.adjustments ?? []).filter(a => a.date.slice(0, 7) === month).sort((a, b) => a.id.localeCompare(b.id)) }); }
export async function reviewDigest(content: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)); return 'sha256:' + Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''); }
export function allocationSummary(data: ProfileData) { const balances = adjustedBalances(data); return data.accounts.map(account => { const balance = balances.get(account.id) ?? 0, assigned = sumMinor((data.financial?.allocations ?? []).filter(a => a.active && a.accountId === account.id).map(a => a.amount)), available = subMinor(balance, assigned); return { account, balance, assigned, unallocated: Math.max(0, available), shortfall: Math.max(0, -available), backed: !account.archived && account.type !== 'credit' && balance >= assigned }; }); }
/** Conservative funding: underfunded/archived accounts contribute no claimed funded progress. */
export function goalAllocationBalances(data: ProfileData) { const backed = new Set(allocationSummary(data).filter(s => s.backed).map(s => s.account.id)), totals = new Map<string, number>(); for (const a of data.financial?.allocations ?? [])
    if (a.active && a.goalId && backed.has(a.accountId))
        totals.set(a.goalId, addMinor(totals.get(a.goalId) ?? 0, a.amount)); return totals; }
