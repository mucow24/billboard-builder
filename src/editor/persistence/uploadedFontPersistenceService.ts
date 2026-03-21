import { z } from 'zod';

import type { DocumentFontReference, UploadedFont } from '../document/documentTypes';
import type { PersistedUploadedFont } from '../fonts';
import {
  hasIndexedDb,
  UPLOADED_FONT_STORE_NAME,
  withEditorObjectStore,
} from './indexedDbEditorDatabase';

export interface RawUploadedFontStore {
  clear(): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  read(key: string): Promise<unknown>;
  write(key: string, value: PersistedUploadedFont): Promise<void>;
}

const persistedUploadedFontSchema = z.object({
  family: z.string(),
  sourceName: z.string(),
  weight: z.enum(['400', '700']),
  style: z.enum(['normal', 'italic']),
  kind: z.literal('uploaded'),
  bytes: z.custom<ArrayBuffer>((value) => value instanceof ArrayBuffer),
});

function isUploadedReference(
  reference: DocumentFontReference,
): reference is Extract<DocumentFontReference, { kind: 'uploaded' }> {
  return reference.kind === 'uploaded';
}

function dedupeUploadedFontKeys(references: DocumentFontReference[]): string[] {
  return [...new Set(references.filter(isUploadedReference).map(toUploadedFontPersistenceKey))];
}

export function toUploadedFontPersistenceKey(
  font: Pick<DocumentFontReference, 'kind' | 'sourceName'>,
): string {
  return `${font.kind}:${font.sourceName}`;
}

function parsePersistedUploadedFont(value: unknown): PersistedUploadedFont | null {
  const result = persistedUploadedFontSchema.safeParse(value);
  return result.success ? result.data : null;
}

export class IndexedDbUploadedFontStore implements RawUploadedFontStore {
  async clear(): Promise<void> {
    await withEditorObjectStore(UPLOADED_FONT_STORE_NAME, 'readwrite', (store) => store.clear());
  }

  async delete(key: string): Promise<void> {
    await withEditorObjectStore(UPLOADED_FONT_STORE_NAME, 'readwrite', (store) =>
      store.delete(key),
    );
  }

  async keys(): Promise<string[]> {
    const result = await withEditorObjectStore(UPLOADED_FONT_STORE_NAME, 'readonly', (store) =>
      store.getAllKeys(),
    );
    return result.flatMap((key) => (typeof key === 'string' ? [key] : []));
  }

  async read(key: string): Promise<unknown> {
    return withEditorObjectStore(UPLOADED_FONT_STORE_NAME, 'readonly', (store) =>
      store.get(key),
    );
  }

  async write(key: string, value: PersistedUploadedFont): Promise<void> {
    await withEditorObjectStore(UPLOADED_FONT_STORE_NAME, 'readwrite', (store) =>
      store.put(value, key),
    );
  }
}

export class NoopUploadedFontStore implements RawUploadedFontStore {
  async clear(): Promise<void> {}

  async delete(key: string): Promise<void> {
    void key;
  }

  async keys(): Promise<string[]> {
    return [];
  }

  async read(key: string): Promise<unknown> {
    void key;
    return null;
  }

  async write(key: string, value: PersistedUploadedFont): Promise<void> {
    void key;
    void value;
  }
}

export function createDefaultRawUploadedFontStore(): RawUploadedFontStore {
  return hasIndexedDb() ? new IndexedDbUploadedFontStore() : new NoopUploadedFontStore();
}

export class UploadedFontPersistenceService {
  private readonly store: RawUploadedFontStore;

  constructor(store: RawUploadedFontStore = createDefaultRawUploadedFontStore()) {
    this.store = store;
  }

  async save(font: UploadedFont, bytes: ArrayBuffer): Promise<void> {
    if (font.kind !== 'uploaded') {
      throw new Error('Only uploaded fonts can be persisted.');
    }

    await this.store.write(toUploadedFontPersistenceKey(font), {
      family: font.family,
      sourceName: font.sourceName,
      weight: font.weight,
      style: font.style,
      kind: 'uploaded',
      bytes,
    });
  }

  async loadByReferences(references: DocumentFontReference[]): Promise<PersistedUploadedFont[]> {
    const keys = dedupeUploadedFontKeys(references);
    const loadedFonts = await Promise.all(
      keys.map(async (key) => {
        const value = await this.store.read(key);
        const record = parsePersistedUploadedFont(value);
        if (!record || toUploadedFontPersistenceKey(record) !== key) {
          return null;
        }
        return record;
      }),
    );

    return loadedFonts.flatMap((font) => (font ? [font] : []));
  }

  async pruneUnreferenced(references: DocumentFontReference[]): Promise<void> {
    const retainedKeys = new Set(dedupeUploadedFontKeys(references));
    const existingKeys = await this.store.keys();
    await Promise.all(
      existingKeys
        .filter((key) => !retainedKeys.has(key))
        .map(async (key) => this.store.delete(key)),
    );
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }
}

export const defaultUploadedFontPersistenceService = new UploadedFontPersistenceService();
