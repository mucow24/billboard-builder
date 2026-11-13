import { z } from 'zod';

import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import type { DocumentFontReference, ProjectDocument } from '../document/documentTypes';
import {
  createDefaultRawDocumentLibraryStore,
  type RawDocumentLibraryStore,
} from './documentLibraryStore';

/** What the library shows of a document without reading the document itself. */
export interface DocumentLibraryEntry {
  id: string;
  /** The document's name. The name inside the stored document is ignored in favour of this one. */
  name: string;
  /** When the document was first saved to the library, in ms since the epoch. */
  createdAt: number;
  /** When the document was last saved to the library, in ms since the epoch. */
  updatedAt: number;
  /** A small image of the saved version as a data URL, or null when none could be made. */
  preview: string | null;
  /** The fonts the saved version uses, so stored uploaded fonts it needs are kept. */
  fonts: DocumentFontReference[];
}

const entrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  preview: z.string().nullable(),
  fonts: z.array(
    z.object({
      family: z.string(),
      sourceName: z.string(),
      kind: z.enum(['system', 'bundled', 'uploaded']),
    }),
  ),
});

/** Newest save first. */
export function sortLibraryEntries(entries: DocumentLibraryEntry[]): DocumentLibraryEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The document library: saved versions of documents, each with an entry to list
 * it by. Operations run one at a time in the order they were asked for, so a
 * read always sees the writes requested before it.
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

  /** The entries of every document in the library, newest save first. Unreadable entries are left out. */
  listEntries(): Promise<DocumentLibraryEntry[]> {
    return this.enqueue(async () => {
      const rawEntries = await this.store.readEntries();
      return sortLibraryEntries(
        rawEntries.flatMap((rawEntry) => {
          const parsed = entrySchema.safeParse(rawEntry);
          return parsed.success ? [parsed.data] : [];
        }),
      );
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

  /** Stores `document` as the saved version listed by `entry`, replacing any earlier one. */
  save(entry: DocumentLibraryEntry, document: ProjectDocument): Promise<void> {
    return this.enqueue(() =>
      this.store.write(entry.id, entry, serializeProjectDocument({ ...document, name: entry.name })),
    );
  }

  /** Replaces the entry of a stored document, to rename it. */
  updateEntry(entry: DocumentLibraryEntry): Promise<void> {
    return this.enqueue(() => this.store.writeEntry(entry.id, entry));
  }

  remove(id: string): Promise<void> {
    return this.enqueue(() => this.store.remove(id));
  }
}

export const defaultDocumentLibraryService = new DocumentLibraryService();
