import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import {
  TemplateLibraryService,
  type RawTemplateLibraryStore,
} from './templateLibraryService';

function createMockStore(
  overrides: Partial<RawTemplateLibraryStore> = {},
): RawTemplateLibraryStore {
  return {
    clear: vi.fn(),
    read: vi.fn(() => null),
    write: vi.fn(),
    ...overrides,
  };
}

describe('TemplateLibraryService', () => {
  it('round-trips stored templates through the local library payload', () => {
    let serializedTemplates: string | null = null;
    const store = createMockStore({
      read: vi.fn(() => serializedTemplates),
      write: vi.fn((value: string) => {
        serializedTemplates = value;
      }),
    });
    const service = new TemplateLibraryService(store);
    const child = createRectangleItem({ id: 'child-node' });
    const group = createGroupNode([child], 'Template Group');
    group.id = 'group-node';

    service.save([
      {
        id: 'template-1',
        name: 'Group template',
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
        id: 'template-1',
        name: 'Group template',
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
    const service = new TemplateLibraryService(store);

    expect(service.load()).toEqual([]);
    expect(store.clear).toHaveBeenCalledOnce();
  });

  it('clears unsupported template node payloads instead of returning partial data', () => {
    const invalidTemplatePayload = JSON.stringify({
      version: 1,
      templates: [
        {
          id: 'template-1',
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
      read: vi.fn(() => invalidTemplatePayload),
    });
    const service = new TemplateLibraryService(store);

    expect(service.load()).toEqual([]);
    expect(store.clear).toHaveBeenCalledOnce();
  });

  it('preserves text template font references through a round trip', () => {
    let serializedTemplates: string | null = null;
    const store = createMockStore({
      read: vi.fn(() => serializedTemplates),
      write: vi.fn((value: string) => {
        serializedTemplates = value;
      }),
    });
    const service = new TemplateLibraryService(store);
    const text = createTextItem({
      id: 'text-node',
      fontFamily: 'Poster Sans',
    });

    service.save([
      {
        id: 'template-1',
        name: 'Text template',
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
