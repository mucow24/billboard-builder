import {
  CANVAS_STORE_NAME,
  hasIndexedDb,
  withEditorObjectStore,
  withEditorStoreTransaction,
} from './indexedDbEditorDatabase';

/** A stored preview image, with the id of the library document it shows. */
export interface RawDocumentPreview {
  id: string;
  /** The image as a data URL. */
  preview: string;
}

/**
 * Raw storage of the document library. Each library document is up to three
 * records: a small entry (name, dates), so the library can be listed without
 * reading anything large; the serialized document; and a preview image, which
 * is only read when the library is shown.
 */
export interface RawDocumentLibraryStore {
  /** Every stored entry, as stored: the caller validates them. */
  readEntries(): Promise<unknown[]>;
  readDocument(id: string): Promise<string | null>;
  /** Every stored preview, as stored: the caller validates them. */
  readPreviews(): Promise<unknown[]>;
  /**
   * Stores an entry and its document together: both are stored or neither is.
   * A `preview` replaces the stored one; null leaves the stored one as it is.
   */
  write(id: string, entry: unknown, serializedDocument: string, preview: string | null): Promise<void>;
  /** Replaces the entry of a stored document and leaves the rest alone. */
  writeEntry(id: string, entry: unknown): Promise<void>;
  /** Removes the entry, the document and the preview. */
  remove(id: string): Promise<void>;
}

// The library shares the `canvas` object store with the working copy, under
// prefixed keys. A store of its own would need a new database version, and a
// build that still opens the old version then fails to open the database at
// all, so it could no longer read or autosave the canvas.
const ENTRY_KEY_PREFIX = 'library-entry:';
const DOCUMENT_KEY_PREFIX = 'library-document:';
const PREVIEW_KEY_PREFIX = 'library-preview:';

/** Every key that starts with `prefix`: U+FFFF sorts after any character an id can hold. */
function keysWithPrefix(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}${String.fromCharCode(0xffff)}`);
}

export class IndexedDbDocumentLibraryStore implements RawDocumentLibraryStore {
  async readEntries(): Promise<unknown[]> {
    return withEditorObjectStore<unknown[]>(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.getAll(keysWithPrefix(ENTRY_KEY_PREFIX)),
    );
  }

  async readDocument(id: string): Promise<string | null> {
    const result = await withEditorObjectStore<unknown>(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.get(`${DOCUMENT_KEY_PREFIX}${id}`),
    );
    return typeof result === 'string' ? result : null;
  }

  async readPreviews(): Promise<unknown[]> {
    return withEditorObjectStore<unknown[]>(CANVAS_STORE_NAME, 'readonly', (store) =>
      store.getAll(keysWithPrefix(PREVIEW_KEY_PREFIX)),
    );
  }

  async write(
    id: string,
    entry: unknown,
    serializedDocument: string,
    preview: string | null,
  ): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.put(serializedDocument, `${DOCUMENT_KEY_PREFIX}${id}`);
      store.put(entry, `${ENTRY_KEY_PREFIX}${id}`);
      if (preview !== null) {
        const record: RawDocumentPreview = { id, preview };
        store.put(record, `${PREVIEW_KEY_PREFIX}${id}`);
      }
    });
  }

  async writeEntry(id: string, entry: unknown): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.put(entry, `${ENTRY_KEY_PREFIX}${id}`);
    });
  }

  async remove(id: string): Promise<void> {
    await withEditorStoreTransaction(CANVAS_STORE_NAME, (store) => {
      store.delete(`${ENTRY_KEY_PREFIX}${id}`);
      store.delete(`${DOCUMENT_KEY_PREFIX}${id}`);
      store.delete(`${PREVIEW_KEY_PREFIX}${id}`);
    });
  }
}

/** Keeps the library for as long as the page is open. Used where IndexedDB is unavailable. */
export class InMemoryDocumentLibraryStore implements RawDocumentLibraryStore {
  private readonly entries = new Map<string, unknown>();
  private readonly documents = new Map<string, string>();
  private readonly previews = new Map<string, RawDocumentPreview>();

  async readEntries(): Promise<unknown[]> {
    return [...this.entries.values()];
  }

  async readDocument(id: string): Promise<string | null> {
    return this.documents.get(id) ?? null;
  }

  async readPreviews(): Promise<unknown[]> {
    return [...this.previews.values()];
  }

  async write(
    id: string,
    entry: unknown,
    serializedDocument: string,
    preview: string | null,
  ): Promise<void> {
    this.entries.set(id, entry);
    this.documents.set(id, serializedDocument);
    if (preview !== null) {
      this.previews.set(id, { id, preview });
    }
  }

  async writeEntry(id: string, entry: unknown): Promise<void> {
    this.entries.set(id, entry);
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id);
    this.documents.delete(id);
    this.previews.delete(id);
  }
}

export function createDefaultRawDocumentLibraryStore(): RawDocumentLibraryStore {
  return hasIndexedDb() ? new IndexedDbDocumentLibraryStore() : new InMemoryDocumentLibraryStore();
}
