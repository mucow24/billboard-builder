import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDefaultProjectDocument,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import { applyEditorCommand, useEditorStore } from './store';
import { resetEditorStore } from '../../test/editorStore';

describe('editor command reducer', () => {
  it('adds an item and selects it immediately', () => {
    const baseDocument = createDefaultProjectDocument();
    const item = createRectangleItem();

    const nextDocument = applyEditorCommand(baseDocument, {
      type: 'add_item',
      item,
    });

    expect(nextDocument.items).toHaveLength(1);
  });

  it('reorders items and renormalizes z-indices', () => {
    const firstItem = createTextItem({ zIndex: 0 });
    const secondItem = createRectangleItem({ zIndex: 1 });
    const document = {
      ...createDefaultProjectDocument(),
      items: [firstItem, secondItem],
    };

    const nextDocument = applyEditorCommand(document, {
      type: 'reorder_item',
      itemId: firstItem.id,
      mode: 'front',
    });

    expect(nextDocument.items.map((item) => item.id)).toEqual([
      secondItem.id,
      firstItem.id,
    ]);
    expect(nextDocument.items.map((item) => item.zIndex)).toEqual([0, 1]);
  });

  it('updates canvas settings, selection state, and registered fonts', () => {
    const item = createRectangleItem();
    const documentWithItem = applyEditorCommand(createDefaultProjectDocument(), {
      type: 'add_item',
      item,
    });
    const resizedDocument = applyEditorCommand(documentWithItem, {
      type: 'set_canvas_size',
      canvas: { width: 640, height: 480, presetId: 'custom' },
    });
    const recoloredDocument = applyEditorCommand(resizedDocument, {
      type: 'set_background',
      background: '#101010',
    });
    const selectedDocument = applyEditorCommand(recoloredDocument, {
      type: 'clear_selection',
    });
    const fontDocument = applyEditorCommand(selectedDocument, {
      type: 'register_font',
      font: {
        family: 'Test Sans',
        sourceName: 'TestSans.ttf',
        kind: 'uploaded',
      },
    });

    expect(fontDocument.canvas).toEqual({
      width: 640,
      height: 480,
      presetId: 'custom',
    });
    expect(fontDocument.background).toBe('#101010');
    expect(useEditorStore.getState().selectedItemIds).toEqual([]);
    expect(fontDocument.fonts).toHaveLength(1);
  });

  it('deletes selected items and can replace the whole document', () => {
    const firstItem = createTextItem();
    const secondItem = createRectangleItem();
    const seededDocument = {
      ...createDefaultProjectDocument(),
      items: [firstItem, secondItem],
    };
    const prunedDocument = applyEditorCommand(seededDocument, {
      type: 'delete_items',
      itemIds: [firstItem.id],
    });
    const loadedDocument = applyEditorCommand(prunedDocument, {
      type: 'load_document',
      document: createDefaultProjectDocument(),
    });

    expect(prunedDocument.items).toHaveLength(1);
    expect(loadedDocument.items).toHaveLength(0);
  });

  it('recomputes line geometry from endpoint updates', () => {
    const item = createLineItem({
      startX: 10,
      startY: 20,
      endX: 110,
      endY: 60,
    });
    const document = {
      ...createDefaultProjectDocument(),
      items: [item],
    };

    const nextDocument = applyEditorCommand(document, {
      type: 'update_item',
      itemId: item.id,
      changes: { endX: 160, endY: 90 },
    });
    const nextItem = nextDocument.items[0];

    expect(nextItem.width).toBe(150);
    expect(nextItem.height).toBe(70);
    expect(nextItem.x).toBe(10);
    expect(nextItem.y).toBe(20);
  });

  it('clamps runtime values back into the persisted document invariants', () => {
    const rectangleItem = createRectangleItem({
      opacity: 1,
      shadow: {
        color: '#000000',
        blur: 2,
        offsetX: 4,
        offsetY: 5,
        opacity: 0.4,
      },
    });
    const document = {
      ...createDefaultProjectDocument(),
      items: [rectangleItem],
    };

    const nextDocument = applyEditorCommand(document, {
      type: 'update_item',
      itemId: rectangleItem.id,
      changes: {
        width: 0,
        height: Number.NaN,
        opacity: 2,
        shadow: {
          ...rectangleItem.shadow,
          blur: -10,
          opacity: -0.5,
        },
      },
    });
    const nextItem = nextDocument.items[0];

    expect(nextItem.width).toBe(1);
    expect(nextItem.height).toBe(1);
    expect(nextItem.opacity).toBe(1);
    expect(nextItem.shadow.blur).toBe(0);
    expect(nextItem.shadow.opacity).toBe(0);
    expect(() =>
      parseProjectDocument(JSON.parse(serializeProjectDocument(nextDocument)))
    ).not.toThrow();
  });

  it('keeps line stroke width positive and derives line bounds from endpoints', () => {
    const lineItem = createLineItem({
      startX: 40,
      startY: 50,
      endX: 20,
      endY: 10,
      strokeWidth: 6,
    });
    const document = {
      ...createDefaultProjectDocument(),
      items: [lineItem],
    };

    const nextDocument = applyEditorCommand(document, {
      type: 'update_item',
      itemId: lineItem.id,
      changes: {
        endX: 5,
        endY: 0,
        strokeWidth: 0,
      },
    });
    const nextLine = nextDocument.items[0];

    expect(nextLine.kind).toBe('line');
    if (nextLine.kind !== 'line') {
      throw new Error('Expected normalized line item.');
    }
    expect(nextLine.strokeWidth).toBe(1);
    expect(nextLine.x).toBe(5);
    expect(nextLine.y).toBe(0);
    expect(nextLine.width).toBe(35);
    expect(nextLine.height).toBe(50);
  });

  it('normalizes loaded documents through the same invariant gate as command updates', () => {
    const liveItem = createRectangleItem({ zIndex: 0 });
    const orphanedSelection = createRectangleItem({
      id: 'loaded-1',
      zIndex: 5,
      opacity: 4,
      shadow: {
        color: '#000000',
        blur: 3,
        offsetX: 0,
        offsetY: 0,
        opacity: 2,
      },
    });
    const secondItem = createTextItem({
      id: 'loaded-2',
      zIndex: 2,
      shadow: undefined as never,
    });
    const loadedDocument = {
      ...createDefaultProjectDocument(),
      items: [orphanedSelection, secondItem],
    };

    useEditorStore.getState().dispatch({ type: 'add_item', item: liveItem });
    useEditorStore.getState().loadDocument(loadedDocument);

    const document = useEditorStore.getState().document;

    expect(document.items.map((item) => item.id)).toEqual(['loaded-2', 'loaded-1']);
    expect(document.items.map((item) => item.zIndex)).toEqual([0, 1]);
    expect(useEditorStore.getState().selectedItemIds).toEqual([]);
    expect(document.items[0].shadow).toEqual({
      color: '#000000',
      blur: 0,
      offsetX: 0,
      offsetY: 0,
      opacity: 0,
    });
    expect(document.items[1].opacity).toBe(1);
    expect(document.items[1].shadow.opacity).toBe(1);
    expect(useEditorStore.getState().canUndo()).toBe(false);
  });
});

