import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadDocumentLibrarySession,
  resetDocumentLibrarySession,
  upsertLibraryEntry,
  useDocumentLibrarySession,
} from './documentLibrarySession';
import { createDefaultProjectDocument, createRectangleItem } from '../editor/document/documentDefaults';
import { normalizeProjectDocument } from '../editor/document/documentNormalizer';
import type { CanvasPersistenceService } from '../editor/persistence/canvasPersistenceService';
import {
  DocumentLibraryService,
  type DocumentLibraryEntry,
} from '../editor/persistence/documentLibraryService';
import { InMemoryDocumentLibraryStore } from '../editor/persistence/documentLibraryStore';

function createEntry(overrides: Partial<DocumentLibraryEntry> = {}): DocumentLibraryEntry {
  return { id: 'doc-1', name: 'Poster', createdAt: 100, updatedAt: 100, fonts: [], ...overrides };
}

function createCanvasService(documentId: string | null | Error): CanvasPersistenceService {
  return {
    loadDocumentId: async () => {
      if (documentId instanceof Error) {
        throw documentId;
      }
      return documentId;
    },
  } as unknown as CanvasPersistenceService;
}

const savedDocument = normalizeProjectDocument({
  ...createDefaultProjectDocument(),
  name: 'Poster',
  nodes: [createRectangleItem({ id: 'rect' })],
});

async function createLibraryWithPoster() {
  const library = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
  await library.save(createEntry(), savedDocument, 'data:image/png;base64,AAA');
  return library;
}

describe('loadDocumentLibrarySession', () => {
  beforeEach(() => {
    resetDocumentLibrarySession();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ties the working copy to its library document and reads the saved version', async () => {
    const library = await createLibraryWithPoster();

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      library,
      canvas: createCanvasService('doc-1'),
    });

    const session = useDocumentLibrarySession.getState();
    expect(session.currentId).toBe('doc-1');
    expect(session.savedDocument).toEqual(savedDocument);
    expect(session.entries).toEqual([createEntry()]);
    expect(session.entriesKnown).toBe(true);
    // Previews are not read at startup: the library dialog asks for them.
    expect(session.previews).toEqual({});
  });

  // A font that only the unreadable document uses must not be pruned.
  it('does not claim to know the library when one of its entries cannot be read', async () => {
    const store = new InMemoryDocumentLibraryStore();
    const library = new DocumentLibraryService(store);
    await library.save(createEntry(), savedDocument, null);
    await store.writeEntry('broken', { id: 'broken' });

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      library,
      canvas: createCanvasService('doc-1'),
    });

    const session = useDocumentLibrarySession.getState();
    expect(session.entries).toEqual([createEntry()]);
    expect(session.entriesKnown).toBe(false);
    expect(session.savedDocument).toEqual(savedDocument);
  });

  it('leaves the session alone when the startup it belongs to was abandoned', async () => {
    const library = await createLibraryWithPoster();
    const before = useDocumentLibrarySession.getState();

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      isCancelled: () => true,
      library,
      canvas: createCanvasService('doc-1'),
    });

    expect(useDocumentLibrarySession.getState()).toBe(before);
  });

  it('keeps the id of a working copy that was never saved to the library', async () => {
    const library = await createLibraryWithPoster();

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      library,
      canvas: createCanvasService('never-saved'),
    });

    const session = useDocumentLibrarySession.getState();
    expect(session.currentId).toBe('never-saved');
    expect(session.savedDocument).toBeNull();
  });

  it('gives a working copy from before the library a new id', async () => {
    const library = await createLibraryWithPoster();

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      library,
      canvas: createCanvasService(null),
    });

    const session = useDocumentLibrarySession.getState();
    expect(session.currentId).not.toBe('doc-1');
    expect(session.currentId.length).toBeGreaterThan(0);
    expect(session.savedDocument).toBeNull();
  });

  // The editor then starts blank. Tied to the last open document, that blank
  // canvas would count as an edit of it, and saving would wipe the document.
  it('does not tie a blank start to the document that was open last', async () => {
    const library = await createLibraryWithPoster();

    await loadDocumentLibrarySession({
      hasWorkingCopy: false,
      library,
      canvas: createCanvasService('doc-1'),
    });

    const session = useDocumentLibrarySession.getState();
    expect(session.currentId).not.toBe('doc-1');
    expect(session.savedDocument).toBeNull();
    expect(session.entries).toEqual([createEntry()]);
  });

  it('starts with an unknown library when it cannot be listed', async () => {
    const library = await createLibraryWithPoster();
    vi.spyOn(library, 'listEntries').mockRejectedValue(new Error('database gone'));

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      library,
      canvas: createCanvasService('doc-1'),
    });

    const session = useDocumentLibrarySession.getState();
    expect(session.entries).toEqual([]);
    expect(session.entriesKnown).toBe(false);
    expect(session.currentId).toBe('doc-1');
    expect(session.savedDocument).toBeNull();
  });

  it('treats the working copy as never saved when its saved version cannot be read', async () => {
    const library = await createLibraryWithPoster();
    vi.spyOn(library, 'loadDocument').mockRejectedValue(new Error('corrupt'));

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      library,
      canvas: createCanvasService('doc-1'),
    });

    const session = useDocumentLibrarySession.getState();
    expect(session.currentId).toBe('doc-1');
    expect(session.savedDocument).toBeNull();
    expect(session.entriesKnown).toBe(true);
  });

  it('starts when the id of the working copy cannot be read', async () => {
    const library = await createLibraryWithPoster();

    await loadDocumentLibrarySession({
      hasWorkingCopy: true,
      library,
      canvas: createCanvasService(new Error('read failed')),
    });

    expect(useDocumentLibrarySession.getState().savedDocument).toBeNull();
    expect(useDocumentLibrarySession.getState().entries).toHaveLength(1);
  });
});

describe('upsertLibraryEntry', () => {
  it('adds a new entry and keeps the newest save first', () => {
    const older = createEntry({ id: 'older', updatedAt: 100 });
    const newer = createEntry({ id: 'newer', updatedAt: 200 });

    expect(upsertLibraryEntry([older], newer)).toEqual([newer, older]);
  });

  it('replaces the entry of the same document', () => {
    const other = createEntry({ id: 'other', updatedAt: 150 });
    const before = createEntry({ id: 'doc', updatedAt: 100, name: 'Before' });
    const after = createEntry({ id: 'doc', updatedAt: 200, name: 'After' });

    expect(upsertLibraryEntry([other, before], after)).toEqual([after, other]);
  });
});
