import { StorageError } from '../security/errors.js';

export interface IDBWrapperOptions {
  dbName?: string;
  version?: number;
}

const DEFAULT_DB_NAME = 'folio';
const DEFAULT_VERSION = 1;

export class IDBWrapper {
  private dbName: string;
  private version: number;
  private dbPromise?: Promise<IDBDatabase>;

  constructor(options: IDBWrapperOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.version = options.version ?? DEFAULT_VERSION;
  }

  async open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('profileIndex')) {
          db.createObjectStore('profileIndex', { keyPath: 'profileId' });
        }
        if (!db.objectStoreNames.contains('vaults')) {
          db.createObjectStore('vaults', { keyPath: 'profileId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new StorageError('Failed to open IndexedDB'));
      req.onblocked = () => reject(new StorageError('IndexedDB open blocked'));
    });

    return this.dbPromise;
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      try { db.close(); } catch {}
      this.dbPromise = undefined;
    }
  }

  async transaction(
    storeNames: string | string[],
    mode: IDBTransactionMode
  ): Promise<IDBTransaction> {
    const db = await this.open();
    return db.transaction(storeNames, mode);
  }

  async withReadwriteTransaction<T>(
    storeNames: string | string[],
    callback: (stores: Record<string, IDBObjectStore>) => Promise<T>
  ): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(storeNames, 'readwrite');
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const stores: Record<string, IDBObjectStore> = {};
    for (const name of names) {
      stores[name] = tx.objectStore(name);
    }
    try {
      const result = await callback(stores);
      await this.waitForComplete(tx);
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Ignore abort if transaction already finished
      }
      try {
        await this.waitForComplete(tx);
      } catch {
        // Expected after abort
      }
      throw error;
    }
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const tx = await this.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(new StorageError(`get failed on ${storeName}`));
    });
  }

  async put<T>(storeName: string, value: T): Promise<void> {
    const tx = await this.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await new Promise<void>((resolve, reject) => {
      const req = store.put(value as any);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new StorageError(`put failed on ${storeName}`));
    });
    await this.waitForComplete(tx);
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const tx = await this.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new StorageError(`delete failed on ${storeName}`));
    });
    await this.waitForComplete(tx);
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const tx = await this.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(new StorageError(`getAll failed on ${storeName}`));
    });
  }

  private waitForComplete(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new StorageError('Transaction failed'));
      tx.onabort = () => reject(new StorageError('Transaction aborted'));
    });
  }

  async deleteDatabase(): Promise<void> {
    await this.close();
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this.dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new StorageError('Failed to delete database'));
      req.onblocked = () => {
        setTimeout(() => {
          try { resolve(); } catch {}
        }, 0);
      };
    });
  }
}
