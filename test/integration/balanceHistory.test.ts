import { it, expect } from 'vitest';
import { createEmptyProfileData, normalizeProfileData } from '../../src/application/profileData';
import { accountBalanceHistory, historyBalanceThrough } from '../../src/domain/balanceHistory';
import { adjustedBalances, emptyFinancialRecords, assertFinancialRecords } from '../../src/domain/financialRecords';
import type { Txn } from '../../src/domain/types';

it('reconstructs activity-date balances with transfers, refunds and adjustments, without inventing dated opening balances', () => {
  const data = createEmptyProfileData();
  data.version = 2;
  data.accounts = [{id:'bank',name:'Bank',type:'bank',openingBalance:10000},{id:'cash',name:'Cash',type:'cash',openingBalance:0}] as typeof data.accounts;
  const tx = (id:string,date:string,type:Txn['type'],amount:number,extra:Partial<Txn>={}):Txn => ({id,date,type,amount,accountId:'bank',createdAt:'now',updatedAt:'now',...extra});
  data.txns = [tx('later','2026-02-01','income',2000),tx('purchase','2026-01-01','expense',1000),tx('transfer','2026-01-02','transfer',500,{toAccountId:'cash'}),tx('refund','2026-01-03','refund',200),tx('excluded','2026-01-04','expense',900,{archived:true})];
  data.financial = {...emptyFinancialRecords(),adjustments:[{id:'adjust',accountId:'bank',date:'2026-01-03',delta:-100,reason:'Statement correction',createdAt:'now'}]};
  const before = JSON.stringify(data), points = accountBalanceHistory(data,'bank');
  expect(points.map(p=>[p.date,p.balance])).toEqual([['2026-01-01',9000],['2026-01-02',8500],['2026-01-03',8600],['2026-02-01',10600]]);
  expect(points[2]).toMatchObject({movement:100,transactions:1,adjustments:1});
  expect(points.at(-1)!.balance).toBe(adjustedBalances(data).get('bank'));
  expect(accountBalanceHistory(data,'cash').at(-1)!.balance).toBe(500);
  expect(historyBalanceThrough(points,10000,'2025-12-31')).toBe(10000);
  expect(historyBalanceThrough(points,10000,'2026-01-31')).toBe(8600);
  data.txns[1].amount=1100;
  expect(historyBalanceThrough(accountBalanceHistory(data,'bank'),10000,'2026-01-31')).toBe(8500);
  data.txns[1].amount=1000;
  expect(JSON.stringify(data)).toBe(before);
});

it('rejects restored invalid planning configuration and reversals dated before their original adjustment', () => {
  const data=createEmptyProfileData(); data.version=2;
  for(const patch of [{debts:null},{goals:'invalid'},{health:42}])expect(()=>normalizeProfileData({...data,...patch})).toThrow();
  expect(()=>normalizeProfileData({...data,health:{...data.health,minSavingsRate:2}})).toThrow();
  expect(()=>normalizeProfileData({...data,debts:[{id:'invalid',name:'Invalid',balance:1,annualRatePct:NaN}]})).toThrow();
  data.accounts=[{id:'bank',name:'Bank',type:'bank',openingBalance:0}] as typeof data.accounts;
  const financial={...emptyFinancialRecords(),adjustments:[{id:'a',accountId:'bank',date:'2026-02-01',delta:100,reason:'Original',createdAt:'now'},{id:'b',accountId:'bank',date:'2026-01-01',delta:-100,reason:'Reversal',createdAt:'now',reversesId:'a'}]};
  expect(()=>assertFinancialRecords(financial,data)).toThrow(/reversal/);
});
