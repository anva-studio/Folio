import type { FolioController } from '../application/folioController';
export type TransactionFilters = { excluded: boolean; month: 'current' | 'all'; type: 'all' | 'income' | 'expense' | 'transfer'; account: string };
export const defaultFilters: TransactionFilters = { excluded: false, month: 'current', type: 'all', account: 'all' };
// Controller identity changes after lock/unlock. No device/profile storage.
export const lastAccounts = new WeakMap<FolioController, string>();
export const transactionFilters = new WeakMap<FolioController, TransactionFilters>();
