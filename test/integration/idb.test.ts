import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBWrapper } from '../../src/persistence/idb.js';

describe('IDB transaction rollback', () => {
  let idb: IDBWrapper;
  let dbName: string;

  beforeEach(async () => {
    dbName = `folio_idb_test_${Math.random().toString(36).slice(2)}`;
    idb = new IDBWrapper({ dbName });
    await idb.open();
  });

  it('rolls back when callback throws after first write', async () => {
    await idb.withReadwriteTransaction(['profileIndex', 'vaults'], async (stores) => {
      const indexStore = stores.profileIndex as IDBObjectStore;
      const record = { profileId: 'test', label: 'Test' };
      await new Promise<void>((resolve, reject) => {
        const req = indexStore.add(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('add failed'));
      });
      // Verify the request resolved (write queued)
      const existing = await new Promise<any>((resolve, reject) => {
        const req = indexStore.get('test');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error('get failed'));
      });
      expect(existing).toEqual(record);

      // Intentional failure before writing vault
      throw new Error('intentional rollback test');
    }).catch(() => { /* expected */ });

    const idx = await idb.get<any>('profileIndex', 'test');
    const vault = await idb.get<any>('vaults', 'test');
    expect(idx).toBeUndefined();
    expect(vault).toBeUndefined();
  });

  it('rolls back when vault written first then error', async () => {
    await idb.withReadwriteTransaction(['profileIndex', 'vaults'], async (stores) => {
      const vaultStore = stores.vaults as IDBObjectStore;
      const vaultRecord = { profileId: 'test2', data: 'x' };
      await new Promise<void>((resolve, reject) => {
        const req = vaultStore.add(vaultRecord);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('add failed'));
      });
      throw new Error('intentional rollback test');
    }).catch(() => { /* expected */ });

    const idx = await idb.get<any>('profileIndex', 'test2');
    const vault = await idb.get<any>('vaults', 'test2');
    expect(idx).toBeUndefined();
    expect(vault).toBeUndefined();
  });
});
