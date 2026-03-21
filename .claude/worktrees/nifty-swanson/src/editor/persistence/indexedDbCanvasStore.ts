export interface RawCanvasStore {
  read(): Promise<string | null>;
  write(serializedDocument: string): Promise<void>;
  clear(): Promise<void>;
}

const DATABASE_NAME = 'billboard-builder';
const STORE_NAME = 'canvas';
const CURRENT_DOCUMENT_KEY = 'current';
const DATABASE_VERSION = 1;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB database.'));
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function withObjectStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = operation(store);

        request.onerror = () => {
          reject(request.error ?? new Error('IndexedDB request failed.'));
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        transaction.oncomplete = () => {
          database.close();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
        };
      })
  );
}

export class IndexedDbCanvasStore implements RawCanvasStore {
  async read(): Promise<string | null> {
    const result = await withObjectStore('readonly', (store) => store.get(CURRENT_DOCUMENT_KEY));
    return typeof result === 'string' ? result : null;
  }

  async write(serializedDocument: string): Promise<void> {
    await withObjectStore('readwrite', (store) => store.put(serializedDocument, CURRENT_DOCUMENT_KEY));
  }

  async clear(): Promise<void> {
    await withObjectStore('readwrite', (store) => store.delete(CURRENT_DOCUMENT_KEY));
  }
}

export class NoopCanvasStore implements RawCanvasStore {
  async read(): Promise<string | null> {
    return null;
  }

  async write(serializedDocument: string): Promise<void> {
    void serializedDocument;
  }

  async clear(): Promise<void> {}
}

export function createDefaultRawCanvasStore(): RawCanvasStore {
  return hasIndexedDb() ? new IndexedDbCanvasStore() : new NoopCanvasStore();
}
