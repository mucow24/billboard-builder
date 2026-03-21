import {
  CANVAS_STORE_NAME,
  hasIndexedDb,
  UPLOADED_FONT_STORE_NAME,
  withEditorObjectStore,
} from './indexedDbEditorDatabase';

export interface RawCanvasStore {
  read(): Promise<string | null>;
  write(serializedDocument: string): Promise<void>;
  clear(): Promise<void>;
}

const CURRENT_DOCUMENT_KEY = 'current';

export { CANVAS_STORE_NAME, UPLOADED_FONT_STORE_NAME };

export class IndexedDbCanvasStore implements RawCanvasStore {
  async read(): Promise<string | null> {
    const result = await withEditorObjectStore(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.get(CURRENT_DOCUMENT_KEY),
    );
    return typeof result === 'string' ? result : null;
  }

  async write(serializedDocument: string): Promise<void> {
    await withEditorObjectStore(CANVAS_STORE_NAME, 'readwrite', (store) =>
      store.put(serializedDocument, CURRENT_DOCUMENT_KEY),
    );
  }

  async clear(): Promise<void> {
    await withEditorObjectStore(CANVAS_STORE_NAME, 'readwrite', (store) =>
      store.delete(CURRENT_DOCUMENT_KEY),
    );
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
