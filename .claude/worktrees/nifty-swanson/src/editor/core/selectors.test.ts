import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createRectangleItem, createTextItem } from '../document/documentDefaults';
import type { ProjectDocument } from '../document/documentTypes';
import { createDefaultEditorState } from './editorState';
import {
  selectAvailableFonts,
  selectCanRedo,
  selectCanUndo,
  selectMissingFontFamilies,
  selectPrimarySelectedItemId,
  selectSelectedItem,
  selectSelectedItems,
} from './selectors';

function buildDocument(): ProjectDocument {
  const first = createTextItem({ x: 10, y: 20 });
  const second = createRectangleItem({ x: 40, y: 60 });
  return {
    ...createDefaultProjectDocument(),
    nodes: [first, second],
    items: [first, second],
  };
}

describe('selectors', () => {
  it('returns the primary selected item id', () => {
    const state = createDefaultEditorState(buildDocument());
    state.session.selectedNodeIds = [state.document.items[1].id, state.document.items[0].id];
    state.session.selectedItemIds = [state.document.items[1].id, state.document.items[0].id];
    expect(selectPrimarySelectedItemId(state)).toBe(state.session.selectedItemIds[0]);
  });

  it('returns the selected item', () => {
    const state = createDefaultEditorState(buildDocument());
    state.session.selectedNodeIds = [state.document.items[1].id, state.document.items[0].id];
    state.session.selectedItemIds = [state.document.items[1].id, state.document.items[0].id];
    expect(selectSelectedItem(state.document, state)?.id).toBe(state.session.selectedItemIds[0]);
  });

  it('returns all selected items in document order', () => {
    const state = createDefaultEditorState(buildDocument());
    state.session.selectedNodeIds = [state.document.items[1].id, state.document.items[0].id];
    state.session.selectedItemIds = [state.document.items[1].id, state.document.items[0].id];
    expect(selectSelectedItems(state.document, state).map((item) => item.id)).toEqual(state.document.items.map((item) => item.id));
  });

  it('returns undefined when there is no selected item', () => {
    const state = createDefaultEditorState(buildDocument());
    expect(selectPrimarySelectedItemId(state)).toBeUndefined();
    expect(selectSelectedItem(state.document, state)).toBeUndefined();
    expect(selectSelectedItems(state.document, state)).toEqual([]);
  });

  it('computes undo/redo availability from history', () => {
    const state = createDefaultEditorState();
    expect(selectCanUndo(state)).toBe(false);
    expect(selectCanRedo(state)).toBe(false);

    state.history.past.push(createDefaultProjectDocument());
    state.history.future.push(createDefaultProjectDocument());
    expect(selectCanUndo(state)).toBe(true);
    expect(selectCanRedo(state)).toBe(true);
  });

  it('selects available fonts and missing font families from session', () => {
    const state = createDefaultEditorState();
    state.session.availableFonts.push({
      family: 'Example Sans',
      sourceName: 'ExampleSans-Regular.ttf',
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
    });
    state.session.missingFontFamilies = ['Missing One', 'Missing Two'];

    expect(selectAvailableFonts(state)).toEqual(state.session.availableFonts);
    expect(selectMissingFontFamilies(state)).toEqual(['Missing One', 'Missing Two']);
  });
});
