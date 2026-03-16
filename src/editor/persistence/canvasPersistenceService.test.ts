import { describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument, createRectangleItem } from '../document/documentDefaults';
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
