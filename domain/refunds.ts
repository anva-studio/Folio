import type { Txn } from './types';
import { addMinor } from './money';
export function assertRefundLinks(txns: readonly Txn[]) {
    const byId = new Map(txns.map(t => [t.id, t])), totals = new Map<string, number>(), categories = new Map<string, number>();
    for (const t of txns) {
        if (t.type !== 'refund')
            continue;
        const source = t.refundOf ? byId.get(t.refundOf) : undefined;
        if (!source || source.type !== 'expense' || source.id === t.id)
            throw new Error('A refund must link to its original expense');
        if (t.date < source.date)
            throw new Error('Refund date cannot precede its purchase');
        if (![source.categoryId, ...(source.splits ?? []).map(s => s.categoryId)].includes(t.categoryId))
            throw new Error('Refund category must belong to the original purchase');
        if (!t.archived) {
            if (source.archived)
                throw new Error('Include the original purchase before including its refund');
            const sum = addMinor(totals.get(source.id) ?? 0, t.amount);
            if (sum > source.amount)
                throw new Error('Included refunds cannot exceed the original purchase');
            totals.set(source.id, sum);
            const key = source.id + ':' + t.categoryId, categoryTotal = addMinor(categories.get(key) ?? 0, t.amount), limit = source.splits?.find(s => s.categoryId === t.categoryId)?.amount ?? source.amount;
            if (categoryTotal > limit)
                throw new Error('Refund exceeds the purchase amount in this category');
            categories.set(key, categoryTotal);
        }
    }
}
