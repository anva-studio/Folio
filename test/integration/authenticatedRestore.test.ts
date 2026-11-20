import 'fake-indexeddb/auto';
import {readFileSync} from 'node:fs';
import {afterEach, expect, it} from 'vitest';
import {ProfileRepository} from '../../src/persistence/profileRepository';
import {createBackup, importBackup, prepareBackupImport} from '../../src/application/backupService';
import {createEmptyProfileData} from '../../src/application/profileData';
import {encryptVault} from '../../src/persistence/vault';

const password = 'public restore test passphrase';
const repositories: ProfileRepository[] = [];
afterEach(async()=>{for(const repo of repositories.splice(0)){await repo.close();await repo.deleteDatabase();}});
async function setup(hook?:()=>Promise<void>) {
  const repo = new ProfileRepository({dbName:crypto.randomUUID(),testHooks:{beforeBackupVaultWrite:hook}});
  repositories.push(repo);await repo.open();
  const profile=await repo.createProfile({label:'Keep these records',password,data:createEmptyProfileData()});
  const backup=await createBackup(repo,profile.profileId);
  return {repo,profile,backup,before:await repo.getProfileRecords(profile.profileId)};
}
const credential = {method:'password' as const,secret:password};

it('requires authentication even for a new import and rejects forged prepared candidates',async()=>{
  const {repo,backup,before,profile}=await setup();
  await expect(importBackup(repo,backup,true)).rejects.toThrow(/Authenticate/);
  await expect(repo.commitBackupImport({profileId:profile.profileId,label:'forged',replacesExisting:true},true)).rejects.toThrow(/Verify/);
  expect(await repo.getProfileRecords(profile.profileId)).toEqual(before);
});

it('authenticates once, preserves the checked candidate and consumes its write authority',async()=>{
  const {repo,backup,profile}=await setup();
  const candidate=await prepareBackupImport(repo,backup,credential);
  backup.profile.vault.ciphertextBase64='invalid after verification';
  await repo.commitBackupImport(candidate,true);
  expect((await repo.unlockProfile(profile.profileId,password)).data.txns).toEqual([]);
  await expect(repo.commitBackupImport(candidate,true)).rejects.toThrow(/Verify/);
});

it.each(['wrong password','corrupt ciphertext','tampered verifier','unsupported KDF','unsupported schema','unreadable ciphertext'])('keeps destination unchanged on %s',async(kind)=>{
  const {repo,backup,before,profile}=await setup();
  let secret=password;
  if(kind==='wrong password')secret='incorrect';
  if(kind==='corrupt ciphertext')backup.profile.vault.ciphertextBase64='AAAA'+backup.profile.vault.ciphertextBase64.slice(4);
  if(kind==='tampered verifier')backup.profile.index.authVerifierBase64=btoa('x'.repeat(32));
  if(kind==='unsupported KDF')backup.profile.index.kdf.iterations=2**31;
  if(kind==='unsupported schema')backup.profile.vault.vaultSchemaVersion=999;
  if(kind==='unreadable ciphertext')backup.profile.vault.ciphertextBase64=btoa('x'.repeat(64));
  await expect(importBackup(repo,backup,true,{method:'password',secret})).rejects.toThrow();
  expect(await repo.getProfileRecords(profile.profileId)).toEqual(before);
  expect((await repo.unlockProfile(profile.profileId,password)).data.txns).toEqual([]);
});

it('rejects decryptable financial invalidity before granting replacement authority',async()=>{
  const {repo,backup,before,profile}=await setup();
  const material=await repo.unlockProfile(profile.profileId,password);
  const invalid={...material.data,version:2,txns:[{id:'bad',amount:-10}]} as unknown as typeof material.data;
  backup.profile.vault={profileId:profile.profileId,...await encryptVault(material.encryptionKey,profile.profileId,1,invalid)};
  await expect(importBackup(repo,backup,true,credential)).rejects.toThrow();
  expect(await repo.getProfileRecords(profile.profileId)).toEqual(before);
});

it.each(['interrupted write','quota write failure'])('rolls back both records on %s',async(message)=>{
  const {repo,backup,before,profile}=await setup(async()=>{throw new Error(message);});
  await expect(importBackup(repo,backup,true,credential)).rejects.toThrow(message);
  expect(await repo.getProfileRecords(profile.profileId)).toEqual(before);
});

it('rejects a prepared replacement after a concurrent financial save',async()=>{
  const {repo,backup,profile}=await setup();
  const pending=await prepareBackupImport(repo,backup,credential);
  const material=await repo.unlockProfile(profile.profileId,password);
  material.data.health.targetEmergencyMonths=9;
  await repo.saveUnlockedProfile(profile.profileId,material.revision,material.encryptionKey,material.data);
  const before=await repo.getProfileRecords(profile.profileId);
  await expect(repo.commitBackupImport(pending,true)).rejects.toMatchObject({name:'ProfileConflictError'});
  expect(await repo.getProfileRecords(profile.profileId)).toEqual(before);
});

it('handles configured historical recovery and rejects a different valid recovery credential',async()=>{
  const {repo,profile}=await setup();
  const first=await repo.prepareRecoveryCredential(profile.profileId,password);await first.commit();
  const backup=await createBackup(repo,profile.profileId);
  const second=await repo.prepareRecoveryCredential(profile.profileId,password);await second.commit();
  const before=await repo.getProfileRecords(profile.profileId);
  await expect(importBackup(repo,backup,true,{method:'recovery',secret:second.secret})).rejects.toThrow();
  expect(await repo.getProfileRecords(profile.profileId)).toEqual(before);
  await importBackup(repo,backup,true,{method:'recovery',secret:first.secret});
  expect((await repo.getRecoveryInfo(profile.profileId)).fingerprint).toBe(first.fingerprint);
});

it('imports the unchanged released-1.0.0 fixture with its recorded historical password',async()=>{
  const {repo}=await setup();
  const file=JSON.parse(readFileSync(new URL('../fixtures/released-1.0.0.folio',import.meta.url),'utf8'));
  await importBackup(repo,file,false,{method:'password',secret:'public-fixture-password'});
  expect((await repo.unlockProfile(file.profile.index.profileId,'public-fixture-password')).data.txns[0].amount).toBe(12345);
});