describe('editor store history', () => {
  beforeEach(() => {
    resetEditorStore({ exportScale: 2 });
  });

  it('records undo and redo history for document mutations', () => {
    const item = createRectangleItem();

    useEditorStore.getState().dispatch({ type: 'add_item', item });
    expect(useEditorStore.getState().document.items).toHaveLength(1);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.items).toHaveLength(0);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document.items).toHaveLength(1);
  });

  it('updates only the selected item through the convenience action', () => {
    const item = createRectangleItem();
    useEditorStore.getState().dispatch({ type: 'add_item', item });

    useEditorStore.getState().updateSelectedItem({ width: 512, height: 256 });

    const updatedItem = useEditorStore.getState().document.items[0];
    expect(updatedItem.width).toBe(512);
    expect(updatedItem.height).toBe(256);
  });

  it('supports convenience actions for selection, reorder, export scale, and reset', () => {
    const firstItem = createTextItem({ zIndex: 0 });
    const secondItem = createRectangleItem({ zIndex: 1 });

    useEditorStore.getState().dispatch({ type: 'add_item', item: firstItem });
    useEditorStore.getState().dispatch({ type: 'add_item', item: secondItem });

    useEditorStore.getState().selectSingleItem(firstItem.id);
    useEditorStore.getState().reorderSelectedItem('front');
    useEditorStore.getState().setCanvasSize({ width: 800, height: 600 });
    useEditorStore.getState().setExportScale(4);
    useEditorStore.getState().setMissingFontFamilies(['Ghost Font']);

    expect(useEditorStore.getState().document.items.at(-1)?.id).toBe(firstItem.id);
    expect(useEditorStore.getState().document.canvas.width).toBe(800);
    expect(useEditorStore.getState().exportScale).toBe(4);
    expect(useEditorStore.getState().missingFontFamilies).toEqual(['Ghost Font']);
    expect(useEditorStore.getState().canUndo()).toBe(true);

    useEditorStore.getState().resetDocument();

    expect(useEditorStore.getState().document.items).toHaveLength(0);
    expect(useEditorStore.getState().canUndo()).toBe(true);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().document.items).toHaveLength(2);
  });

  it('deduplicates available fonts and supports explicit document loading', () => {
    const uploadedFont = {
      family: 'Session Sans',
      sourceName: 'SessionSans.ttf',
      weight: '400' as const,
      style: 'normal' as const,
      kind: 'uploaded' as const,
    };
    const loadedDocument = {
      ...createDefaultProjectDocument(),
      background: '#222222',
    };

    useEditorStore.getState().registerAvailableFont(uploadedFont);
    useEditorStore.getState().registerAvailableFont(uploadedFont);
    useEditorStore.getState().loadDocument(loadedDocument);

    expect(useEditorStore.getState().availableFonts).toEqual([uploadedFont]);
    expect(useEditorStore.getState().document.background).toBe('#222222');
    expect(useEditorStore.getState().canUndo()).toBe(false);
  });

  it('creates items by kind and can delete the current selection', () => {
    useEditorStore.getState().setActiveTool('line');
    useEditorStore.getState().createItemAt('line', 10, 20);
    useEditorStore.getState().deleteSelectedItems();

    expect(useEditorStore.getState().document.items).toHaveLength(0);
    expect(useEditorStore.getState().historyPast.length).toBeGreaterThan(0);
    expect(useEditorStore.getState().activeTool).toBe('select');
  });

  it('deletes a specific item by id while preserving unrelated selection and undo history', () => {
    const firstItem = createRectangleItem({ zIndex: 0 });
    const secondItem = createTextItem({ zIndex: 1 });

    useEditorStore.getState().dispatch({ type: 'add_item', item: firstItem });
    useEditorStore.getState().dispatch({ type: 'add_item', item: secondItem });
    useEditorStore.getState().selectSingleItem(secondItem.id);

    useEditorStore.getState().deleteItem(firstItem.id);

    expect(useEditorStore.getState().document.items).toHaveLength(1);
    expect(useEditorStore.getState().document.items[0].id).toBe(secondItem.id);
    expect(useEditorStore.getState().selectedItemIds).toEqual([secondItem.id]);
    expect(useEditorStore.getState().canUndo()).toBe(true);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().document.items).toHaveLength(2);
  });

  it('treats empty undo, redo, and selection convenience actions as no-ops', () => {
    useEditorStore.getState().undo();
    useEditorStore.getState().redo();
    useEditorStore.getState().updateSelectedItem({ width: 320 });
    useEditorStore.getState().deleteSelectedItems();
    useEditorStore.getState().reorderSelectedItem('front');

    expect(useEditorStore.getState().document).toEqual(createDefaultProjectDocument());
    expect(useEditorStore.getState().canRedo()).toBe(false);
  });

  it('clears the redo stack after a new mutation and deduplicates document fonts', () => {
    const firstItem = createRectangleItem();
    const secondItem = createTextItem();

    useEditorStore.getState().dispatch({ type: 'add_item', item: firstItem });
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().canRedo()).toBe(true);

    useEditorStore.getState().dispatch({ type: 'add_item', item: secondItem });
    expect(useEditorStore.getState().canRedo()).toBe(false);

    useEditorStore.getState().dispatch({
      type: 'register_font',
      font: {
        family: 'Poster Sans',
        sourceName: 'PosterSans.ttf',
        kind: 'uploaded',
      },
    });
    useEditorStore.getState().dispatch({
      type: 'register_font',
      font: {
        family: 'Poster Sans',
        sourceName: 'PosterSans.ttf',
        kind: 'uploaded',
      },
    });

    expect(useEditorStore.getState().document.fonts).toEqual([
      {
        family: 'Poster Sans',
        sourceName: 'PosterSans.ttf',
        kind: 'uploaded',
      },
    ]);
  });
});
