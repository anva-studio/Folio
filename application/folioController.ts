import { ProfileSession } from './profileSession.js';
import {assertSavedComparison,evaluateSavedComparison,type ComparisonSnapshot} from '../domain/savedComparisons';
import type { ProfileData, Account, Category, Txn, Recurring, Debt, Goal, HealthConfig } from '../domain/types.js';
import {
  assertValidAccount,
  assertValidCategory,
  assertValidTxn,
  editAccount,
  editTxn,
  setAccountArchived,
  setTxnArchived,
  consolidatedBalance,
} from '../domain/ledger.js';
import { assertValidRecurring,occurrencesInMonth } from '../domain/recurring.js';
import { summarizeMonthlyCashFlow } from '../domain/cashflow.js';
import { currentMonthKey } from '../domain/dates.js';
import { assertValidDebt, summarizeDebts, projectDebtPayoff } from '../domain/debt.js';
import { assertValidGoal, projectGoal } from '../domain/goal.js';
import { assertValidHealthConfig, evaluateFinancialHealth } from '../domain/health.js';
import { evaluateAffordabilityScenario } from '../domain/scenario.js';
import { isValidMonthKey } from '../domain/dates.js';
import {checkedLocale} from '../domain/regional';
import {assertRefundLinks} from '../domain/refunds';
import {addMinor,subMinor,sumMinor,assertMinorUnits} from '../domain/money';
import {importBasis,selectedImportRows,type ImportPreview} from './csvImport';
import {adjustedBalances,assertFinancialRecords,emptyFinancialRecords,reviewContent,reviewDigest,allocationSummary,goalAllocationBalances,type FinancialRecords,type SpendingTarget,type Allocation,type AssumptionKey,type PlanningAssumption,type SavedScenario,type RecordedDebtPayment} from '../domain/financialRecords';

type Listener = () => void;

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const arr = new Uint8Array(16);
  const c = (globalThis as any).crypto;
  if (c && 'getRandomValues' in c) {
    c.getRandomValues(arr);
  } else {
    throw new Error('Secure random not available');
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function nowIso(): string {
  return new Date().toISOString();
}

export class ReferencedEntityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencedEntityError';
  }
}

export class CannotDeleteCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CannotDeleteCategoryError';
  }
}

export class CannotUseArchivedAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CannotUseArchivedAccountError';
  }
}

export class FolioController {
  private session: ProfileSession;
  private listeners = new Set<Listener>();

  constructor(session: ProfileSession) {
    this.session = session;
  }

  get snapshot(): ProfileData {
    return this.session.getSnapshot();
  }

