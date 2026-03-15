import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import {
  DUPLICATE_ITEM_OFFSET,
  createDefaultProjectDocument,
  createRectangleItem,
} from './editor/model/defaults';
import { serializeProjectDocument } from './editor/model/schema';
import { AUTOSAVE_KEY } from './editor/io/projectFile';
import { useEditorStore } from './editor/state/store';

vi.mock('./editor/io/fonts', async () => {
  const actual =
    await vi.importActual<typeof import('./editor/io/fonts')>(
      './editor/io/fonts',
    );
  return {
    ...actual,
    loadBundledFonts: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('./editor/canvas/CanvasStage', () => ({
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
    exportScale: 2,
    historyPast: [],
    historyFuture: [],
  });
}

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEditorStore();
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

  it('restores the autosaved document on boot', async () => {
    const autosavedDocument = createDefaultProjectDocument();
    autosavedDocument.items = [createRectangleItem()];
    localStorage.setItem(
      AUTOSAVE_KEY,
      serializeProjectDocument(autosavedDocument),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    });
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
        selectedItemIds: [rectangleItem.id],
      },
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
