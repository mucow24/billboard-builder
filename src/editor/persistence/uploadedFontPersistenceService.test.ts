import { describe, expect, it, vi } from 'vitest';

import type { DocumentFontReference, UploadedFont } from '../document/documentTypes';
import type { PersistedUploadedFont } from '../fonts';
import { UploadedFontPersistenceService } from './uploadedFontPersistenceService';

interface MockUploadedFontStore {
  clear: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

function createBytes(value: number): ArrayBuffer {
  return new Uint8Array([value]).buffer;
}

function createUploadedFont(
  overrides: Partial<UploadedFont> = {},
): UploadedFont {
  return {
    family: 'Session Sans',
    sourceName: 'SessionSans-Regular.ttf',
    weight: '400',
    style: 'normal',
    kind: 'uploaded',
    ...overrides,
  };
}

function createPersistedUploadedFont(
  overrides: Partial<PersistedUploadedFont> = {},
): PersistedUploadedFont {
  return {
    family: 'Session Sans',
    sourceName: 'SessionSans-Regular.ttf',
    weight: '400',
    style: 'normal',
    kind: 'uploaded',
    bytes: createBytes(1),
    ...overrides,
  };
}

function createReference(
  overrides: Partial<DocumentFontReference> = {},
): DocumentFontReference {
  return {
    family: 'Session Sans',
    sourceName: 'SessionSans-Regular.ttf',
    kind: 'uploaded',
    ...overrides,
  };
}

function createMockStore(): MockUploadedFontStore {
  return {
    clear: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
  };
}

describe('UploadedFontPersistenceService', () => {
  it('saves and reloads exact uploaded font matches', async () => {
    const record = createPersistedUploadedFont();
    const store = createMockStore();
    store.read.mockResolvedValue(record);
    const service = new UploadedFontPersistenceService(store);

    await service.save(createUploadedFont(), record.bytes);
    const loaded = await service.loadByReferences([createReference()]);

    expect(store.write).toHaveBeenCalledWith('uploaded:SessionSans-Regular.ttf', record);
    expect(loaded).toEqual([record]);
  });

  it('ignores bundled and system references when loading', async () => {
    const store = createMockStore();
    const service = new UploadedFontPersistenceService(store);

    const loaded = await service.loadByReferences([
      createReference({ kind: 'bundled', sourceName: 'Bundled.ttf', family: 'Bundled Sans' }),
      createReference({ kind: 'system', sourceName: 'Arial', family: 'Arial' }),
    ]);

    expect(loaded).toEqual([]);
    expect(store.read).not.toHaveBeenCalled();
  });

  it('deduplicates duplicate uploaded references during load', async () => {
    const record = createPersistedUploadedFont();
    const store = createMockStore();
    store.read.mockResolvedValue(record);
    const service = new UploadedFontPersistenceService(store);

    const loaded = await service.loadByReferences([
      createReference(),
      createReference(),
    ]);

    expect(loaded).toEqual([record]);
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it('prunes unreferenced uploaded font records and preserves referenced ones', async () => {
    const store = createMockStore();
    store.keys.mockResolvedValue([
      'uploaded:Keep-Regular.ttf',
      'uploaded:Drop-Regular.ttf',
    ]);
    const service = new UploadedFontPersistenceService(store);

    await service.pruneUnreferenced([
      createReference({ family: 'Keep', sourceName: 'Keep-Regular.ttf' }),
      createReference({ family: 'Keep', sourceName: 'Keep-Regular.ttf' }),
    ]);

    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenCalledWith('uploaded:Drop-Regular.ttf');
  });

  it('loads every referenced file of a family that was uploaded as several files', async () => {
    const bold = createPersistedUploadedFont({
      sourceName: 'SessionSans-Bold.ttf',
      weight: '700',
      bytes: createBytes(7),
    });
    const regular = createPersistedUploadedFont({ bytes: createBytes(4) });
    const records: Record<string, PersistedUploadedFont> = {
      'uploaded:SessionSans-Bold.ttf': bold,
      'uploaded:SessionSans-Regular.ttf': regular,
    };
    const store = createMockStore();
    store.read.mockImplementation(async (key: string) => records[key] ?? null);
    const service = new UploadedFontPersistenceService(store);

    const loaded = await service.loadByReferences([
      createReference({ sourceName: 'SessionSans-Bold.ttf' }),
      createReference(),
    ]);

    expect(loaded).toEqual([bold, regular]);
  });

  it('keeps every referenced file of a family when pruning', async () => {
    const store = createMockStore();
    store.keys.mockResolvedValue([
      'uploaded:Drop-Regular.ttf',
      'uploaded:SessionSans-Bold.ttf',
      'uploaded:SessionSans-Regular.ttf',
    ]);
    const service = new UploadedFontPersistenceService(store);

    await service.pruneUnreferenced([
      createReference({ sourceName: 'SessionSans-Bold.ttf' }),
      createReference(),
    ]);

    expect(store.delete.mock.calls).toEqual([['uploaded:Drop-Regular.ttf']]);
  });

  it('clears persisted uploaded fonts on request', async () => {
    const store = createMockStore();
    const service = new UploadedFontPersistenceService(store);

    await service.clear();

    expect(store.clear).toHaveBeenCalledOnce();
  });

  it('ignores corrupt and mismatched stored records during load', async () => {
    const store = createMockStore();
    store.read
      .mockResolvedValueOnce({ nope: true })
      .mockResolvedValueOnce(
        createPersistedUploadedFont({
          sourceName: 'Unexpected.ttf',
        }),
      );
    const service = new UploadedFontPersistenceService(store);

    const loaded = await service.loadByReferences([
      createReference(),
      createReference({
        family: 'Mismatch Sans',
        sourceName: 'Mismatch.ttf',
      }),
    ]);

    expect(loaded).toEqual([]);
  });

  it('rejects attempts to persist non-uploaded fonts', async () => {
    const store = createMockStore();
    const service = new UploadedFontPersistenceService(store);

    await expect(
      service.save(
        createUploadedFont({
          kind: 'bundled',
          family: 'Bundled Sans',
          sourceName: 'BundledSans-Regular.ttf',
        }),
        createBytes(9),
      ),
    ).rejects.toThrow('Only uploaded fonts can be persisted.');

    expect(store.write).not.toHaveBeenCalled();
  });
});
