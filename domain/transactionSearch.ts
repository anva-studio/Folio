import type { ProfileData, Txn } from './types';
import { isValidDate } from './dates';
export interface HistoryQuery {
    text?: string;
    categoryId?: string;
    from?: string;
    to?: string;
    minimum?: number;
    maximum?: number;
    sort?: 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'category' | 'account';
}
export function searchTransactions(txns: readonly Txn[], data: Pick<ProfileData, 'categories' | 'accounts'>, query: HistoryQuery): Txn[] {
    for (const date of [query.from, query.to])
        if (date && !isValidDate(date))
            throw new Error('Choose a valid date');
    if (query.from && query.to && query.from > query.to)
        throw new Error('Start date must not follow end date');
    for (const n of [query.minimum, query.maximum])
        if (n !== undefined && (!Number.isSafeInteger(n) || n < 0))
            throw new Error('Amount filters must be nonnegative exact amounts');
    if (query.minimum !== undefined && query.maximum !== undefined && query.minimum > query.maximum)
        throw new Error('Minimum amount must not exceed maximum');
    const categories = new Map(data.categories.map(c => [c.id, c.name])), accounts = new Map(data.accounts.map(a => [a.id, a.name]));
    const category = (t: Txn) => (t.splits ?? [{ categoryId: t.categoryId ?? '' }]).map(s => categories.get(s.categoryId) ?? '').join(' ');
    const text = (query.text ?? '').trim().toLocaleLowerCase();
    const rows = txns.filter(t => (!query.from || t.date >= query.from) && (!query.to || t.date <= query.to) && (query.minimum === undefined || t.amount >= query.minimum) && (query.maximum === undefined || t.amount <= query.maximum) && (!query.categoryId || t.categoryId === query.categoryId || t.splits?.some(s => s.categoryId === query.categoryId)) && (!text || [t.note, category(t), accounts.get(t.accountId), accounts.get(t.toAccountId ?? '')].join(' ').toLocaleLowerCase().includes(text)));
    return rows.sort((a, b) => { switch (query.sort) {
        case 'date-asc': return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
        case 'amount-desc': return b.amount - a.amount || b.date.localeCompare(a.date);
        case 'amount-asc': return a.amount - b.amount || a.date.localeCompare(b.date);
        case 'category': return category(a).localeCompare(category(b)) || b.date.localeCompare(a.date);
        case 'account': return (accounts.get(a.accountId) ?? '').localeCompare(accounts.get(b.accountId) ?? '') || b.date.localeCompare(a.date);
        default: return (b.date + b.createdAt).localeCompare(a.date + a.createdAt) || a.id.localeCompare(b.id);
    } });
}