  getCurrency() {
    return this.session.getCurrency();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  private runUpdate(updater: (data: ProfileData) => ProfileData) {
    this.session.update(data=>{const updated=updater(data);if(updated.version===2){assertRefundLinks(updated.txns);assertFinancialRecords(updated.financial??emptyFinancialRecords(),updated);}return updated;});
    this.notify();
  }

  setProfileIdentity(identity: NonNullable<ProfileData["identity"]>) {
    this.runUpdate(data=>({...data, identity}));
  }
  importTransactions(preview:ImportPreview,selected:Set<number>){
    const data=this.snapshot;if(importBasis(data)!==preview.basis)throw new Error('Records changed since preview. Review the file again before importing');
    const incoming=selectedImportRows(preview,selected,data),now=nowIso(),categoryIds=new Map<string,string>(),usedCategories=new Set(incoming.flatMap(t=>[t.categoryId,...(t.splits??[]).map(s=>s.categoryId)]));
    const categories=preview.stagedCategories.filter(c=>usedCategories.has(c.id)).map(c=>{const name=c.name.trim();if(categoryIds.has(c.id)||data.categories.some(existing=>existing.id===c.id||existing.kind===c.kind&&existing.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('A staged category already exists. Map the existing category and review again');const category={...c,id:uid(),name};assertValidCategory(category);categoryIds.set(c.id,category.id);return category;});
    const ids=new Map(incoming.map(t=>[t.id,uid()]));
    const txns=incoming.map(t=>{if(t.debtPaymentId)throw new Error('Debt payment groups require encrypted backup restore');const txn:Txn={id:ids.get(t.id)!,type:t.type,date:t.date,amount:t.amount,accountId:t.accountId,toAccountId:t.toAccountId,categoryId:t.categoryId?(categoryIds.get(t.categoryId)??t.categoryId):undefined,note:t.note,createdAt:now,archived:t.archived,splits:t.splits?.map(s=>({...s,categoryId:categoryIds.get(s.categoryId)??s.categoryId})),refundOf:t.refundOf?(ids.get(t.refundOf)??t.refundOf):undefined,importSourceId:t.importSourceId};return txn;});
    const ctx={accountsById:new Map(data.accounts.map(a=>[a.id,a])),categoriesById:new Map([...data.categories,...categories].map(c=>[c.id,c]))};for(const t of txns){this.ensureAccountActive(t.accountId,data);if(t.toAccountId)this.ensureAccountActive(t.toAccountId,data);assertValidTxn(t,ctx);}
    this.runUpdate(d=>{const next={...d,version:2 as const,categories:[...d.categories,...categories],txns:[...d.txns,...txns],updatedAt:now};adjustedBalances(next);return next;});return txns.length;
  }

  setRegionalPreferences(patch: Partial<ProfileData['currency']>) {
    if(Object.keys(patch).some(k=>!['locale','display','firstDayOfWeek'].includes(k)))throw new Error('Profile currency cannot be relabeled');
    if(patch.locale!==undefined)checkedLocale(patch.locale);
    if(patch.display!==undefined&&!['symbol','code'].includes(patch.display))throw new Error('Invalid currency display');
    if(patch.firstDayOfWeek!==undefined&&![0,1,6].includes(patch.firstDayOfWeek))throw new Error('Invalid first day of week');
    this.runUpdate(d=>({...d,currency:{...d.currency,...patch},updatedAt:nowIso()}));
  }

  private updateFinancial(update:(f:FinancialRecords)=>FinancialRecords){
    this.runUpdate(d=>{const financial=update(d.financial??emptyFinancialRecords());assertFinancialRecords(financial,d);return {...d,version:2,financial,updatedAt:nowIso()};});
  }
  recordBalanceCheck(accountId:string,date:string,actual:number){
    this.ensureAccountActive(accountId,this.snapshot);const recorded=adjustedBalances(this.snapshot,date).get(accountId)!;
    const check={id:uid(),accountId,date,actual,recorded,checkedAt:nowIso()};this.updateFinancial(f=>({...f,checks:[...f.checks,check]}));return check.id;
  }
  recordAdjustment(accountId:string,date:string,delta:number,reason:string,reversesId?:string){
    this.ensureAccountActive(accountId,this.snapshot);const adjustment={id:uid(),accountId,date,delta,reason,createdAt:nowIso(),reversesId};
    this.updateFinancial(f=>{const next={...f,adjustments:[...f.adjustments,adjustment]};const data={...this.snapshot,financial:next};adjustedBalances(data);return next;});return adjustment.id;
  }
  saveSpendingTarget(input:Omit<SpendingTarget,'id'>,id?:string){const target={...input,id:id??uid()};this.updateFinancial(f=>({...f,targets:[...f.targets.filter(t=>t.id!==target.id),target]}));return target.id;}
  removeSpendingTarget(id:string){this.updateFinancial(f=>({...f,targets:f.targets.filter(t=>t.id!==id)}));}
  async reviewMonth(month:string,note:string){
    if(!isValidMonthKey(month)||month>=this.getCurrentMonthKey())throw new Error('Review a completed month');
    const content=reviewContent(this.snapshot,month),digest=await reviewDigest(content);if(reviewContent(this.snapshot,month)!==content)throw new Error('Records changed while reviewing; please review again');
    this.updateFinancial(f=>({...f,reviews:[...f.reviews.filter(r=>r.month!==month),{month,note,digest,reviewedAt:nowIso()}]}));
  }
  reopenMonth(month:string){this.updateFinancial(f=>({...f,reviews:f.reviews.filter(r=>r.month!==month)}));}
  saveAllocation(input:Pick<Allocation,'accountId'|'goalId'|'purpose'|'amount'>,id?:string){
    const data=this.snapshot,account=this.ensureAccountActive(input.accountId,data);if(account.type==='credit')throw new Error('Liability accounts cannot fund allocations');if(input.goalId&&!data.goals.some(g=>g.id===input.goalId&&g.funding==='allocations'))throw new Error('Choose a goal explicitly using allocation funding');
    const prior=data.financial?.allocations?.find(a=>a.id===id),allocation={...input,id:id??uid(),active:true,updatedAt:nowIso()};
    this.updateFinancial(f=>{const next={...f,allocations:[...(f.allocations??[]).filter(a=>a.id!==allocation.id),allocation]},summary=allocationSummary({...data,financial:next}).find(s=>s.account.id===input.accountId)!;if(summary.shortfall>0&&!(prior?.active&&prior.accountId===input.accountId&&input.amount<prior.amount))throw new Error('Allocations cannot exceed the recorded account balance');return next;});return allocation.id;
  }
  releaseAllocation(id:string){this.updateFinancial(f=>({...f,allocations:f.allocations?.map(a=>a.id===id?{...a,active:false,updatedAt:nowIso()}:a)}));}
  savePlanningAssumptions(values:Partial<Record<AssumptionKey,number>>){
    const assumptions=Object.entries(values).map(([key,value])=>({key:key as AssumptionKey,value:value!,origin:'user-confirmed' as const,scope:(key==='annualIncome'?'annual-estimate':['monthlyIncome','monthlyExpenses','monthlySurplus'].includes(key)?'monthly-estimate':'current-estimate') as PlanningAssumption['scope'],reviewedAt:nowIso()}));
    this.updateFinancial(f=>({...f,assumptions:[...(f.assumptions??[]).filter(a=>!(a.key in values)),...assumptions]}));
  }
  removePlanningAssumption(key:AssumptionKey){this.updateFinancial(f=>({...f,assumptions:f.assumptions?.filter(a=>a.key!==key)}));}
  saveScenario(name:string,input:SavedScenario['input'],id?:string){this.evaluateScenario(input);const scenario={id:id??uid(),name:name.trim(),input,reviewedAt:nowIso()};this.updateFinancial(f=>({...f,scenarios:[...(f.scenarios??[]).filter(s=>s.id!==scenario.id),scenario]}));return scenario.id;}
  deleteScenario(id:string){this.updateFinancial(f=>({...f,scenarios:f.scenarios?.filter(s=>s.id!==id)}));}
  savePlanningComparison(name:string,snapshot:ComparisonSnapshot,id?:string){
    const comparison={...structuredClone(snapshot),id:id??uid(),name:name.trim(),savedAt:nowIso()};assertSavedComparison(comparison);evaluateSavedComparison(comparison);
    this.updateFinancial(f=>{if(id&&!f.planningComparisons?.some(c=>c.id===id))throw new Error('This saved comparison no longer exists.');return {...f,planningComparisons:[...(f.planningComparisons??[]).filter(c=>c.id!==comparison.id),comparison]};});return comparison.id;
  }
  deletePlanningComparison(id:string){this.updateFinancial(f=>({...f,planningComparisons:f.planningComparisons?.filter(c=>c.id!==id)}));}
  setGoalFunding(id:string,funding:'legacy'|'allocations'){
    this.runUpdate(d=>{if(!d.goals.some(g=>g.id===id))throw new Error('Goal not found');if(funding==='legacy'&&d.financial?.allocations?.some(a=>a.active&&a.goalId===id))throw new Error('Release this goal’s allocations before switching progress source');return {...d,version:2,goals:d.goals.map(g=>g.id===id?{...g,funding}:g)};});
  }

  // Selectors
  getAccountBalances(activeOnly = true) {
    const snap = this.snapshot;
    const balances = adjustedBalances(snap);
    const accounts = activeOnly ? snap.accounts.filter(a => !a.archived) : snap.accounts;
    return {
      balances,
      consolidated: consolidatedBalance(accounts, balances),
      accounts,
    };
  }

  getMonthlyCashFlow(monthKey: string) {
    return summarizeMonthlyCashFlow(this.snapshot.txns, this.snapshot.recurring, monthKey);
  }

  getCurrentMonthKey(): string {
    return currentMonthKey();
  }

  getRecentTransactions(limit = 20) {
    const txns = this.snapshot.txns
      .filter(t => !t.archived)
      .slice()
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    return txns.slice(0, limit);
  }

  // Accounts
  createAccount(input: { name: string; type: Account['type']; openingBalance: number; color?: string }) {
    const id = uid();
    const now = nowIso();
    const account: Account = {
      id,
      name: input.name.trim(),
      type: input.type,
      openingBalance: input.openingBalance,
      archived: false,
      createdAt: now,
      color: input.color,
    };
    assertValidAccount(account);
    this.runUpdate(d => ({
      ...d,
      accounts: [...d.accounts, account],
      updatedAt: now,
    }));
    return id;
  }

  editAccount(id: string, patch: Partial<Account>) {
    const data = this.snapshot;
    const idx = data.accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);
    const account = data.accounts[idx];
    const merged = editAccount(account, patch, nowIso());
    this.runUpdate(d => {
      const accounts = [...d.accounts];
      accounts[idx] = merged;
      return { ...d, accounts, updatedAt: nowIso() };
    });
  }

  setAccountArchived(id: string, archived: boolean) {
    const snap = this.snapshot;
    const idx = snap.accounts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Account ${id} not found`);
    const account = snap.accounts[idx];
    const updated = setAccountArchived(account, archived, nowIso());
    this.runUpdate(d => {
      const accounts = [...d.accounts];
      accounts[idx] = updated;
      return { ...d, accounts, updatedAt: nowIso() };
    });
  }

  // Categories
  createCategory(input: { name: string; kind: Category['kind']; color?: string }) {
    const id = uid();
    const category: Category = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      color: input.color,
    };
    assertValidCategory(category);
    this.runUpdate(d => ({
      ...d,
      categories: [...d.categories, category],
      updatedAt: nowIso(),
    }));
    return id;
  }

  editCategory(id: string, patch: Partial<Category>) {
    const data = this.snapshot;
    const idx = data.categories.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Category ${id} not found`);
    const cat = data.categories[idx];
    const updated = { ...cat, ...patch };
    if (patch.name) updated.name = patch.name.trim();
    assertValidCategory(updated);
    this.runUpdate(d => {
      const categories = [...d.categories];
      categories[idx] = updated;
      return { ...d, categories, updatedAt: nowIso() };
    });
  }

  deleteCategory(id: string) {
    const data = this.snapshot;
    const usedInTxns = data.txns.some(t => t.categoryId === id || t.splits?.some(s=>s.categoryId===id));
    const usedInRecurring = data.recurring.some(r => r.categoryId === id);
    const usedInTargets = data.financial?.targets.some(target => target.categoryId === id);
    if (usedInTxns || usedInRecurring || usedInTargets) {
      throw new CannotDeleteCategoryError(`Category ${id} is referenced by transactions, recurring commitments, or spending targets`);
    }
    this.runUpdate(d => ({
      ...d,
      categories: d.categories.filter(c => c.id !== id),
      updatedAt: nowIso(),
    }));
  }

  // Transactions
  private ensureAccountActive(id: string, data: ProfileData) {
    const acc = data.accounts.find(a => a.id === id);
    if (!acc) throw new Error(`Account ${id} not found`);
    if (acc.archived) throw new CannotUseArchivedAccountError(`Account ${id} is archived`);
    return acc;
  }

  createTransaction(input: {
    type: Txn['type'];
    splits?: Txn['splits'];
    refundOf?: string;
    scheduledOccurrence?: {scheduleId:string;date:string};
    date: string;
    amount: number;
    accountId: string;
    toAccountId?: string;
    categoryId?: string;
    note?: string;
  }) {
    const data = this.snapshot;
    this.ensureAccountActive(input.accountId, data);
    if (input.toAccountId) {
      this.ensureAccountActive(input.toAccountId, data);
      if (input.accountId === input.toAccountId) throw new Error('Source and destination must differ');
    }
    if (input.type === 'transfer') {
      if (!input.toAccountId) throw new Error('Transfer requires toAccountId');
      if (input.categoryId) throw new Error('Transfers cannot have category');
    } else {
      if (!input.categoryId&&!input.splits) throw new Error(`${input.type} requires categoryId`);
    }
    const id = uid();
    const now = nowIso();
    const txn: Txn = {
      id,
      type: input.type,
      date: input.date,
      amount: input.amount,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      categoryId: input.categoryId,
      note: input.note,
      createdAt: now,
      splits:input.splits,
      refundOf:input.refundOf,
    };
    const ctx = {
      accountsById: new Map(data.accounts.map(a => [a.id, a])),
      categoriesById: new Map(data.categories.map(c => [c.id, c])),
    };
    assertValidTxn(txn, ctx);
    assertRefundLinks([...data.txns,txn]);
    let matchedFinancial=data.financial;
    if(input.scheduledOccurrence){
      const occurrence=input.scheduledOccurrence,r=data.recurring.find(r=>r.id===occurrence.scheduleId);
      if(!r||r.kind!==txn.type||!occurrencesInMonth(r,occurrence.date.slice(0,7)).includes(occurrence.date))throw new Error('This occurrence is no longer expected; review the schedule');
      const financial=data.financial??emptyFinancialRecords(),existing=financial.occurrences?.find(o=>o.scheduleId===r.id&&o.date===occurrence.date);
      if(existing)throw new Error('This occurrence already has a recorded decision. Review its existing record to avoid duplication');
      matchedFinancial={...financial,occurrences:[...(financial.occurrences??[]),{scheduleId:r.id,date:occurrence.date,state:'matched',expectedAmount:r.amount,expectedKind:r.kind,transactionIds:[id]}]};
      assertFinancialRecords(matchedFinancial,{...data,txns:[...data.txns,txn]});
    }
    this.runUpdate(d => ({
      ...d,
      version:txn.splits||txn.type==='refund'||input.scheduledOccurrence?2:d.version,
      ...(input.scheduledOccurrence?{financial:matchedFinancial}:{}),
      txns: [...d.txns, txn],
      updatedAt: now,
    }));
    return id;
  }

  editTransaction(id: string, patch: Partial<Txn>) {
    const snap = this.snapshot;
    const idx = snap.txns.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Txn ${id} not found`);
    const txn = snap.txns[idx];
    if(txn.debtPaymentId)throw new Error('Correct this grouped record from Debt payment history');
    const ctx = {
      accountsById: new Map(snap.accounts.map(a => [a.id, a])),
      categoriesById: new Map(snap.categories.map(c => [c.id, c])),
    };
    const updated = editTxn(txn, patch, ctx, nowIso());
    assertRefundLinks(snap.txns.map(t=>t.id===id?updated:t));
    // Enforce active account rule for new account references
    if (patch.accountId) this.ensureAccountActive(patch.accountId, snap);
    if (patch.toAccountId) this.ensureAccountActive(patch.toAccountId, snap);
    this.runUpdate(d => {
      const txns = [...d.txns];
      txns[idx] = updated;
      return { ...d, version:updated.splits||updated.type==='refund'?2:d.version, txns, updatedAt: nowIso() };
    });
  }

  setTxnArchived(id: string, archived: boolean) {
    const data = this.snapshot;
    const idx = data.txns.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Txn ${id} not found`);
    const txn = data.txns[idx];
    if(txn.debtPaymentId)throw new Error('Exclude or restore this payment as a group in Debt payment history');
    const updated = setTxnArchived(txn, archived, nowIso());
    assertRefundLinks(data.txns.map(t=>t.id===id?updated:t));
    this.runUpdate(d => {
      const txns = [...d.txns];
      txns[idx] = updated;
      return { ...d, txns, updatedAt: nowIso() };
    });
  }

