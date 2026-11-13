import {
  CANVAS_STORE_NAME,
  hasIndexedDb,
  withEditorObjectStore,
  withEditorStoreTransaction,
} from './indexedDbEditorDatabase';

/**
 * Raw storage of the document library. Each library document is two records:
 * a small entry (name, preview, dates), so the library can be listed without
 * reading any document, and the serialized document itself.
 */
export interface RawDocumentLibraryStore {
  /** Every stored entry, as stored: the caller validates them. */
  readEntries(): Promise<unknown[]>;
  readDocument(id: string): Promise<string | null>;
  /** Stores an entry and its document together: both are stored or neither is. */
  write(id: string, entry: unknown, serializedDocument: string): Promise<void>;
  /** Replaces the entry of a stored document and leaves the document alone. */
  writeEntry(id: string, entry: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

// The library shares the `canvas` object store with the working copy, under
// prefixed keys. A store of its own would need a new database version, and a
// build that still opens the old version then fails to open the database at
// all, so it could no longer read or autosave the canvas.
const ENTRY_KEY_PREFIX = 'library-entry:';
const DOCUMENT_KEY_PREFIX = 'library-document:';

function entryKey(id: string) {
  return `${ENTRY_KEY_PREFIX}${id}`;
}

function documentKey(id: string) {
  return `${DOCUMENT_KEY_PREFIX}${id}`;
}

export class IndexedDbDocumentLibraryStore implements RawDocumentLibraryStore {
  async readEntries(): Promise<unknown[]> {
    // Every key that starts with the prefix: U+FFFF sorts after any character an id can hold.
    const allEntryKeys = IDBKeyRange.bound(
      ENTRY_KEY_PREFIX,
      `${ENTRY_KEY_PREFIX}${String.fromCharCode(0xffff)}`,
    );
    return withEditorObjectStore<unknown[]>(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.getAll(allEntryKeys),
    );
  }

  async readDocument(id: string): Promise<string | null> {
    const result = await withEditorObjectStore<unknown>(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.get(documentKey(id)),
    );
    return typeof result === 'string' ? result : null;
  }

  async write(id: string, entry: unknown, serializedDocument: string): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.put(serializedDocument, documentKey(id));
      store.put(entry, entryKey(id));
    });
  }

  async writeEntry(id: string, entry: unknown): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.put(entry, entryKey(id));
    });
  }

  async remove(id: string): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.delete(entryKey(id));
      store.delete(documentKey(id));
    });
  }
}

/** Keeps the library for as long as the page is open. Used where IndexedDB is unavailable. */
export class InMemoryDocumentLibraryStore implements RawDocumentLibraryStore {
  private readonly entries = new Map<string, unknown>();
  private readonly documents = new Map<string, string>();

  async readEntries(): Promise<unknown[]> {
    return [...this.entries.values()];
  }

  async readDocument(id: string): Promise<string | null> {
    return this.documents.get(id) ?? null;
  }

  async write(id: string, entry: unknown, serializedDocument: string): Promise<void> {
    this.entries.set(id, entry);
    this.documents.set(id, serializedDocument);
  }

  async writeEntry(id: string, entry: unknown): Promise<void> {
    this.entries.set(id, entry);
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id);
    this.documents.delete(id);
  }
}

export function createDefaultRawDocumentLibraryStore(): RawDocumentLibraryStore {
  return hasIndexedDb() ? new IndexedDbDocumentLibraryStore() : new InMemoryDocumentLibraryStore();
}
