import 'fake-indexeddb/auto';
import {readFileSync} from 'node:fs';
import {afterEach, expect, it} from 'vitest';
import {ProfileRepository} from '../../src/persistence/profileRepository';
import {importBackup, createBackup, validateBackup} from '../../src/application/backupService';
import {createEmptyProfileData} from '../../src/application/profileData';
import {assertKdfPolicy, assertNewPassword} from '../../src/security/credentialPolicy';
import {deriveProfileKeys, createPasswordVerifier} from '../../src/security/crypto';
import {bytesToBase64} from '../../src/security/encoding';
import {encryptVault} from '../../src/persistence/vault';
import {ProfileSession} from '../../src/application/profileSession';
const repositories: ProfileRepository[]=[];
afterEach(async()=>{for(const repo of repositories.splice(0)){await repo.close();await repo.deleteDatabase();}});
async function repository(hook?:()=>Promise<void>){
 const repo=new ProfileRepository({dbName:crypto.randomUUID(),testHooks:{beforePasswordChangeCommit:hook}});
 repositories.push(repo);await repo.open();return repo;
}
it('accepts bounded policy versions and rejects unsupported or extreme parameters',()=>{
 expect(()=>assertKdfPolicy({algorithm:'PBKDF2',hash:'SHA-256',iterations:310000})).not.toThrow();
 expect(()=>assertKdfPolicy({algorithm:'PBKDF2',hash:'SHA-256',iterations:600000,version:2})).not.toThrow();
 for(const iterations of [0,-1,1,599999,NaN,Infinity,2**31]){
  expect(()=>assertKdfPolicy({algorithm:'PBKDF2',hash:'SHA-256',iterations})).toThrow();
 }
 expect(()=>assertKdfPolicy({algorithm:'PBKDF2',hash:'SHA-256',iterations:310000,version:2})).toThrow();
});
it('requires long new passwords without composition rules',()=>{
 for(const password of ['pw','password1234','123456789012','            ','x'.repeat(20),'x'.repeat(1025)])expect(()=>assertNewPassword(password)).toThrow();
 expect(()=>assertNewPassword('paper lantern quiet river')).not.toThrow();
});
it('creates policy-2 records and preserves them in authenticated backups',async()=>{
 const repo=await repository();
 const profile=await repo.createProfile({label:'Current',password:'paper lantern quiet river',data:createEmptyProfileData()});
 const backup=await createBackup(repo,profile.profileId);
 expect(backup.profile.index.kdf).toMatchObject({iterations:600000,version:2});
 expect(validateBackup(backup)).toEqual(backup);
 expect((await repo.unlockProfile(profile.profileId,'paper lantern quiet river')).data.version).toBe(1);
 await expect(repo.unlockProfile(profile.profileId,'wrong')).rejects.toThrow();
});
it('keeps frozen legacy credentials usable and upgrades explicitly through atomic password change',async()=>{
 const repo=await repository();
 const file=JSON.parse(readFileSync(new URL('../fixtures/released-1.0.0.folio',import.meta.url),'utf8'));
 await importBackup(repo,file,false,{method:'password',secret:'public-fixture-password'});
 const id=file.profile.index.profileId;
 const old=await repo.unlockProfile(id,'public-fixture-password');
 expect((await repo.getProfileRecords(id)).index.kdf.iterations).toBe(310000);
 await repo.changePassword(id,'public-fixture-password','paper lantern quiet river');
 expect((await repo.getProfileRecords(id)).index.kdf).toMatchObject({version:2,iterations:600000});
 expect((await repo.unlockProfile(id,'paper lantern quiet river')).data).toEqual(old.data);
 await expect(repo.unlockProfile(id,'public-fixture-password')).rejects.toThrow();
});
it('keeps both old records usable when an explicit password upgrade is interrupted',async()=>{
 const repo=await repository(async()=>{throw new Error('Interrupted');});
 const file=JSON.parse(readFileSync(new URL('../fixtures/released-1.0.0.folio',import.meta.url),'utf8'));
 await importBackup(repo,file,false,{method:'password',secret:'public-fixture-password'});
 const id=file.profile.index.profileId,before=await repo.getProfileRecords(id);
 await expect(repo.changePassword(id,'public-fixture-password','paper lantern quiet river')).rejects.toThrow('Interrupted');
 expect(await repo.getProfileRecords(id)).toEqual(before);
 expect((await repo.unlockProfile(id,'public-fixture-password')).data.txns).toHaveLength(1);
});
it('still unlocks historical short passwords while rejecting them for new credentials',async()=>{
 const repo=await repository(),profileId=crypto.randomUUID(),salt=crypto.getRandomValues(new Uint8Array(16));
 const keys=await deriveProfileKeys('pw',salt,310000),data=createEmptyProfileData();
 const file={
  format:'folio-encrypted-backup' as const,backupVersion:1,exportedAt:data.createdAt,
  profile:{
   index:{profileId,label:'Historical short credential',createdAt:data.createdAt,updatedAt:data.updatedAt,
    kdf:{algorithm:'PBKDF2' as const,hash:'SHA-256' as const,iterations:310000,saltBase64:bytesToBase64(salt)},
    authVerifierBase64:bytesToBase64(await createPasswordVerifier(keys.authKey))},
   vault:{profileId,...await encryptVault(keys.encryptionKey,profileId,1,data)},
  },
 };
 await importBackup(repo,file,false,{method:'password',secret:'pw'});
 expect((await repo.unlockProfile(profileId,'pw')).data).toEqual(data);
 await expect(repo.changePassword(profileId,'pw','pw')).rejects.toThrow(/12 characters/);
 expect((await repo.unlockProfile(profileId,'pw')).data).toEqual(data);
});
it('authenticates retained failed-save work against its original session credentials',async()=>{
 const repo=await repository(),oldPassword='original retained passphrase',newPassword='replacement storage passphrase';
 const profile=await repo.createProfile({label:'Retained',password:oldPassword,data:createEmptyProfileData()});
 const session=new ProfileSession(repo,{autosaveDelayMs:60000});await session.unlock(profile.profileId,oldPassword);
 await repo.changePassword(profile.profileId,oldPassword,newPassword);
 session.update(data=>({...data,health:{...data.health,targetEmergencyMonths:9}}));
 await expect(session.flush()).rejects.toMatchObject({name:'ProfileConflictError'});
 await expect(session.verifyPassword(newPassword)).rejects.toThrow();
 await expect(session.verifyPassword(oldPassword)).resolves.toBeUndefined();
 expect(session.getSnapshot().health.targetEmergencyMonths).toBe(9);
 expect((await repo.unlockProfile(profile.profileId,newPassword)).data.health.targetEmergencyMonths).toBe(6);
 session.discardAndLock();
 await expect(session.verifyPassword(oldPassword)).rejects.toThrow(/locked/i);
});