  // Recurring
  createRecurring(input: {
    name: string;
    kind: 'income' | 'expense';
    amount: number;
    frequency: Recurring['frequency'];
    lastDayOfMonth?:boolean;
    dayOfMonth: number;
    dayOfWeek?: number;
    accountId?: string;
    categoryId?: string;
    startDate: string;
    endDate?: string;
    active?: boolean;
    note?: string;
  }) {
    const data = this.snapshot;
    if (input.accountId) {
      this.ensureAccountActive(input.accountId, data);
    }
    const id = uid();
    const rec: Recurring = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      amount: input.amount,
      frequency: input.frequency,lastDayOfMonth:input.lastDayOfMonth,
      dayOfMonth: input.dayOfMonth,
      dayOfWeek: input.dayOfWeek,
      accountId: input.accountId,
      categoryId: input.categoryId,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active ?? true,
      note: input.note,
    };
    const ctx = {
      accountsById: new Map(data.accounts.map(a => [a.id, a])),
      categoriesById: new Map(data.categories.map(c => [c.id, c])),
    };
    assertValidRecurring(rec, ctx);
    this.runUpdate(d => ({
      ...d,
      version:rec.frequency==='biweekly'||rec.dayOfMonth>28||rec.lastDayOfMonth?2:d.version,
      recurring: [...d.recurring, rec],
      updatedAt: nowIso(),
    }));
    return id;
  }

  editRecurring(id: string, patch: Partial<Recurring>) {
    const data = this.snapshot;
    const idx = data.recurring.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Recurring ${id} not found`);
    const rec = data.recurring[idx];
    const updated = { ...rec, ...patch };
    if (patch.accountId && patch.accountId !== '') {
      this.ensureAccountActive(patch.accountId, data);
    }
    const ctx = {
      accountsById: new Map(data.accounts.map(a => [a.id, a])),
      categoriesById: new Map(data.categories.map(c => [c.id, c])),
    };
    assertValidRecurring(updated, ctx);
    this.runUpdate(d => {
      const recurring = [...d.recurring];
      recurring[idx] = updated;
      return { ...d,version:updated.frequency==='biweekly'||updated.dayOfMonth>28||updated.lastDayOfMonth?2:d.version, recurring, updatedAt: nowIso() };
    });
  }

  setRecurringActive(id: string, active: boolean) {
    this.editRecurring(id, { active });
  }

  deleteRecurring(id: string) {
    if(this.snapshot.financial?.occurrences?.some(o=>o.scheduleId===id))throw new Error('This schedule has occurrence history. Deactivate it to preserve its records');
    this.runUpdate(d => ({
      ...d,
      recurring: d.recurring.filter(r => r.id !== id),
      updatedAt: nowIso(),
    }));
  }

  decideOccurrence(scheduleId:string,date:string,state:'skipped'|'no-longer-expected',note?:string){
    const data=this.snapshot,r=data.recurring.find(r=>r.id===scheduleId);if(!r||!occurrencesInMonth(r,date.slice(0,7)).includes(date))throw new Error('Choose an expected occurrence');
    this.updateFinancial(f=>{if(f.occurrences?.some(o=>o.scheduleId===scheduleId&&o.date===date))throw new Error('An occurrence decision already exists');return {...f,occurrences:[...(f.occurrences??[]),{scheduleId,date,state,expectedAmount:r.amount,expectedKind:r.kind,transactionIds:[],note}]};});
  }
  reopenOccurrence(scheduleId:string,date:string){
    this.updateFinancial(f=>({...f,occurrences:f.occurrences?.filter(o=>o.scheduleId!==scheduleId||o.date!==date)}));
  }
  matchOccurrence(scheduleId:string,date:string,transactionId:string){
    const data=this.snapshot,r=data.recurring.find(r=>r.id===scheduleId),t=data.txns.find(t=>t.id===transactionId);
    if(!r||!t||t.archived||t.type!==r.kind)throw new Error('Choose an included transaction of the same kind');
    if(!occurrencesInMonth(r,date.slice(0,7)).includes(date)&&!data.financial?.occurrences?.some(o=>o.scheduleId===scheduleId&&o.date===date))throw new Error('Occurrence is not expected');
    this.updateFinancial(f=>{const records=f.occurrences??[],existing=records.find(o=>o.scheduleId===scheduleId&&o.date===date);if(records.some(o=>o.transactionIds.includes(transactionId)))throw new Error('This transaction is already linked to an occurrence');return {...f,occurrences:[...records.filter(o=>o!==existing),{scheduleId,date,state:'matched',expectedAmount:existing?.expectedAmount??r.amount,expectedKind:existing?.expectedKind??r.kind,transactionIds:[...(existing?.transactionIds??[]),transactionId]}]};});
  }

  // Debt operations
  createDebt(input: { name: string; kind: Debt['kind']; balance: number; annualRatePct: number; monthlyPayment: number; dueDay?: number; startDate?: string; active?: boolean; note?: string }) {
    const id = uid();
    const debt: Debt = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      balance: input.balance,
      annualRatePct: input.annualRatePct,
      monthlyPayment: input.monthlyPayment,
      dueDay: input.dueDay,
      startDate: input.startDate,
      active: input.active ?? true,
      note: input.note,
    };
    assertValidDebt(debt);
    this.runUpdate(d => ({
      ...d,
      debts: [...d.debts, debt],
      updatedAt: nowIso(),
    }));
    return id;
  }

  editDebt(id: string, patch: Partial<Debt>) {
    const data = this.snapshot;
    const idx = data.debts.findIndex(d => d.id === id);
    if (idx === -1) throw new Error(`Debt ${id} not found`);
    const debt = data.debts[idx];
    if('linkedLiabilityAccountId' in patch)throw new Error('Use the explicit liability linking workflow');
    if(debt.linkedLiabilityAccountId&&patch.balance!==undefined&&patch.balance!==debt.balance)throw new Error('The linked debt balance comes from its liability account; correct the underlying records');
    const merged = { ...debt, ...patch };
    if (patch.name) merged.name = patch.name.trim();
    assertValidDebt(merged);
    this.runUpdate(d => {
      const debts = [...d.debts];
      debts[idx] = merged;
      return { ...d, debts, updatedAt: nowIso() };
    });
  }

  setDebtActive(id: string, active: boolean) {
    this.editDebt(id, { active });
  }

  deleteDebt(id: string) {
    if(this.snapshot.financial?.debtPayments?.some(p=>p.debtId===id))throw new Error('This debt has payment history. Deactivate it to preserve its audit trail');
    this.runUpdate(d => ({
      ...d,
      debts: d.debts.filter(debt => debt.id !== id),
      updatedAt: nowIso(),
    }));
  }

  getResolvedDebts(){const data=this.snapshot,balances=adjustedBalances(data);return data.debts.map(d=>d.linkedLiabilityAccountId?{...d,balance:Math.max(0,-(balances.get(d.linkedLiabilityAccountId)??0))}:d);}
  linkDebtAccount(debtId:string,accountId:string){
    const data=this.snapshot,debt=data.debts.find(d=>d.id===debtId),account=this.ensureAccountActive(accountId,data);
    if(!debt||account.type!=='credit')throw new Error('Choose an existing debt and a liability account');if(debt.linkedLiabilityAccountId)throw new Error('This debt is already linked');
    const balance=adjustedBalances(data).get(accountId)??0;if(balance>=0||-balance!==debt.balance)throw new Error('The account liability and entered debt balance must match exactly before linking. Review or correct them first');
    this.runUpdate(d=>({...d,version:2,financial:d.financial??emptyFinancialRecords(),debts:d.debts.map(item=>item.id===debtId?{...item,linkedLiabilityAccountId:accountId}:item)}));
  }
  recordDebtPayment(input:{debtId:string;accountId:string;date:string;principal:number;interest:number;fees:number;interestCategoryId?:string;feesCategoryId?:string;note?:string}){
    const data=this.snapshot,debt=this.getResolvedDebts().find(d=>d.id===input.debtId);if(!debt?.linkedLiabilityAccountId)throw new Error('Link this debt to a liability account first');
    const source=this.ensureAccountActive(input.accountId,data);this.ensureAccountActive(debt.linkedLiabilityAccountId,data);if(source.type==='credit'||source.id===debt.linkedLiabilityAccountId)throw new Error('Choose a non-liability payment account');
    for(const value of [input.principal,input.interest,input.fees]){assertMinorUnits(value);if(value<0)throw new Error('Payment parts must be nonnegative');}if(sumMinor([input.principal,input.interest,input.fees])<=0||input.principal>debt.balance)throw new Error('Enter a positive payment; the liability reduction cannot exceed the recorded debt');
    const id=uid(),now=nowIso(),txns:Txn[]=[];const add=(type:Txn['type'],amount:number,categoryId?:string)=>{if(!amount)return undefined;const t:Txn={id:uid(),type,date:input.date,amount,accountId:source.id,toAccountId:type==='transfer'?debt.linkedLiabilityAccountId:undefined,categoryId,note:input.note??debt.name,createdAt:now,debtPaymentId:id};assertValidTxn(t,{accountsById:new Map(data.accounts.map(a=>[a.id,a])),categoriesById:new Map(data.categories.map(c=>[c.id,c]))});txns.push(t);return t.id;};
    const payment:RecordedDebtPayment={id,debtId:debt.id,accountId:source.id,liabilityAccountId:debt.linkedLiabilityAccountId,date:input.date,principal:input.principal,interest:input.interest,fees:input.fees,principalTxnId:add('transfer',input.principal),interestTxnId:add('expense',input.interest,input.interestCategoryId),feesTxnId:add('expense',input.fees,input.feesCategoryId),outstandingBefore:debt.balance,outstandingAfter:subMinor(debt.balance,input.principal),excluded:false,note:input.note??'',createdAt:now};
    this.runUpdate(d=>{const next={...d,version:2 as const,txns:[...d.txns,...txns],financial:{...(d.financial??emptyFinancialRecords()),debtPayments:[...(d.financial?.debtPayments??[]),payment]}};adjustedBalances(next);return next;});return id;
  }
  setDebtPaymentExcluded(id:string,excluded:boolean){
    this.runUpdate(d=>{const payment=d.financial?.debtPayments?.find(p=>p.id===id);if(!payment)throw new Error('Payment not found');return {...d,txns:d.txns.map(t=>t.debtPaymentId===id?{...t,archived:excluded,updatedAt:nowIso()}:t),financial:{...d.financial!,debtPayments:d.financial!.debtPayments!.map(p=>p.id===id?{...p,excluded}:p)}};});
  }

  // Goal operations
  createGoal(input: { name: string; targetAmount: number; method: Goal['method']; monthlyContribution: number; targetDate?: string; annualRatePct?: number; linkedAccountId?: string; manualSaved?: number; active?: boolean }) {
    const id = uid();
    const now = nowIso();
    let linkedAccountId = input.linkedAccountId;
    let manualSaved = input.manualSaved;
    if (linkedAccountId) {
      const data = this.snapshot;
      const acc = data.accounts.find(a => a.id === linkedAccountId);
      if (!acc) throw new Error(`Account ${linkedAccountId} not found`);
      if (acc.archived) throw new Error(`Account ${linkedAccountId} is archived`);
      manualSaved = undefined;
    }
    const goal: Goal = {
      id,
      name: input.name.trim(),
      targetAmount: input.targetAmount,
      method: input.method,
      monthlyContribution: input.monthlyContribution,
      targetDate: input.targetDate,
      annualRatePct: input.annualRatePct,
      linkedAccountId,
      manualSaved,
      active: input.active ?? true,
      createdAt: now,
    };
    assertValidGoal(goal);
    this.runUpdate(d => ({
      ...d,
      goals: [...d.goals, goal],
      updatedAt: now,
    }));
    return id;
  }

  editGoal(id: string, patch: Partial<Goal>) {
    const data = this.snapshot;
    const idx = data.goals.findIndex(g => g.id === id);
    if (idx === -1) throw new Error(`Goal ${id} not found`);
    const goal = data.goals[idx];
    // Clone to avoid mutation
    let merged = { ...goal };
    if (patch.name) merged.name = patch.name.trim();

    const hasLinked = Object.prototype.hasOwnProperty.call(patch, 'linkedAccountId');
    const hasManual = Object.prototype.hasOwnProperty.call(patch, 'manualSaved');

    // Apply patches for linked/manual with explicit presence
    if (hasLinked) {
      const targetId = patch.linkedAccountId;
      if (targetId) {
        const acc = data.accounts.find(a => a.id === targetId);
        if (!acc) throw new Error(`Account ${targetId} not found`);
        // Allow unchanged historical archived link when targetId equals current goal.linkedAccountId
        if (acc.archived && targetId !== goal.linkedAccountId) {
          throw new Error(`Account ${targetId} is archived`);
        }
      }
      merged.linkedAccountId = targetId || undefined;
    }
    if (hasManual) {
      merged.manualSaved = patch.manualSaved;
    }

    // Apply remaining patches (excluding linked/manual which already handled)
    const { linkedAccountId, manualSaved, ...rest } = patch;
    merged = { ...merged, ...rest };
    if (patch.name) merged.name = patch.name.trim();

    // Enforce mutual exclusion based on final requested source
    if (hasLinked && patch.linkedAccountId) {
      // non-empty linked explicitly selected -> clear manual
      merged.manualSaved = undefined;
    }
    if (hasManual && patch.manualSaved !== undefined) {
      // numeric manual explicitly selected -> clear linked
      merged.linkedAccountId = undefined;
    }
    // If both explicitly cleared (both present with undefined), both remain undefined

    // Method switch clearing
    if (patch.method) {
      if (patch.method === 'fixed') {
        merged.targetDate = undefined;
        merged.annualRatePct = undefined;
      } else if (patch.method === 'growth') {
        merged.targetDate = undefined;
      } else if (patch.method === 'target-date') {
        // targetDate required will be validated
      }
    }

    assertValidGoal(merged);
    this.runUpdate(d => {
      const goals = [...d.goals];
      goals[idx] = merged;
      return { ...d, goals, updatedAt: nowIso() };
    });
  }

  setGoalActive(id: string, active: boolean) {
    this.editGoal(id, { active });
  }

  deleteGoal(id: string) {
    this.runUpdate(d => ({
      ...d,
      goals: d.goals.filter(g => g.id !== id),
      ...(d.financial?{financial:{...d.financial,allocations:d.financial.allocations?.map(a=>a.goalId===id?{...a,goalId:undefined,active:false,updatedAt:nowIso()}:a)}}:{}),
      updatedAt: nowIso(),
    }));
  }

  // Health config operations
  getHealthConfig(): HealthConfig {
    return this.snapshot.health;
  }

  updateHealthConfig(patch: Partial<HealthConfig>) {
    const data = this.snapshot;
    const merged = { ...data.health, ...patch };
    assertValidHealthConfig(merged);
    this.runUpdate(d => ({
      ...d,
      health: merged,
      updatedAt: nowIso(),
    }));
  }

  // Debt helpers
  getDebtSummary() {
    return summarizeDebts(this.getResolvedDebts().filter(d=>d.balance>0));
  }

  projectDebt(id: string, options?: { maxMonths?: number }) {
    const debt = this.getResolvedDebts().find(d => d.id === id);
    if (!debt) throw new Error(`Debt ${id} not found`);
    if(debt.balance===0)return {openingBalance:0,firstMonthInterest:0,firstMonthPrincipal:0,amortizes:true,monthsToPayoff:0,totalInterest:0,totalPaid:0,finalPayment:0,truncated:false};
    return projectDebtPayoff(debt, options);
  }

  // Goal helpers
  projectGoal(id: string, asOfDate: string, availableMonthlySurplus: number) {
    const goal = this.snapshot.goals.find(g => g.id === id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    const balances = this.getAccountBalances(false);
    const ctx = { accountBalances: balances.balances,goalAllocations:goalAllocationBalances(this.snapshot) };
    return projectGoal(goal, asOfDate, availableMonthlySurplus, ctx);
  }

  // Health evaluation
  evaluateHealth(input: { liquidFunds: number; monthlyIncome: number; monthlyExpenses: number; totalDebt: number; annualIncome: number }) {
    const config = this.getHealthConfig();
    return evaluateFinancialHealth(input, config);
  }

  // getEmergencyReserveTarget removed – Planner now delegates via evaluateHealth

  // Scenario evaluation
  evaluateScenario(input: { currentLiquidFunds: number; emergencyReserve: number; currentMonthlySurplus: number; upfrontCost: number; addedMonthlyCost: number; horizonMonths?: number }) {
    return evaluateAffordabilityScenario(input);
  }

  // Report helpers
  getMonthlyCategoryTotals(monthKey: string) {
    if (!isValidMonthKey(monthKey)) throw new Error('invalid month key');
    const snap = this.snapshot;
    const totals = new Map<string, { income: number; expense: number }>();
    for (const txn of snap.txns) {
      if (txn.archived) continue;
      if (txn.type === 'transfer') continue;
      const mk = txn.date.slice(0,7);
      if (mk !== monthKey) continue;
      for(const item of txn.splits??[{categoryId:txn.categoryId??'uncategorized',amount:txn.amount}]){
        const current=totals.get(item.categoryId)??{income:0,expense:0};
        if(txn.type==='income')current.income=addMinor(current.income,item.amount);
        else current.expense=addMinor(current.expense,txn.type==='refund'?-item.amount:item.amount);
        totals.set(item.categoryId,current);
      }
    }
    return totals;
  }
}
