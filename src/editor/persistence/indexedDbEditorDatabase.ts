export const EDITOR_DATABASE_NAME = 'billboard-builder';
export const CANVAS_STORE_NAME = 'canvas';
export const UPLOADED_FONT_STORE_NAME = 'uploaded-fonts';
const OBJECT_STORE_NAMES = [CANVAS_STORE_NAME, UPLOADED_FONT_STORE_NAME] as const;
const EDITOR_DATABASE_VERSION = 2;

export type EditorObjectStoreName = (typeof OBJECT_STORE_NAMES)[number];

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function ensureObjectStores(database: IDBDatabase) {
  for (const storeName of OBJECT_STORE_NAMES) {
    if (!database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName);
    }
  }
}

function openEditorDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(EDITOR_DATABASE_NAME, EDITOR_DATABASE_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB database.'));
    };
    request.onupgradeneeded = () => {
      ensureObjectStores(request.result);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

/**
 * Runs several requests against one object store in a single transaction, so
 * they are all stored or none is. Resolves once the transaction has completed.
 */
export function withEditorStoreTransaction(
  storeName: EditorObjectStoreName,
  operations: (store: IDBObjectStore) => void,
): Promise<void> {
  return openEditorDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const fail = (error: unknown) => {
          database.close();
          reject(error);
        };
        let transaction: IDBTransaction;
        try {
          transaction = database.transaction(storeName, 'readwrite');
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            fail(transaction.error ?? new Error('IndexedDB transaction failed.'));
          };
          transaction.onabort = () => {
            fail(transaction.error ?? new Error('IndexedDB transaction aborted.'));
          };
          operations(transaction.objectStore(storeName));
        } catch (error) {
          fail(error);
        }
      }),
  );
}

export function withEditorObjectStore<T>(
  storeName: EditorObjectStoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openEditorDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
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
      }),
  );
}
