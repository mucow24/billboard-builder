import {
  CANVAS_STORE_NAME,
  hasIndexedDb,
  UPLOADED_FONT_STORE_NAME,
  withEditorObjectStore,
  withEditorStoreTransaction,
} from './indexedDbEditorDatabase';

/**
 * Holds the working copy: the document in the editor as it was last autosaved,
 * and the id of the library document it is a working copy of.
 */
export interface RawCanvasStore {
  read(): Promise<string | null>;
  /** Stores the working copy and the id of its library document together: both or neither. */
  write(serializedDocument: string, documentId: string): Promise<void>;
  readDocumentId(): Promise<string | null>;
  /** Removes the working copy and the id of its library document together. */
  clear(): Promise<void>;
}

const CURRENT_DOCUMENT_KEY = 'current';
const CURRENT_DOCUMENT_ID_KEY = 'current-library-id';

export { CANVAS_STORE_NAME, UPLOADED_FONT_STORE_NAME };

export class IndexedDbCanvasStore implements RawCanvasStore {
  async read(): Promise<string | null> {
    const result = await withEditorObjectStore(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.get(CURRENT_DOCUMENT_KEY),
    );
    return typeof result === 'string' ? result : null;
  }

  async write(serializedDocument: string, documentId: string): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.put(serializedDocument, CURRENT_DOCUMENT_KEY);
      store.put(documentId, CURRENT_DOCUMENT_ID_KEY);
    });
  }

  async readDocumentId(): Promise<string | null> {
    const result = await withEditorObjectStore(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.get(CURRENT_DOCUMENT_ID_KEY),
    );
    return typeof result === 'string' && result.length > 0 ? result : null;
  }

  async clear(): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.delete(CURRENT_DOCUMENT_KEY);
      store.delete(CURRENT_DOCUMENT_ID_KEY);
    });
  }
}

export class NoopCanvasStore implements RawCanvasStore {
  async read(): Promise<string | null> {
    return null;
  }

  async write(serializedDocument: string, documentId: string): Promise<void> {
    void serializedDocument;
    void documentId;
  }

  async readDocumentId(): Promise<string | null> {
    return null;
  }

  async clear(): Promise<void> {}
}

export function createDefaultRawCanvasStore(): RawCanvasStore {
  return hasIndexedDb() ? new IndexedDbCanvasStore() : new NoopCanvasStore();
}
