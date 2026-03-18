import { describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument, createImageItem, createRectangleItem } from '../document/documentDefaults';
import { CanvasPersistenceService } from './canvasPersistenceService';
import type { RawCanvasStore } from './indexedDbCanvasStore';

function createMockStore(overrides: Partial<RawCanvasStore> = {}): RawCanvasStore {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CanvasPersistenceService', () => {
  it('round-trips a persisted canvas document', async () => {
    let serializedDocument: string | null = null;
    const store = createMockStore({
      read: vi.fn().mockImplementation(async () => serializedDocument),
      write: vi.fn().mockImplementation(async (value: string) => {
        serializedDocument = value;
      }),
    });
    const service = new CanvasPersistenceService(store);
    const projectDocument = createDefaultProjectDocument();
    projectDocument.items = [createRectangleItem()];

    await service.save(projectDocument);

    await expect(service.load()).resolves.toEqual(projectDocument);
  });


  it('round-trips persisted image adjustments through the autosave store', async () => {
    let serializedDocument: string | null = null;
    const store = createMockStore({
      read: vi.fn().mockImplementation(async () => serializedDocument),
      write: vi.fn().mockImplementation(async (value: string) => {
        serializedDocument = value;
      }),
    });
    const service = new CanvasPersistenceService(store);
    const image = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    image.adjustments = {
      brightness: 180,
      contrast: 25,
      tintColor: '#abcdef',
      tintStrength: 40,
    };

    await service.save({
      ...createDefaultProjectDocument(),
      items: [image],
    });

    await expect(service.load()).resolves.toMatchObject({
      items: [
        {
          kind: 'image',
          adjustments: {
            brightness: 180,
            contrast: 25,
            tintColor: '#abcdef',
            tintStrength: 40,
          },
        },
      ],
    });
  });

  it('clears invalid persisted payloads instead of throwing', async () => {
    const store = createMockStore({
      read: vi.fn().mockResolvedValue('{oops'),
      clear: vi.fn().mockResolvedValue(undefined),
    });
    const service = new CanvasPersistenceService(store);

    await expect(service.load()).resolves.toBeNull();
    expect(store.clear).toHaveBeenCalledOnce();
  });

  it('clears persisted state on request', async () => {
    const store = createMockStore({
      clear: vi.fn().mockResolvedValue(undefined),
    });
    const service = new CanvasPersistenceService(store);

    await service.clear();

    expect(store.clear).toHaveBeenCalledOnce();
  });
});
