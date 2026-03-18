import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDefaultRawCanvasStore,
  IndexedDbCanvasStore,
  NoopCanvasStore,
} from './indexedDbCanvasStore';

type RequestHandler<T> = (request: IDBRequest<T>) => void;

function createDbRequest<T>(
  executor: RequestHandler<T>,
  initialResult?: T,
): IDBRequest<T> {
  let result = initialResult as T;
  let error: Error | null = null;
  let onsuccess: IDBRequest<T>['onsuccess'] = null;
  let onerror: IDBRequest<T>['onerror'] = null;
  let settled: 'pending' | 'success' | 'error' = 'pending';

  const request = {} as IDBRequest<T> & {
    __resolve: (nextResult: T) => void;
    __reject: (nextError: Error) => void;
  };

  Object.defineProperties(request, {
    result: {
      configurable: true,
      get: () => result,
      set: (value: T) => {
        result = value;
      },
    },
    error: {
      configurable: true,
      get: () => error,
      set: (value: Error | null) => {
        error = value;
      },
    },
    onsuccess: {
      configurable: true,
      get: () => onsuccess,
      set: (handler: IDBRequest<T>['onsuccess']) => {
        onsuccess = handler;
        if (settled === 'success') {
          queueMicrotask(() => handler?.call(request, new Event('success') as Event));
        }
      },
    },
    onerror: {
      configurable: true,
      get: () => onerror,
      set: (handler: IDBRequest<T>['onerror']) => {
        onerror = handler;
        if (settled === 'error') {
          queueMicrotask(() => handler?.call(request, new Event('error') as Event));
        }
      },
    },
  });

  request.__resolve = (nextResult: T) => {
    settled = 'success';
    result = nextResult;
    onsuccess?.call(request, new Event('success') as Event);
  };
  request.__reject = (nextError: Error) => {
    settled = 'error';
    error = nextError;
    onerror?.call(request, new Event('error') as Event);
  };

  queueMicrotask(() => executor(request as IDBRequest<T>));
  return request as IDBRequest<T>;
}

function succeedRequest<T>(request: IDBRequest<T>, result: T) {
  (request as IDBRequest<T> & { __resolve: (nextResult: T) => void }).__resolve(result);
}

function failRequest<T>(request: IDBRequest<T>, error: Error) {
  (request as IDBRequest<T> & { __reject: (nextError: Error) => void }).__reject(error);
}

function createDatabaseHarness() {
  const close = vi.fn();
  const get = vi.fn();
  const put = vi.fn();
  const remove = vi.fn();
  const createObjectStore = vi.fn();
  const contains = vi.fn(() => false);

  const transaction: Partial<IDBTransaction> = {
    objectStore: vi.fn(
      () =>
        ({
          get,
          put,
          delete: remove,
        }) as unknown as IDBObjectStore
    ) as unknown as (name: string) => IDBObjectStore,
    oncomplete: null,
    onerror: null,
    onabort: null,
    error: null,
  };

  const database: Partial<IDBDatabase> = {
    close,
    createObjectStore,
    objectStoreNames: {
      contains,
      length: 0,
      item: () => null,
    } as unknown as DOMStringList,
    transaction: vi.fn(() => transaction as IDBTransaction),
  };

  return {
    close,
    contains,
    createObjectStore,
    database: database as IDBDatabase,
    get,
    put,
    remove,
    transaction: transaction as IDBTransaction,
  };
}

function completeTransaction(transaction: IDBTransaction) {
  transaction.oncomplete?.(new Event('complete') as Event);
}

describe('indexedDbCanvasStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a noop store when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);

    const store = createDefaultRawCanvasStore();

    expect(store).toBeInstanceOf(NoopCanvasStore);
    await expect(store.read()).resolves.toBeNull();
  });

  it('creates the canvas object store during database upgrades', async () => {
    const harness = createDatabaseHarness();
    const open = vi.fn(() => {
      const request = createDbRequest<IDBDatabase>((pendingRequest) => {
        const openRequest = pendingRequest as unknown as IDBOpenDBRequest;
        Object.defineProperty(openRequest, 'result', {
          configurable: true,
          value: harness.database,
        });
        openRequest.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
        openRequest.onsuccess?.(new Event('success') as Event);
      }, harness.database) as unknown as IDBOpenDBRequest;
      return request;
    });
    vi.stubGlobal('indexedDB', { open });

    const store = new IndexedDbCanvasStore();
    harness.get.mockImplementation(() =>
      createDbRequest((request) => {
        succeedRequest(request, 'saved');
        completeTransaction(harness.transaction);
      })
    );

    await expect(store.read()).resolves.toBe('saved');
    expect(harness.createObjectStore).toHaveBeenCalledWith('canvas');
    expect(harness.close).toHaveBeenCalled();
  });

  it('round-trips read, write, and clear requests through IndexedDB', async () => {
    const harness = createDatabaseHarness();
    harness.contains.mockReturnValue(true);
    const open = vi.fn(() => {
      const request = createDbRequest<IDBDatabase>((pendingRequest) => {
        succeedRequest(pendingRequest, harness.database);
      }, harness.database);
      return request as unknown as IDBOpenDBRequest;
    });
    vi.stubGlobal('indexedDB', { open });

    const store = new IndexedDbCanvasStore();
    harness.get.mockImplementation(() =>
      createDbRequest((request) => {
        succeedRequest(request, 'saved');
        completeTransaction(harness.transaction);
      })
    );
    harness.put.mockImplementation(() =>
      createDbRequest((request) => {
        succeedRequest(request, undefined);
        completeTransaction(harness.transaction);
      })
    );
    harness.remove.mockImplementation(() =>
      createDbRequest((request) => {
        succeedRequest(request, undefined);
        completeTransaction(harness.transaction);
      })
    );

    await expect(store.read()).resolves.toBe('saved');
    await expect(store.write('next')).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();

    expect(harness.get).toHaveBeenCalledWith('current');
    expect(harness.put).toHaveBeenCalledWith('next', 'current');
    expect(harness.remove).toHaveBeenCalledWith('current');
  });

  it('rejects when opening the database fails', async () => {
    const open = vi.fn(() => {
      const request = createDbRequest<IDBDatabase>((pendingRequest) => {
        failRequest(pendingRequest, new Error('open failed'));
      });
      return request as unknown as IDBOpenDBRequest;
    });
    vi.stubGlobal('indexedDB', { open });

    const store = new IndexedDbCanvasStore();

    await expect(store.read()).rejects.toThrow('open failed');
  });

  it('rejects when a request fails or the transaction aborts', async () => {
    const harness = createDatabaseHarness();
    harness.contains.mockReturnValue(true);
    const open = vi.fn(() => {
      const request = createDbRequest<IDBDatabase>((pendingRequest) => {
        succeedRequest(pendingRequest, harness.database);
      }, harness.database);
      return request as unknown as IDBOpenDBRequest;
    });
    vi.stubGlobal('indexedDB', { open });

    const store = new IndexedDbCanvasStore();
    harness.get.mockImplementation(() =>
      createDbRequest((request) => failRequest(request, new Error('request failed')))
    );

    await expect(store.read()).rejects.toThrow('request failed');

    harness.put.mockImplementation(() =>
      createDbRequest((request) => {
        Object.defineProperty(harness.transaction, 'error', {
          configurable: true,
          value: new Error('transaction aborted'),
        });
        harness.transaction.onabort?.(new Event('abort') as Event);
        succeedRequest(request, undefined);
      })
    );

    await expect(store.write('next')).rejects.toThrow('transaction aborted');
  });
});
