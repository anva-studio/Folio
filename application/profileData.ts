import type { ProfileData, CurrencyConfig, HealthConfig } from '../domain/types';
import {checkedLocale} from '../domain/regional';
import {assertValidTxn,assertValidAccount,assertValidCategory} from '../domain/ledger';
import {assertRefundLinks} from '../domain/refunds';
import {assertFinancialRecords,emptyFinancialRecords} from '../domain/financialRecords';
import {assertValidRecurring} from '../domain/recurring';
import {assertValidGoal} from '../domain/goal';
import {assertValidDebt} from '../domain/debt';
import {assertValidHealthConfig} from '../domain/health';
import {adjustedBalances,goalAllocationBalances} from '../domain/financialRecords';

const INR: CurrencyConfig = {
  code: 'INR',
  symbol: '₹',
  minorDigits: 2,
  indianGrouping: true,
};

const DEFAULT_HEALTH: HealthConfig = {
  targetEmergencyMonths: 6,
  maxDebtToIncome: 4,
  minSavingsRate: 0.1,
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyProfileData(clock?: { now: () => string }): ProfileData {
  const now = (clock?.now ?? nowIso)();
  return {
    version: 1,
    currency: INR,
    accounts: [],
    categories: [],
    txns: [],
    recurring: [],
    debts: [],
    goals: [],
    health: DEFAULT_HEALTH,
    onboardingDone: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeProfileData(data: unknown): ProfileData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid profile data');
  }
  const raw = data as Record<string, unknown>;
  if (typeof raw.version !== 'number') {
    throw new Error('Invalid profile data: missing version');
  }
  const version = raw.version;
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported profile version ${version}`);
  }
  // Core Phase-D fields must exist and be correctly shaped; do not default to empty
  if (typeof raw.currency !== 'object' || raw.currency === null) {
    throw new Error('Invalid profile data: missing currency');
  }
  if (!Array.isArray(raw.accounts)) {
    throw new Error('Invalid profile data: missing accounts');
  }
  if (!Array.isArray(raw.categories)) {
    throw new Error('Invalid profile data: missing categories');
  }
  if (!Array.isArray(raw.txns)) {
    throw new Error('Invalid profile data: missing txns');
  }
  if (!Array.isArray(raw.recurring)) {
    throw new Error('Invalid profile data: missing recurring');
  }
  if (typeof raw.createdAt !== 'string') {
    throw new Error('Invalid profile data: missing createdAt');
  }
  if (typeof raw.updatedAt !== 'string') {
    throw new Error('Invalid profile data: missing updatedAt');
  }

  const currency = raw.currency as CurrencyConfig;
  // Validate currency shape strictly
  if (typeof currency.code !== 'string' || currency.code.length === 0) {
    throw new Error('Invalid profile data: currency.code missing');
  }
  if (typeof currency.symbol !== 'string' || currency.symbol.length === 0) {
    throw new Error('Invalid profile data: currency.symbol missing');
  }
  if (!Number.isSafeInteger(currency.minorDigits) || currency.minorDigits < 0 || currency.minorDigits > 6) {
    throw new Error('Invalid profile data: currency.minorDigits invalid');
  }
  if (typeof currency.indianGrouping !== 'boolean') {
    throw new Error('Invalid profile data: currency.indianGrouping missing');
  }
  if(currency.locale!==undefined)checkedLocale(currency.locale);
  if(currency.display!==undefined&&!['symbol','code'].includes(currency.display))throw new Error('Invalid currency display');
  if(currency.firstDayOfWeek!==undefined&&![0,1,6].includes(currency.firstDayOfWeek))throw new Error('Invalid first day of week');

  const accounts = raw.accounts;
  const categories = raw.categories;
  const txns = raw.txns;
  const recurring = raw.recurring;
  if (version === 2) {
    for (const field of ['debts', 'goals'] as const) {
      if (raw[field] !== undefined && !Array.isArray(raw[field])) throw new Error(`Invalid profile data: ${field} must be an array`);
    }
    if (raw.health !== undefined && (raw.health === null || typeof raw.health !== 'object' || Array.isArray(raw.health))) throw new Error('Invalid profile data: health must be an object');
  }
  const debts = Array.isArray(raw.debts) ? raw.debts : [];
  const goals = Array.isArray(raw.goals) ? raw.goals : [];
  const health = typeof raw.health === 'object' && raw.health !== null ? (raw.health as HealthConfig) : DEFAULT_HEALTH;
  if (typeof raw.onboardingDone !== 'boolean') {
    throw new Error('Invalid profile data: missing onboardingDone');
  }
  const onboardingDone = raw.onboardingDone as boolean;
  const createdAt = raw.createdAt as string;
  const updatedAt = raw.updatedAt as string;

  if(version===1&&(raw.financial!==undefined||txns.some(t=>t.type==='refund'||t.splits!==undefined||t.debtPaymentId!==undefined)||debts.some(d=>d.linkedLiabilityAccountId!==undefined)||goals.some(g=>g.funding==='allocations')))throw new Error('New financial features require profile format 2');
  if(version===2){
    const data={...raw,accounts,categories,txns,recurring,debts,goals} as unknown as ProfileData;
    const unique=(rows:{id:string}[],label:string)=>{const ids=new Set<string>();for(const row of rows){if(typeof row?.id!=='string'||!row.id||ids.has(row.id))throw new Error(`Invalid or duplicate ${label} ID`);ids.add(row.id);}};
    for(const [rows,label] of [[accounts,'account'],[categories,'category'],[txns,'transaction'],[recurring,'schedule'],[debts,'debt'],[goals,'goal']] as const)unique(rows,label);
    for(const a of accounts)assertValidAccount(a);
    for(const c of categories)assertValidCategory(c);
    const ctx={accountsById:new Map(accounts.map(a=>[a.id,a])),categoriesById:new Map(categories.map(c=>[c.id,c]))};
    for(const t of txns)assertValidTxn(t,ctx);
    for(const r of recurring)assertValidRecurring(r,ctx);
    for(const d of debts)assertValidDebt(d);
    assertValidHealthConfig(health);
    assertRefundLinks(txns);
    assertFinancialRecords((raw.financial===undefined?emptyFinancialRecords():raw.financial) as NonNullable<ProfileData['financial']>,data);
    const goalContext={accountBalances:adjustedBalances(data),goalAllocations:goalAllocationBalances(data)};
    for(const g of goals)assertValidGoal(g,goalContext);
  }

  // Stricter legacy validation: ensure Phase-D required fields are present
  // (no defaulting for core fields)
  return {
    version,
    ...(raw.financial!==undefined?{financial:raw.financial as ProfileData['financial']}:{}),
    ...(typeof raw.identity === "object" && raw.identity !== null ? {identity: validIdentity(raw.identity)} : {}),
    ...(typeof raw.example === "object" && raw.example !== null ? {example: raw.example as ProfileData["example"]} : {}),
    currency,
    accounts,
    categories,
    txns,
    recurring,
    debts,
    goals,
    health,
    onboardingDone,
    createdAt,
    updatedAt,
  };
}

function validIdentity(raw:unknown):{photo?:string}{
 const photo=(raw as {photo?:unknown}).photo;
 if(photo===undefined)return {};
 if(typeof photo!=='string'||photo.length>150000||(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)&&photo!=='/example-meera.webp'))throw new Error('Invalid profile picture');
 return {photo};
}
