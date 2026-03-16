import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorController } from './useEditorController';
import { createDefaultProjectDocument, createRectangleItem } from '../editor/document/documentDefaults';
import { useEditorStore } from '../editor/state/store';

const { mockCanvasPersistenceService } = vi.hoisted(() => ({
  mockCanvasPersistenceService: {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../editor/persistence/canvasPersistenceService', () => ({
  defaultCanvasPersistenceService: mockCanvasPersistenceService,
}));

vi.mock('../editor/fonts', async () => {
  const actual =
    await vi.importActual<typeof import('../editor/fonts')>('../editor/fonts');
  return {
    ...actual,
    loadBundledFonts: vi.fn().mockResolvedValue([]),
  };
});

function resetEditorStore() {
  useEditorStore.setState({
    document: createDefaultProjectDocument(),
    activeTool: 'select',
    availableFonts: [],
    missingFontFamilies: [],
    exportScale: 1,
    selectedItemIds: [],
    historyPast: [],
    historyFuture: [],
  });
}

describe('useEditorController', () => {
  beforeEach(() => {
    mockCanvasPersistenceService.load.mockResolvedValue(null);
    mockCanvasPersistenceService.save.mockResolvedValue(undefined);
    resetEditorStore();
  });

  it('exposes selected item state and undo availability', async () => {
    const rectangleItem = createRectangleItem();
    useEditorStore.setState({
      document: {
        ...createDefaultProjectDocument(),
        items: [rectangleItem],
      },
      selectedItemIds: [rectangleItem.id],
      historyPast: [createDefaultProjectDocument()],
    });

    const { result } = renderHook(() => useEditorController());

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    expect(result.current.state.selectedItem?.id).toBe(rectangleItem.id);
    expect(result.current.state.canUndo).toBe(true);
    expect(typeof result.current.actions.handleNewProject).toBe('function');
  });
});
