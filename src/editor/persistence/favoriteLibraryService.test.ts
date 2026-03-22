import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import {
  FavoriteLibraryService,
  type RawFavoriteLibraryStore,
} from './favoriteLibraryService';

function createMockStore(
  overrides: Partial<RawFavoriteLibraryStore> = {},
): RawFavoriteLibraryStore {
  return {
    clear: vi.fn(),
    read: vi.fn(() => null),
    write: vi.fn(),
    ...overrides,
  };
}

function createMockLegacyStore(
  overrides: Partial<{ clear: () => void; read: () => string | null }> = {},
) {
  return {
    clear: vi.fn(),
    read: vi.fn(() => null),
    ...overrides,
  };
}

describe('FavoriteLibraryService', () => {
  it('round-trips stored favorites through the local library payload', () => {
    let serializedFavorites: string | null = null;
    const store = createMockStore({
      read: vi.fn(() => serializedFavorites),
      write: vi.fn((value: string) => {
        serializedFavorites = value;
      }),
    });
    const service = new FavoriteLibraryService(store);
    const child = createRectangleItem({ id: 'child-node' });
    const group = createGroupNode([child], 'Favorite Group');
    group.id = 'group-node';

    service.save([
      {
        id: 'favorite-1',
        name: 'Group favorite',
        nodes: [group],
        fonts: [
          {
            family: 'Poster Sans',
            sourceName: 'PosterSans-Regular.ttf',
            kind: 'uploaded',
          },
        ],
        createdAt: '2026-03-19T12:00:00.000Z',
        updatedAt: '2026-03-19T12:00:00.000Z',
      },
    ]);

    expect(service.load()).toEqual([
      {
        id: 'favorite-1',
        name: 'Group favorite',
        nodes: [group],
        fonts: [
          {
            family: 'Poster Sans',
            sourceName: 'PosterSans-Regular.ttf',
            kind: 'uploaded',
          },
        ],
        createdAt: '2026-03-19T12:00:00.000Z',
        updatedAt: '2026-03-19T12:00:00.000Z',
      },
    ]);
  });

  it('clears malformed stored payloads and falls back to an empty library', () => {
    const store = createMockStore({
      clear: vi.fn(),
      read: vi.fn(() => '{oops'),
    });
    const service = new FavoriteLibraryService(store);

    expect(service.load()).toEqual([]);
    expect(store.clear).toHaveBeenCalledOnce();
  });

  it('clears unsupported favorite node payloads instead of returning partial data', () => {
    const invalidFavoritePayload = JSON.stringify({
      version: 1,
      favorites: [
        {
          id: 'favorite-1',
          name: 'Broken',
          nodes: [{ id: '', kind: 'rectangle' }],
          fonts: [],
          createdAt: '2026-03-19T12:00:00.000Z',
          updatedAt: '2026-03-19T12:00:00.000Z',
        },
      ],
    });
    const store = createMockStore({
      clear: vi.fn(),
      read: vi.fn(() => invalidFavoritePayload),
    });
    const service = new FavoriteLibraryService(store);

    expect(service.load()).toEqual([]);
    expect(store.clear).toHaveBeenCalledOnce();
  });

  it('migrates legacy template storage into favorites storage', () => {
    const legacySerializedFavorites = JSON.stringify({
      version: 1,
      templates: [
        {
          id: 'legacy-favorite-1',
          name: 'Legacy favorite',
          nodes: [createRectangleItem({ id: 'legacy-rect' })],
          fonts: [],
          createdAt: '2026-03-19T12:00:00.000Z',
          updatedAt: '2026-03-19T12:00:00.000Z',
        },
      ],
    });
    let serializedFavorites: string | null = null;
    const store = createMockStore({
      read: vi.fn(() => serializedFavorites),
      write: vi.fn((value: string) => {
        serializedFavorites = value;
      }),
    });
    const legacyStore = createMockLegacyStore({
      clear: vi.fn(),
      read: vi.fn(() => legacySerializedFavorites),
    });
    const service = new FavoriteLibraryService(store, legacyStore);

    expect(service.load()).toEqual([
      expect.objectContaining({
        id: 'legacy-favorite-1',
        name: 'Legacy favorite',
      }),
    ]);
    expect(store.write).toHaveBeenCalledWith(expect.stringContaining('"favorites"'));
    expect(legacyStore.clear).toHaveBeenCalledOnce();
  });

  it('does not clear legacy template storage when migrating favorites cannot be rewritten', () => {
    const legacySerializedFavorites = JSON.stringify({
      version: 1,
      templates: [
        {
          id: 'legacy-favorite-1',
          name: 'Legacy favorite',
          nodes: [createRectangleItem({ id: 'legacy-rect' })],
          fonts: [],
          createdAt: '2026-03-19T12:00:00.000Z',
          updatedAt: '2026-03-19T12:00:00.000Z',
        },
      ],
    });
    const store = createMockStore({
      write: vi.fn(() => {
        throw new Error('quota nope');
      }),
    });
    const legacyStore = createMockLegacyStore({
      clear: vi.fn(),
      read: vi.fn(() => legacySerializedFavorites),
    });
    const service = new FavoriteLibraryService(store, legacyStore);

    expect(service.load()).toEqual([
      expect.objectContaining({
        id: 'legacy-favorite-1',
        name: 'Legacy favorite',
      }),
    ]);
    expect(legacyStore.clear).not.toHaveBeenCalled();
  });

  it('preserves text favorite font references through a round trip', () => {
    let serializedFavorites: string | null = null;
    const store = createMockStore({
      read: vi.fn(() => serializedFavorites),
      write: vi.fn((value: string) => {
        serializedFavorites = value;
      }),
    });
    const service = new FavoriteLibraryService(store);
    const text = createTextItem({
      id: 'text-node',
      fontFamily: 'Poster Sans',
    });

    service.save([
      {
        id: 'favorite-1',
        name: 'Text favorite',
        nodes: [text],
        fonts: [
          {
            family: 'Poster Sans',
            sourceName: 'PosterSans-Regular.ttf',
            kind: 'uploaded',
          },
        ],
        createdAt: '2026-03-19T12:00:00.000Z',
        updatedAt: '2026-03-19T12:00:00.000Z',
      },
    ]);

    expect(service.load()[0]?.fonts).toEqual([
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans-Regular.ttf',
        kind: 'uploaded',
      },
    ]);
  });
});
