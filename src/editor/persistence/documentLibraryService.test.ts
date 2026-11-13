import { describe, expect, it, vi } from 'vitest';

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
    preview: null,
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
  it('starts empty', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());

    await expect(service.listEntries()).resolves.toEqual([]);
    await expect(service.loadDocument({ id: 'missing', name: 'Missing' })).resolves.toBeNull();
  });

  it('stores a document with its entry and reads both back', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    const entry = createEntry({ preview: 'data:image/png;base64,AAA' });
    const document = createDocument({ name: 'Poster' });

    await service.save(entry, document);

    await expect(service.listEntries()).resolves.toEqual([entry]);
    await expect(service.loadDocument(entry)).resolves.toEqual(document);
  });

  it('lists the newest save first', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    await service.save(createEntry({ id: 'old', updatedAt: 100 }), createDocument());
    await service.save(createEntry({ id: 'new', updatedAt: 300 }), createDocument());
    await service.save(createEntry({ id: 'middle', updatedAt: 200 }), createDocument());

    const entries = await service.listEntries();

    expect(entries.map((entry) => entry.id)).toEqual(['new', 'middle', 'old']);
  });

  it('replaces the saved version when a document is saved again', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    await service.save(createEntry({ updatedAt: 100 }), createDocument({ background: '#111111' }));

    await service.save(createEntry({ updatedAt: 200 }), createDocument({ background: '#222222' }));

    const entries = await service.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].updatedAt).toBe(200);
    expect((await service.loadDocument(entries[0]))?.background).toBe('#222222');
  });

  it('renames a document through its entry, without rewriting the document', async () => {
    const store = new InMemoryDocumentLibraryStore();
    const writeDocument = vi.spyOn(store, 'write');
    const service = new DocumentLibraryService(store);
    const entry = createEntry({ name: 'Before' });
    await service.save(entry, createDocument({ name: 'Before' }));

    await service.updateEntry({ ...entry, name: 'After' });

    expect(writeDocument).toHaveBeenCalledTimes(1);
    const [renamedEntry] = await service.listEntries();
    expect(renamedEntry.name).toBe('After');
    // The stored document still says "Before": the entry's name wins.
    expect((await service.loadDocument(renamedEntry))?.name).toBe('After');
  });

  it('removes a document and its entry', async () => {
    const service = new DocumentLibraryService(new InMemoryDocumentLibraryStore());
    const kept = createEntry({ id: 'kept' });
    const removed = createEntry({ id: 'removed' });
    await service.save(kept, createDocument());
    await service.save(removed, createDocument());

    await service.remove('removed');

    await expect(service.listEntries()).resolves.toEqual([kept]);
    await expect(service.loadDocument(removed)).resolves.toBeNull();
  });

  it('leaves out entries it cannot read', async () => {
    const store = new InMemoryDocumentLibraryStore();
    const service = new DocumentLibraryService(store);
    const entry = createEntry();
    await service.save(entry, createDocument());
    await store.writeEntry('broken', { id: 'broken', name: '' });
    await store.writeEntry('garbage', 'not an entry');

    await expect(service.listEntries()).resolves.toEqual([entry]);
  });

  it('fails to load a document that is not a valid project', async () => {
    const store = new InMemoryDocumentLibraryStore();
    const service = new DocumentLibraryService(store);
    const entry = createEntry();
    await store.write(entry.id, entry, '{"version":1}');

    await expect(service.loadDocument(entry)).rejects.toThrow();
  });

  it('runs operations in the order they were asked for', async () => {
    const store = new InMemoryDocumentLibraryStore();
    vi.spyOn(store, 'write').mockImplementationOnce(async (id, entry, document) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await InMemoryDocumentLibraryStore.prototype.write.call(store, id, entry, document);
    });
    const service = new DocumentLibraryService(store);

    // Not awaited: the list is asked for while the save is still under way.
    const saved = service.save(createEntry(), createDocument());
    const listed = service.listEntries();

    await expect(listed).resolves.toHaveLength(1);
    await saved;
  });

  it('keeps working after an operation has failed', async () => {
    const store = new InMemoryDocumentLibraryStore();
    vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('disk full'));
    const service = new DocumentLibraryService(store);

    await expect(service.save(createEntry(), createDocument())).rejects.toThrow('disk full');
    await service.save(createEntry(), createDocument());

    await expect(service.listEntries()).resolves.toHaveLength(1);
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
