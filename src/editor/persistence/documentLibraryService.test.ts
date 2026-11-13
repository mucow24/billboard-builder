import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument, createRectangleItem } from '../document/documentDefaults';
import { normalizeProjectDocument } from '../document/documentNormalizer';
import type { ProjectDocument } from '../document/documentTypes';
import { DocumentLibraryService, type DocumentLibraryEntry } from './documentLibraryService';
import {
  createDefaultRawDocumentLibraryStore,
  InMemoryDocumentLibraryStore,
} from './documentLibraryStore';

function createEntry(overrides: Partial<DocumentLibraryEntry> = {}): DocumentLibraryEntry {
  return {
    id: 'doc-1',
    name: 'Poster',
    createdAt: 100,
    updatedAt: 100,
    fonts: [],
    ...overrides,
  };
}

function createDocument(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return normalizeProjectDocument({
    ...createDefaultProjectDocument(),
    nodes: [createRectangleItem({ id: 'rect' })],
    ...overrides,
  });
}

describe('DocumentLibraryService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts empty', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());

    await expect(service.listEntries()).resolves.toEqual({ entries: [], complete: true });
    await expect(service.loadPreviews()).resolves.toEqual({});
    await expect(service.loadDocument({ id: 'missing', name: 'Missing' })).resolves.toBeNull();
  });

  it('stores a document with its entry and preview and reads them back', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    const entry = createEntry();
    const document = createDocument({ name: 'Poster' });

    await service.save(entry, document, 'data:image/png;base64,AAA');

    await expect(service.listEntries()).resolves.toEqual({ entries: [entry], complete: true });
    await expect(service.loadDocument(entry)).resolves.toEqual(document);
    await expect(service.loadPreviews()).resolves.toEqual({ 'doc-1': 'data:image/png;base64,AAA' });
  });

  it('lists the newest save first', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    await service.save(createEntry({ id: 'old', updatedAt: 100 }), createDocument(), null);
    await service.save(createEntry({ id: 'new', updatedAt: 300 }), createDocument(), null);
    await service.save(createEntry({ id: 'middle', updatedAt: 200 }), createDocument(), null);

    const { entries } = await service.listEntries();

    expect(entries.map((entry) => entry.id)).toEqual(['new', 'middle', 'old']);
  });

  it('replaces the saved version when a document is saved again', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    await service.save(createEntry({ updatedAt: 100 }), createDocument({ background: '#111111' }), null);

    await service.save(createEntry({ updatedAt: 200 }), createDocument({ background: '#222222' }), null);

    const { entries } = await service.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].updatedAt).toBe(200);
    expect((await service.loadDocument(entries[0]))?.background).toBe('#222222');
  });

  it('keeps the stored preview when a document is saved again without one', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    await service.save(createEntry(), createDocument(), 'data:image/png;base64,FIRST');

    await service.save(createEntry({ updatedAt: 200 }), createDocument(), null);
    await expect(service.loadPreviews()).resolves.toEqual({ 'doc-1': 'data:image/png;base64,FIRST' });

    await service.save(createEntry({ updatedAt: 300 }), createDocument(), 'data:image/png;base64,SECOND');
    await expect(service.loadPreviews()).resolves.toEqual({ 'doc-1': 'data:image/png;base64,SECOND' });
  });

  it('renames a document through its entry, without rewriting the document or its preview', async () => {
    const store = new InMemoryDocumentLibraryStore();
    const writeDocument = vi.spyOn(store, 'write');
    const service = new DocumentLibraryService(store);
    const entry = createEntry({ name: 'Before' });
    await service.save(entry, createDocument({ name: 'Before' }), 'data:image/png;base64,AAA');

    await service.updateEntry({ ...entry, name: 'After' });

    expect(writeDocument).toHaveBeenCalledTimes(1);
    const {
      entries: [renamedEntry],
    } = await service.listEntries();
    expect(renamedEntry.name).toBe('After');
    // The stored document still says "Before": the entry's name wins.
    expect((await service.loadDocument(renamedEntry))?.name).toBe('After');
    await expect(service.loadPreviews()).resolves.toEqual({ 'doc-1': 'data:image/png;base64,AAA' });
  });

  it('removes a document with its entry and preview', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    const kept = createEntry({ id: 'kept' });
    const removed = createEntry({ id: 'removed' });
    await service.save(kept, createDocument(), 'data:image/png;base64,KEPT');
    await service.save(removed, createDocument(), 'data:image/png;base64,REMOVED');

    await service.remove('removed');

    await expect(service.listEntries()).resolves.toEqual({ entries: [kept], complete: true });
    await expect(service.loadDocument(removed)).resolves.toBeNull();
    await expect(service.loadPreviews()).resolves.toEqual({ kept: 'data:image/png;base64,KEPT' });
  });

  // A document whose entry is left out is still stored, and may be the only
  // thing using an uploaded font: the caller must know the list is not all there is.
  it('logs and leaves out entries it cannot read, and says the listing is incomplete', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new InMemoryDocumentLibraryStore();
    const service = new DocumentLibraryService(store);
    const entry = createEntry();
    await service.save(entry, createDocument(), null);
    await store.writeEntry('broken', { id: 'broken', name: '' });
    await store.writeEntry('garbage', 'not an entry');

    await expect(service.listEntries()).resolves.toEqual({ entries: [entry], complete: false });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Leaving out a library entry that could not be read.',
      { id: 'broken', name: '' },
      expect.anything(),
    );
  });

  it('leaves out previews it cannot read', async () => {
    const store = new InMemoryDocumentLibraryStore();
    vi.spyOn(store, 'readPreviews').mockResolvedValue([
      { id: 'good', preview: 'data:image/png;base64,AAA' },
      { id: 'empty', preview: '' },
      'not a preview',
    ]);
    const service = new DocumentLibraryService(store);

    await expect(service.loadPreviews()).resolves.toEqual({ good: 'data:image/png;base64,AAA' });
  });

  it('fails to load a document that is not a valid project', async () => {
    const store = new InMemoryDocumentLibraryStore();
    const service = new DocumentLibraryService(store);
    const entry = createEntry();
    await store.write(entry.id, entry, '{"version":1}', null);

    await expect(service.loadDocument(entry)).rejects.toThrow();
  });

  it('runs operations in the order they were asked for', async () => {
    const store = new InMemoryDocumentLibraryStore();
    vi.spyOn(store, 'write').mockImplementationOnce(async (id, entry, document, preview) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await InMemoryDocumentLibraryStore.prototype.write.call(store, id, entry, document, preview);
    });
    const service = new DocumentLibraryService(store);

    // Not awaited: the list is asked for while the save is still under way.
    const saved = service.save(createEntry(), createDocument(), null);
    const listed = service.listEntries();

    expect((await listed).entries).toHaveLength(1);
    await saved;
  });

  it('keeps working after an operation has failed', async () => {
    const store = new InMemoryDocumentLibraryStore();
    vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('disk full'));
    const service = new DocumentLibraryService(store);

    await expect(service.save(createEntry(), createDocument(), null)).rejects.toThrow('disk full');
    await service.save(createEntry(), createDocument(), null);

    expect((await service.listEntries()).entries).toHaveLength(1);
  });

  it('keeps the library in memory where IndexedDB is unavailable', () => {
    vi.stubGlobal('indexedDB', undefined);
    try {
      expect(createDefaultRawDocumentLibraryStore()).toBeInstanceOf(InMemoryDocumentLibraryStore);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
