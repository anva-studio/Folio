import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {ProfileRepository} from '../../src/persistence/profileRepository';
import {createEmptyProfileData} from '../../src/application/profileData';
import {createBackup,importBackup} from '../../src/application/backupService';
import {checkBackup} from '../../src/application/backupCheck';

it('backs up one coherent credential/vault snapshot when another connection replaces both records between reads',async()=>{
  const name=crypto.randomUUID(),repo=new ProfileRepository({dbName:name}),other=new ProfileRepository({dbName:crypto.randomUUID()});
  await repo.open();await other.open();let writer:IDBDatabase|undefined,spy:ReturnType<typeof vi.spyOn>|undefined;
  try{
    const data=createEmptyProfileData();data.accounts=[{id:'bank',name:'Bank',type:'bank',openingBalance:12345,archived:false,createdAt:data.createdAt}];
    const profile=await repo.createProfile({label:'Snapshot race',password:"test passphrase before",data});await importBackup(other,await createBackup(repo,profile.profileId), false, {method:"password", secret:"test passphrase before"});await other.changePassword(profile.profileId,"test passphrase before","test passphrase after");const replacement=await other.getProfileRecords(profile.profileId);
    writer=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    let injected=false,complete!:()=>void,failed!:(error:unknown)=>void;
    const written=new Promise<void>((resolve,reject)=>{complete=resolve;failed=reject;}),original=IDBDatabase.prototype.transaction;
    spy=vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementation(function(this:IDBDatabase,...args:Parameters<typeof original>){
      const transaction=original.apply(this,args),stores=typeof args[0]==='string'?[args[0]]:[...args[0]];
      if(this.name===name&&args[1]==='readonly'&&stores.includes('profileIndex')&&!injected){
        injected=true;const change=writer!.transaction(['profileIndex','vaults'],'readwrite');change.objectStore('profileIndex').put(replacement.index);change.objectStore('vaults').put(replacement.vault);change.oncomplete=complete;change.onabort=()=>failed(change.error);
      }
      return transaction;
    });
    const backup=await createBackup(repo,profile.profileId);await written;expect(injected).toBe(true);
    expect(await checkBackup(backup,"test passphrase before")).toMatchObject({accounts:1,transactions:0});
    expect((await repo.unlockProfile(profile.profileId,"test passphrase after")).data.accounts[0].openingBalance).toBe(12345);
  }finally{spy?.mockRestore();writer?.close();await repo.deleteDatabase();await other.deleteDatabase();}
},10000);
