import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import {
  DUPLICATE_ITEM_OFFSET,
  createDefaultProjectDocument,
  createRectangleItem,
  createTextItem,
} from './editor/model/defaults';
import { serializeProjectDocument } from './editor/model/schema';
import { AUTOSAVE_KEY } from './editor/io/projectFile';
import { useEditorStore } from './editor/state/store';

vi.mock('./editor/io/fonts', async () => {
  const actual = await vi.importActual<typeof import('./editor/io/fonts')>('./editor/io/fonts');
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

  it('switches into rectangle creation mode from the tool palette', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Rect/ }));

    expect(screen.getByRole('button', { name: /Rect/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('mock-stage')).toHaveTextContent('Tool: rectangle / Items: 0');
  });

  it('starts with a transparent background and exposes alpha controls', () => {
    render(<App />);

    expect(screen.getByLabelText('Canvas background alpha')).toHaveValue('0');
  });

  it('restores the autosaved document on boot', async () => {
    const autosavedDocument = createDefaultProjectDocument();
    autosavedDocument.items = [createRectangleItem()];
    localStorage.setItem(AUTOSAVE_KEY, serializeProjectDocument(autosavedDocument));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    });
    expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    expect(document.querySelectorAll('.layer-row')).toHaveLength(1);
  });

  it('supports global tool and history hotkeys', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('t');
    expect(screen.getByRole('button', { name: /Text/ })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /Arrow/ })).toHaveAttribute('aria-pressed', 'true');
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
    expect(useEditorStore.getState().document.selectedItemIds).toEqual([items[1].id]);
    expect(items[1].x).toBe(rectangleItem.x + DUPLICATE_ITEM_OFFSET);
    expect(items[1].y).toBe(rectangleItem.y + DUPLICATE_ITEM_OFFSET);

    await user.keyboard('{Control>}d{/Control}');

    items = useEditorStore.getState().document.items;
    expect(items).toHaveLength(3);
    expect(useEditorStore.getState().document.selectedItemIds).toEqual([items[2].id]);
    expect(items[2].x).toBe(items[1].x + DUPLICATE_ITEM_OFFSET);
    expect(items[2].y).toBe(items[1].y + DUPLICATE_ITEM_OFFSET);

    await user.keyboard('{Control>}x{/Control}');
    expect(useEditorStore.getState().document.items).toHaveLength(2);

    await user.keyboard('{Control>}v{/Control}');
    items = useEditorStore.getState().document.items;
    expect(items).toHaveLength(3);
    expect(useEditorStore.getState().document.selectedItemIds).toEqual([items[2].id]);
    expect(items[2].x).toBe(items[1].x + DUPLICATE_ITEM_OFFSET);
    expect(items[2].y).toBe(items[1].y + DUPLICATE_ITEM_OFFSET);
  });

  it('reorders the selected item with keyboard shortcuts', async () => {
    const user = userEvent.setup();
    const firstItem = createRectangleItem({ name: 'Bottom', zIndex: 0 });
    const secondItem = createRectangleItem({ name: 'Middle', zIndex: 1 });
    const thirdItem = createRectangleItem({ name: 'Top', zIndex: 2 });
    useEditorStore.setState({
      document: {
        ...createDefaultProjectDocument(),
        items: [firstItem, secondItem, thirdItem],
        selectedItemIds: [secondItem.id],
      },
    });
    render(<App />);

    await user.keyboard('{Control>}{ArrowUp}{/Control}');
    expect(useEditorStore.getState().document.items.map((item) => item.id)).toEqual([
      firstItem.id,
      thirdItem.id,
      secondItem.id,
    ]);

    await user.keyboard('{Control>}{ArrowDown}{/Control}');
    expect(useEditorStore.getState().document.items.map((item) => item.id)).toEqual([
      firstItem.id,
      secondItem.id,
      thirdItem.id,
    ]);

    await user.keyboard('{Control>}{Shift>}{ArrowUp}{/Shift}{/Control}');
    expect(useEditorStore.getState().document.items.map((item) => item.id)).toEqual([
      firstItem.id,
      thirdItem.id,
      secondItem.id,
    ]);

    await user.keyboard('{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}');
    expect(useEditorStore.getState().document.items.map((item) => item.id)).toEqual([
      secondItem.id,
      firstItem.id,
      thirdItem.id,
    ]);
  });

  it('does not delete the selected item while a text field is focused', async () => {
    const user = userEvent.setup();
    const textItem = createTextItem();
    useEditorStore.setState({
      document: {
        ...createDefaultProjectDocument(),
        items: [textItem],
        selectedItemIds: [textItem.id],
      },
    });
    render(<App />);

    const textarea = screen.getByLabelText('Text content');
    await user.click(textarea);
    await user.keyboard('{Backspace}');

    expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    expect(document.querySelectorAll('.layer-row')).toHaveLength(1);
    expect(screen.getByLabelText('Text content')).toBeInTheDocument();
  });

  it('ignores clipboard and reorder shortcuts while a text field is focused', async () => {
    const user = userEvent.setup();
    const textItem = createTextItem();
    const secondItem = createRectangleItem({ name: 'Rectangle', zIndex: 1 });
    useEditorStore.setState({
      document: {
        ...createDefaultProjectDocument(),
        items: [textItem, secondItem],
        selectedItemIds: [textItem.id],
      },
    });
    render(<App />);

    const textarea = screen.getByLabelText('Text content');
    await user.click(textarea);
    await user.keyboard('{Control>}c{/Control}');
    await user.keyboard('{Control>}v{/Control}');
    await user.keyboard('{Control>}x{/Control}');
    await user.keyboard('{Control>}{ArrowUp}{/Control}');

    expect(useEditorStore.getState().document.items.map((item) => item.id)).toEqual([
      textItem.id,
      secondItem.id,
    ]);
    expect(useEditorStore.getState().document.selectedItemIds).toEqual([textItem.id]);
  });

  it('treats clipboard shortcuts without selection or clipboard contents as no-ops', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('{Control>}c{/Control}');
    await user.keyboard('{Control>}v{/Control}');
    await user.keyboard('{Control>}x{/Control}');
    await user.keyboard('{Control>}d{/Control}');

    expect(useEditorStore.getState().document.items).toHaveLength(0);
    expect(useEditorStore.getState().document.selectedItemIds).toEqual([]);
  });

  it('cancels create mode with escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('r');
    expect(screen.getByRole('button', { name: /Rect/ })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /Arrow/ })).toHaveAttribute('aria-pressed', 'true');
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
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to open project');
    });
  });
});
