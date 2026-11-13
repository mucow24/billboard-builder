import { z } from 'zod';

import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import type { DocumentFontReference, ProjectDocument } from '../document/documentTypes';
import {
  createDefaultRawDocumentLibraryStore,
  type RawDocumentLibraryStore,
} from './documentLibraryStore';

/** What the library lists a document by, without reading the document or its preview. */
export interface DocumentLibraryEntry {
  id: string;
  /** The document's name. The name inside the stored document is ignored in favour of this one. */
  name: string;
  /** When the document was first saved to the library, in ms since the epoch. */
  createdAt: number;
  /** When the document was last saved to the library, in ms since the epoch. */
  updatedAt: number;
  /** The fonts the saved version uses, so stored uploaded fonts it needs are kept. */
  fonts: DocumentFontReference[];
}

/** The entries of the library, and whether that is all of them. */
export interface DocumentLibraryListing {
  /** The entries that could be read, newest save first. */
  entries: DocumentLibraryEntry[];
  /**
   * False when a stored entry could not be read and was left out. The library
   * then holds a document, and maybe fonts it needs, that `entries` does not show.
   */
  complete: boolean;
}

/** The preview image of each library document that has one, as a data URL, by document id. */
export type DocumentLibraryPreviews = Record<string, string>;

const entrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  fonts: z.array(
    z.object({
      family: z.string(),
      sourceName: z.string(),
      kind: z.enum(['system', 'bundled', 'uploaded']),
    }),
  ),
});

const previewSchema = z.object({
  id: z.string().min(1),
  preview: z.string().min(1),
});

/** Newest save first. */
export function sortLibraryEntries(entries: DocumentLibraryEntry[]): DocumentLibraryEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The document library: saved versions of documents, each with an entry to list
 * it by and a preview image. Operations run one at a time in the order they
 * were asked for, so a read always sees the writes requested before it.
 */
export class DocumentLibraryService {
  private readonly store: RawDocumentLibraryStore;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(store: RawDocumentLibraryStore = createDefaultRawDocumentLibraryStore()) {
    this.store = store;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }

  /**
   * The entries of the documents in the library. An entry that cannot be read
   * is logged and left out, and the listing then says it is not complete.
   */
  listEntries(): Promise<DocumentLibraryListing> {
    return this.enqueue(async () => {
      const rawEntries = await this.store.readEntries();
      const entries: DocumentLibraryEntry[] = [];
      let complete = true;
      for (const rawEntry of rawEntries) {
        const parsed = entrySchema.safeParse(rawEntry);
        if (parsed.success) {
          entries.push(parsed.data);
        } else {
          complete = false;
          console.warn('Leaving out a library entry that could not be read.', rawEntry, parsed.error);
        }
      }
      return { entries: sortLibraryEntries(entries), complete };
    });
  }

  /** The stored preview images. One that cannot be read is left out: its document just shows none. */
  loadPreviews(): Promise<DocumentLibraryPreviews> {
    return this.enqueue(async () => {
      const previews: DocumentLibraryPreviews = {};
      for (const rawPreview of await this.store.readPreviews()) {
        const parsed = previewSchema.safeParse(rawPreview);
        if (parsed.success) {
          previews[parsed.data.id] = parsed.data.preview;
        }
      }
      return previews;
    });
  }

  /**
   * The saved version of a document, under the name its entry gives it. Null
   * when the library has no such document; throws when it cannot be read.
   */
  loadDocument(entry: Pick<DocumentLibraryEntry, 'id' | 'name'>): Promise<ProjectDocument | null> {
    return this.enqueue(async () => {
      const serializedDocument = await this.store.readDocument(entry.id);
      if (serializedDocument === null) {
        return null;
      }
      return { ...parseProjectDocument(JSON.parse(serializedDocument)), name: entry.name };
    });
  }

  /**
   * Stores `document` as the saved version listed by `entry`, replacing any
   * earlier one. A `preview` replaces the stored image; null keeps the stored one.
   */
  save(entry: DocumentLibraryEntry, document: ProjectDocument, preview: string | null): Promise<void> {
    return this.enqueue(() =>
      this.store.write(
        entry.id,
        entry,
        serializeProjectDocument({ ...document, name: entry.name }),
        preview,
      ),
    );
  }

  /** Replaces the entry of a stored document, to rename it. */
  updateEntry(entry: DocumentLibraryEntry): Promise<void> {
    return this.enqueue(() => this.store.writeEntry(entry.id, entry));
  }

  /** Removes a document from the library, with its entry and preview. */
  remove(id: string): Promise<void> {
    return this.enqueue(() => this.store.remove(id));
  }
}

export const defaultDocumentLibraryService = new DocumentLibraryService();
