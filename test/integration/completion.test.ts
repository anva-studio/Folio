// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {ExampleRepository,EXAMPLE_ID,EXAMPLE_PASSWORD,EXAMPLE_VERSION,createExampleData,exampleDeleted} from '../../src/application/exampleProfile';
import {ProfileRepository} from '../../src/persistence/profileRepository';
import {ProfileSession} from '../../src/application/profileSession';
import {FolioController} from '../../src/application/folioController';
import {createEmptyProfileData,normalizeProfileData} from '../../src/application/profileData';
import {computeAccountBalances,assertValidTxn,assertValidAccount,assertValidCategory} from '../../src/domain/ledger';
import {assertValidRecurring} from '../../src/domain/recurring';
import {assertValidGoal,projectGoal} from '../../src/domain/goal';
import {assertValidDebt} from '../../src/domain/debt';
import {createBackup,importBackup} from '../../src/application/backupService';
import {HELP,searchHelp} from '../../src/application/helpContent';
import {allowedExternal,CONTACT,EMAIL_URL} from '../../src/application/externalActions';
import {prepareProfilePhoto} from '../../src/application/profilePhoto';
let count=0;const repositories:ProfileRepository[]=[];
const sandbox=()=>{const r=new ExampleRepository('test-completion-example-'+count++);repositories.push(r);return r;};
afterEach(async()=>{localStorage.clear();vi.restoreAllMocks();while(repositories.length){const r=repositories.pop()!;await r.close();await r.deleteDatabase();}});
describe('Canonical fictional record',()=>{
 it('uses real ledger validation and coherent positive balances over six months',()=>{
  const data=createExampleData(new Date('2026-10-26T12:00:00Z'));
  data.accounts.forEach(assertValidAccount);data.categories.forEach(assertValidCategory);data.txns.forEach(t=>assertValidTxn(t,{accountsById:new Map(data.accounts.map(a=>[a.id,a])),categoriesById:new Map(data.categories.map(c=>[c.id,c]))}));data.recurring.forEach(r=>assertValidRecurring(r));data.debts.forEach(assertValidDebt);data.goals.forEach(g=>assertValidGoal(g));
  expect(new Set(data.txns.map(t=>t.date.slice(0,7))).size).toBe(6);const balances=computeAccountBalances(data.accounts,data.txns);expect([...balances.values()].every(n=>Number.isSafeInteger(n)&&n>=0)).toBe(true);
  const transfer=data.txns.find(t=>t.type==='transfer')!;const without=computeAccountBalances(data.accounts,data.txns.filter(t=>t.id!==transfer.id));expect([...balances.values()].reduce((a,b)=>a+b,0)).toBe([...without.values()].reduce((a,b)=>a+b,0));
  expect(data.goals.every(g=>projectGoal(g,'2026-10-26',0,{accountBalances:balances}))).toBe(true);
 });
 it('anchors only on creation/reset and preserves existing experiments and old dataset versions',async()=>{
  const repo=sandbox();await repo.ensure();const state=await repo.unlockProfile(EXAMPLE_ID,EXAMPLE_PASSWORD);state.data.example!.datasetVersion=0;state.data.example!.anchorMonth='2020-01';state.data.accounts[0].name='My experiment';await repo.saveUnlockedProfile(EXAMPLE_ID,state.revision,state.encryptionKey,state.data);await repo.ensure();const reopened=await repo.unlockProfile(EXAMPLE_ID,EXAMPLE_PASSWORD);expect(reopened.data.accounts[0].name).toBe('My experiment');expect(reopened.data.example).toEqual({datasetVersion:0,anchorMonth:'2020-01'});
 });
 it('serializes rapid creation into exactly one fixed sandbox identity',async()=>{const repo=sandbox();await Promise.all([repo.ensure(),repo.ensure(),repo.ensure()]);expect((await repo.listProfiles()).map(p=>p.profileId)).toEqual([EXAMPLE_ID]);});
 it('deletion stays deleted until explicit restore',async()=>{const repo=sandbox();await repo.ensure();await repo.remove();expect(exampleDeleted()).toBe(true);expect(await repo.listProfiles()).toEqual([]);await expect(repo.ensure()).rejects.toThrow(/Restore Example Profile/);await repo.ensure(true);expect(exampleDeleted()).toBe(false);expect((await repo.unlockProfile(EXAMPLE_ID,EXAMPLE_PASSWORD)).data.example?.datasetVersion).toBe(EXAMPLE_VERSION);});
 it('reset rejects stale writes and leaves personal encrypted records byte-for-byte unchanged',async()=>{
  const personal=new ProfileRepository({dbName:'test-personal-'+count++});repositories.push(personal);const created=await personal.createProfile({label:'Meera Rao',password:'private',data:createEmptyProfileData()});const before=await personal.getProfileRecords(created.profileId);
  const repo=sandbox();await repo.ensure();const stale=await repo.unlockProfile(EXAMPLE_ID,EXAMPLE_PASSWORD);await repo.reset();stale.data.accounts[0].name='Stale';await expect(repo.saveUnlockedProfile(EXAMPLE_ID,stale.revision,stale.encryptionKey,stale.data)).rejects.toThrow(/conflict/i);expect((await repo.unlockProfile(EXAMPLE_ID,EXAMPLE_PASSWORD)).data.accounts[0].name).not.toBe('Stale');await repo.remove();await repo.ensure(true);expect(await personal.getProfileRecords(created.profileId)).toEqual(before);
 });
 it('retains the authoritative photo inside encrypted backup/restore without index thumbnails',async()=>{
  const repo=new ProfileRepository({dbName:'photo-'+count++});repositories.push(repo);const created=await repo.createProfile({label:'Private',password:'pw',data:createEmptyProfileData()});const session=new ProfileSession(repo);await session.unlock(created.profileId,'pw');new FolioController(session).setProfileIdentity({photo:'data:image/jpeg;base64,dGVzdA=='});await session.lock();const backup=await createBackup(repo,created.profileId);expect(JSON.stringify(backup)).not.toContain('data:image');expect(backup.profile.index).not.toHaveProperty('identity');await repo.deleteProfile(created.profileId);await importBackup(repo,backup);expect((await repo.unlockProfile(created.profileId,'pw')).data.identity?.photo).toBe('data:image/jpeg;base64,dGVzdA==');
 });
 it('accepts old records without identity and rejects remote or oversized picture metadata',()=>{const data=createEmptyProfileData();expect(normalizeProfileData(data)).not.toHaveProperty('identity');expect(()=>normalizeProfileData({...data,identity:{photo:'https://example.com/private.jpg'}})).toThrow(/picture/);expect(()=>normalizeProfileData({...data,identity:{photo:'data:image/jpeg;base64,'+'a'.repeat(150000)}})).toThrow(/picture/);});
});
describe('Local support and image boundaries',()=>{
 it('covers sixteen categories with valid stable related links and matching search synonyms',()=>{expect(new Set(HELP.map(a=>a.category)).size).toBe(16);expect(new Set(HELP.map(a=>a.id)).size).toBe(HELP.length);for(const a of HELP)for(const id of a.related??[])expect(HELP.some(target=>target.id===id)).toBe(true);expect(searchHelp('recurring').some(a=>a.id==='recorded-scheduled')).toBe(true);expect(searchHelp('recovery').some(a=>a.id==='password')).toBe(true);expect(searchHelp('demo').some(a=>a.id==='example')).toBe(true);expect(searchHelp('unfindablexyz')).toEqual([]);});
 it('permits only the four configured exact destinations',()=>{for(const url of [CONTACT.website,CONTACT.feedback,CONTACT.coffee,EMAIL_URL])expect(allowedExternal(url)).toBe(true);for(const url of ['https://anva-studio.github.io.evil.com/','https://forms.gle/other','mailto:someone@else.com','javascript:alert(1)',CONTACT.website+'?secret=1'])expect(allowedExternal(url)).toBe(false);});
 it('rejects unsupported and oversized local image files before decoding',async()=>{await expect(prepareProfilePhoto(new File(['x'],'photo.svg',{type:'image/svg+xml'}))).rejects.toThrow(/JPEG/);await expect(prepareProfilePhoto(new File([new Uint8Array(16*1024*1024)],'photo.jpg',{type:'image/jpeg'}))).rejects.toThrow(/15 MB/);});
});
