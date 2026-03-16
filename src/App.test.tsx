// These tests intentionally mock the canvas surface and only cover App shell wiring.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import {
  DUPLICATE_ITEM_OFFSET,
  createDefaultProjectDocument,
  createRectangleItem,
} from './editor/document/documentDefaults';
import { useEditorStore } from './editor/state/store';

const { mockCanvasPersistenceService } = vi.hoisted(() => ({
  mockCanvasPersistenceService: {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./editor/fonts', async () => {
  const actual =
    await vi.importActual<typeof import('./editor/fonts')>(
      './editor/fonts',
    );
  return {
    ...actual,
    loadBundledFonts: vi.fn().mockResolvedValue([]),
  };
});


vi.mock('./editor/persistence/canvasPersistenceService', () => ({
  defaultCanvasPersistenceService: mockCanvasPersistenceService,
}));

vi.mock('./editor/rendering/CanvasStage', () => ({
  CanvasStage: ({
    activeTool,
    document,
  }: {
    activeTool: string;
    document: { items: Array<{ id: string }> };
  }) => (
    <div>
      <div data-testid="mock-stage">
        Tool: {activeTool} / Items: {document.items.length}
      </div>
    </div>
  ),
}));

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

describe('App shell', () => {
  beforeEach(() => {
    mockCanvasPersistenceService.load.mockResolvedValue(null);
    mockCanvasPersistenceService.save.mockResolvedValue(undefined);
    mockCanvasPersistenceService.clear.mockResolvedValue(undefined);
    resetEditorStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the top toolbar controls', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload font' })).toBeInTheDocument();
    expect(screen.getByLabelText('Canvas preset')).toBeInTheDocument();
    expect(screen.getByLabelText('Canvas width')).toBeInTheDocument();
    expect(screen.getByLabelText('Canvas height')).toBeInTheDocument();
  });

  it('switches into rectangle creation mode from the tool palette', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Rect/ }));

    expect(screen.getByRole('button', { name: /Rect/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('mock-stage')).toHaveTextContent(
      'Tool: rectangle / Items: 0',
    );
  });

  it('restores the persisted document on boot', async () => {
    const persistedDocument = createDefaultProjectDocument();
    persistedDocument.items = [createRectangleItem()];
    mockCanvasPersistenceService.load.mockResolvedValue(persistedDocument);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    });
  });

  it('persists the latest canvas snapshot after edits', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockCanvasPersistenceService.load).toHaveBeenCalled();
    });

    act(() => {
      useEditorStore.getState().dispatch({ type: 'add_item', item: createRectangleItem() });
    });

    await waitFor(() => {
      expect(mockCanvasPersistenceService.save).toHaveBeenCalled();
    });

    const latestSavedDocument = mockCanvasPersistenceService.save.mock.calls.at(-1)?.[0];
    expect(latestSavedDocument.items).toHaveLength(1);
  });

  it('supports global tool hotkeys', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('t');
    expect(screen.getByRole('button', { name: /Text/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /Select/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('copies, pastes, cuts, and duplicates the selected item with keyboard shortcuts', async () => {
    const user = userEvent.setup();
    const rectangleItem = createRectangleItem({ x: 40, y: 60 });
    useEditorStore.setState({
      document: {
        ...createDefaultProjectDocument(),
        items: [rectangleItem],
      },
      selectedItemIds: [rectangleItem.id],
    });
    render(<App />);

    await user.keyboard('{Control>}c{/Control}');
    await user.keyboard('{Control>}v{/Control}');

    let items = useEditorStore.getState().document.items;
    expect(items).toHaveLength(2);
    expect(items[1].x).toBe(rectangleItem.x + DUPLICATE_ITEM_OFFSET);
    expect(items[1].y).toBe(rectangleItem.y + DUPLICATE_ITEM_OFFSET);

    await user.keyboard('{Control>}d{/Control}');
    items = useEditorStore.getState().document.items;
    expect(items).toHaveLength(3);

    const cutItem = items[2];
    await user.keyboard('{Control>}x{/Control}');
    expect(useEditorStore.getState().document.items).toHaveLength(2);

    await user.keyboard('{Control>}v{/Control}');
    items = useEditorStore.getState().document.items;
    expect(items).toHaveLength(3);
    expect(items[2].x).toBe(cutItem.x + DUPLICATE_ITEM_OFFSET);
    expect(items[2].y).toBe(cutItem.y + DUPLICATE_ITEM_OFFSET);
  });



  it('nudges the selected item with arrow keys', async () => {
    const user = userEvent.setup();
    const rectangleItem = createRectangleItem({ x: 40, y: 60 });
    useEditorStore.setState({
      document: {
        ...createDefaultProjectDocument(),
        items: [rectangleItem],
      },
      selectedItemIds: [rectangleItem.id],
    });
    render(<App />);

    await user.keyboard('{ArrowRight}');
    expect(useEditorStore.getState().document.items[0].x).toBe(41);

    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(useEditorStore.getState().document.items[0].y).toBe(65);
  });

  it('updates canvas size controls from the top toolbar', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Canvas width'), {
      target: { value: '900' },
    });
    fireEvent.change(screen.getByLabelText('Canvas height'), {
      target: { value: '500' },
    });

    expect(useEditorStore.getState().document.canvas.width).toBe(900);
    expect(useEditorStore.getState().document.canvas.height).toBe(500);
  });

  it('shows a visible error when opening an invalid project file', async () => {
    render(<App />);

    const openInput = screen.getByTestId('project-open-input');
    const invalidFile = new File(['not valid json'], 'broken-project.json', {
      type: 'application/json',
    });

    fireEvent.change(openInput, {
      target: {
        files: [invalidFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to open project',
      );
    });
  });

  it('ignores empty image and font upload events', () => {
    render(<App />);

    fireEvent.change(screen.getByTestId('image-upload-input'), {
      target: { files: [] },
    });
    fireEvent.change(screen.getByTestId('font-upload-input'), {
      target: { files: [] },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useEditorStore.getState().document.items).toHaveLength(0);
    expect(useEditorStore.getState().availableFonts).toEqual([]);
  });
});
