// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { createEmptyProfileData } from '../../src/application/profileData';
import { makeUiRepo, renderFolio, cleanupUiRepo } from './testHarness';
import type { ProfileData } from '../../src/domain/types';
import { EntryDialog } from '../../src/ui/components/EntryDialog';
import { useDialogAccessibility } from '../../src/ui/hooks/useDialogAccessibility';
import { combinedGoalDemand } from '../../src/ui/presentation';
import { todayKey } from '../../src/domain/dates';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const base=()=>{
 const data=createEmptyProfileData();
 data.accounts=[{id:'a',name:'Bank',type:'bank',openingBalance:100000,archived:false,createdAt:'2026-09-01T00:00:00Z'},{id:'b',name:'Cash',type:'cash',openingBalance:0,archived:false,createdAt:'2026-09-01T00:00:00Z'}];
 data.categories=[{id:'food',name:'Food',kind:'expense'}];return data;
};
async function open(data:ProfileData,section:string){
 const {repo}=makeUiRepo('v1');await repo.open();await repo.createProfile({label:'V1',password:'pw',data});
 const {unmount}=renderFolio(repo);await screen.findByText('Select a profile');fireEvent.click(document.querySelector('.profile-row-btn')!);fireEvent.change(screen.getByLabelText('Password'),{target:{value:'pw'}});fireEvent.click(screen.getByRole('button',{name:'Unlock'}));await screen.findByText('Dashboard',{selector:'.screen-title'});fireEvent.click(screen.getAllByRole('button',{name:section}).find(b=>b.className.includes('nav-item'))!);
 return {repo,finish:()=>cleanupUiRepo(repo,unmount)};
}
describe('V1 daily-use and honest planning',()=>{
 it('dashboard flags a recorded shortfall without claiming complete finances',async()=>{
  const data=base();data.txns=[{id:'expense',type:'expense',date:todayKey(),amount:10000,accountId:'a',categoryId:'food',createdAt:new Date().toISOString()}];const app=await open(data,'Dashboard');expect(screen.getByText(/Your records may be incomplete/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Review recorded transactions'}));expect(screen.getByRole('heading',{name:'Transactions'})).toBeTruthy();await app.finish();
 });
 it('does not present an empty debt module as a positive debt-health judgment',async()=>{
  const app=await open(base(),'Health checks');for(const [name,value] of [['Liquid funds','6000'],['Monthly income','1000'],['Monthly expenses','500'],['Annual income','12000']])fireEvent.change(screen.getByLabelText(name),{target:{value}});
  expect(screen.getByText('No active Debt records')).toBeTruthy();expect(screen.getByText(/does not establish that you have no debt/)).toBeTruthy();await app.finish();
 });
 it('retrieves every matching record beyond the old 200 limit and filters full history',async()=>{
  const data=base();data.txns=Array.from({length:245},(_,i)=>({id:'t'+i,type:'expense' as const,date:i===0?'2025-01-01':'2026-09-26',amount:100,accountId:i===0?'b':'a',categoryId:'food',note:'Record '+i,createdAt:`2026-09-26T00:00:${String(i%60).padStart(2,'0')}Z`}));
  const app=await open(data,'Transactions');
  fireEvent.click(screen.getByRole('button',{name:'All transactions'}));expect(screen.getByText('Showing 100 of 245 matching transactions')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Load more transactions'}));fireEvent.click(screen.getByRole('button',{name:'Load more transactions'}));expect(screen.getByText('Record 0')).toBeTruthy();expect(screen.getByText('Showing 245 of 245 matching transactions')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Account'),{target:{value:'b'}});expect(screen.getByText('Showing 1 of 1 matching transactions')).toBeTruthy();await app.finish();
 });
 it('save-and-add-another retains catch-up context, rejects invalid input and records once',async()=>{
  const app=await open(base(),'Transactions');fireEvent.click(screen.getByRole('button',{name:'New transaction'}));
  const dialog=screen.getByRole('dialog',{name:'New transaction'});
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByLabelText('Amount')));
  fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2026-09-20'}});fireEvent.change(screen.getByLabelText('Account',{selector:'#transaction-account'}),{target:{value:'b'}});fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'20'}});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'food'}});fireEvent.change(screen.getByLabelText('Note'),{target:{value:'Lunch'}});
  const another=within(dialog).getByRole('button',{name:'Save and add another'});fireEvent.click(another);
  expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-09-20');expect((screen.getByLabelText('Account',{selector:'#transaction-account'}) as HTMLSelectElement).value).toBe('b');expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('');expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('');expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('');
  await Promise.resolve();fireEvent.click(another);expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'30'}});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'food'}});await Promise.resolve();fireEvent.click(another);await Promise.resolve();
  fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'New transaction'}));expect((screen.getByLabelText('Account',{selector:'#transaction-account'}) as HTMLSelectElement).value).toBe('b');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  fireEvent.click(screen.getAllByRole('button',{name:'Lock'})[0]);await screen.findByText('Select a profile');const profile=(await app.repo.listProfiles())[0];const unlocked=await app.repo.unlockProfile(profile.profileId,'pw');expect(unlocked.data.txns).toHaveLength(2);expect(unlocked.data.txns.map(t=>t.amount)).toEqual([2000,3000]);expect(unlocked.data.txns.every(t=>t.accountId==='b' && t.date==='2026-09-20')).toBe(true);await app.finish();
 });
 it('mobile transfers show both accounts without duplicating desktop records',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));const data=base();data.txns=[{id:'transfer',type:'transfer',date:'2026-09-26',amount:100,accountId:'a',toAccountId:'b',createdAt:'2026-09-26T00:00:00Z'}];const app=await open(data,'Transactions');fireEvent.click(screen.getByRole('button',{name:'All transactions'}));expect(screen.getByText('Bank → Cash')).toBeTruthy();expect(screen.queryByRole('table')).toBeNull();await app.finish();
 });
 it('combined demand uses active projections, not separate full-surplus judgments',()=>{
  const data=base();data.goals=[{id:'psp',name:'PSP',method:'fixed',targetAmount:800000,manualSaved:200000,monthlyContribution:50000,active:true,createdAt:'2026-09-01T00:00:00Z'},{id:'other',name:'Other',method:'fixed',targetAmount:100000,monthlyContribution:30000,active:true,createdAt:'2026-09-01T00:00:00Z'},{id:'inactive',name:'Inactive',method:'fixed',targetAmount:100000,monthlyContribution:90000,active:false,createdAt:'2026-09-01T00:00:00Z'}];expect(combinedGoalDemand(data,new Map(), '2026-09-26')).toEqual({total:80000,unavailable:[]});
  data.goals.push({id:'past',name:'Past deadline',method:'target-date',targetAmount:100000,monthlyContribution:0,targetDate:'2026-01-01',active:true,createdAt:'2026-01-01T00:00:00Z'});expect(combinedGoalDemand(data,new Map(),'2026-09-26')).toEqual({total:80000,unavailable:['Past deadline']});
 });
 it('mobile schedules remain separate from recorded transactions and are readable',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
  const data=base();data.recurring=[{id:'rent',name:'Rent',kind:'expense',amount:800000,frequency:'monthly',dayOfMonth:1,startDate:'2026-01-01',active:true,accountId:'a',categoryId:'food'}];
  const app=await open(data,'Scheduled');expect(screen.queryByRole('table')).toBeNull();expect(screen.getByText('Rent')).toBeTruthy();expect(screen.getByText(/Schedules do not move money/)).toBeTruthy();
  fireEvent.click(screen.getByText('Rent').closest('details')!.querySelector('summary')!);
  expect(screen.getByRole('button',{name:'Edit'})).toBeTruthy();
  const profile=(await app.repo.listProfiles())[0];expect((await app.repo.unlockProfile(profile.profileId,'pw')).data.txns).toEqual([]);await app.finish();
 });
 it('mobile debt has an explicit non-payoff state and does not deduct account balances',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));const data=base();
  data.debts=[{id:'loan',name:'Loan',kind:'personal',balance:10000000,annualRatePct:12,monthlyPayment:1,active:true}];
  const app=await open(data,'Debt');expect(screen.queryByRole('table')).toBeNull();expect(screen.getByText('Cannot calculate')).toBeTruthy();expect(screen.getByText(/Balance will not decrease/)).toBeTruthy();
  expect(screen.getByText(/not deducted from account totals/)).toBeTruthy();await app.finish();
 });
 it('filters survive screen changes within the unlocked session',async()=>{
  const app=await open(base(),'Transactions');fireEvent.click(screen.getByRole('button',{name:'All transactions'}));fireEvent.change(screen.getByLabelText('Account'),{target:{value:'b'}});
  fireEvent.click(screen.getAllByRole('button',{name:'Reports'}).find(b=>b.className.includes('nav-item'))!);fireEvent.click(screen.getAllByRole('button',{name:'Transactions'}).find(b=>b.className.includes('nav-item'))!);
  expect((screen.getByLabelText('Account') as HTMLSelectElement).value).toBe('b');expect(screen.getByRole('button',{name:'All transactions'}).className).toContain('active');await app.finish();
 });
 it('health targets display a percentage while preserving the stored ratio',async()=>{
  const app=await open(base(),'Health checks');fireEvent.click(screen.getByRole('button',{name:'Edit targets'}));
  const rate=screen.getByLabelText('Minimum surplus rate (%)');fireEvent.change(rate,{target:{value:'101'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(screen.getByText('Enter a percentage between 0 and 100')).toBeTruthy();expect(document.activeElement).toBe(rate);
  fireEvent.change(rate,{target:{value:'20'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getAllByRole('button',{name:'Lock'})[0]);await screen.findByText('Select a profile');const profile=(await app.repo.listProfiles())[0];expect((await app.repo.unlockProfile(profile.profileId,'pw')).data.health.minSavingsRate).toBe(.2);await app.finish();
 });
});
function GuardHarness(){useDialogAccessibility();const [open,setOpen]=useState(true);return <EntryDialog open={open} title="Entry" onClose={()=>setOpen(false)}><input aria-label="Value" defaultValue="original"/><button>Cancel</button></EntryDialog>;}
describe('Entry dismissal contract',()=>{
 it('keeps the focused input visible when the viewport resizes and removes its listener on close',async()=>{
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());render(<GuardHarness/>);const input=screen.getByLabelText('Value');const reveal=vi.fn();input.scrollIntoView=reveal;await waitFor(()=>expect(document.activeElement).toBe(input));fireEvent(window,new Event('resize'));expect(reveal).toHaveBeenCalledWith({block:'center',inline:'nearest',behavior:'instant'});fireEvent.click(screen.getByRole('button',{name:'Close'}));reveal.mockClear();fireEvent(window,new Event('resize'));expect(reveal).not.toHaveBeenCalled();
 });
 it('continues a requested exit only after explicit discard and guards browser close',()=>{
  render(<GuardHarness/>);fireEvent.change(screen.getByLabelText('Value'),{target:{value:'changed'}});const proceed=vi.fn();
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);
  fireEvent(window,new CustomEvent('folio:requestDismiss',{detail:proceed}));expect(proceed).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));expect(proceed).not.toHaveBeenCalled();
  fireEvent(window,new CustomEvent('folio:requestDismiss',{detail:proceed}));fireEvent.click(screen.getByRole('button',{name:'Discard entry'}));expect(proceed).toHaveBeenCalledTimes(1);expect(screen.queryByRole('dialog')).toBeNull();
 });
 it.each(['close','outside','escape','cancel'])('guards changed entries through %s and preserves them when editing continues',async mechanism=>{
  render(<GuardHarness/>);fireEvent.change(screen.getByLabelText('Value'),{target:{value:'changed'}});
  if(mechanism==='close')fireEvent.click(screen.getByRole('button',{name:'Close'}));if(mechanism==='outside')fireEvent.click(screen.getByRole('dialog',{name:'Entry'}));if(mechanism==='escape'){await waitFor(()=>expect(document.activeElement).toBe(screen.getByLabelText('Value')));fireEvent.keyDown(document,{key:'Escape'});}if(mechanism==='cancel')fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  const confirm=await screen.findByRole('dialog',{name:'Discard unfinished entry?'});fireEvent.click(within(confirm).getByRole('button',{name:'Keep editing'}));expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe('changed');fireEvent.click(screen.getByRole('button',{name:'Close'}));fireEvent.click(screen.getByRole('button',{name:'Discard entry'}));expect(screen.queryByRole('dialog')).toBeNull();
 });
});


