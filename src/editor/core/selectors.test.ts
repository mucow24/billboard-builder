import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createRectangleItem, createTextItem } from '../document/documentDefaults';
import type { ProjectDocument } from '../document/documentTypes';
import { createDefaultEditorState } from './editorState';
import { collectLeafItems } from '../document/sceneGraph';
import {
  selectAvailableFonts,
  selectCanRedo,
  selectCanUndo,
  selectMissingFontFamilies,
  selectPrimarySelectedNodeId,
  selectSelectedItem,
  selectSelectedItems,
} from './selectors';

function buildDocument(): ProjectDocument {
  const first = createTextItem({ x: 10, y: 20 });
  const second = createRectangleItem({ x: 40, y: 60 });
  return {
    ...createDefaultProjectDocument(),
    nodes: [first, second],
  };
}

describe('selectors', () => {
  it('returns the primary selected node id', () => {
    const state = createDefaultEditorState(buildDocument());
    const items = state.document.nodes.flatMap(collectLeafItems);
    state.session.selectedNodeIds = [items[1].id, items[0].id];
    expect(selectPrimarySelectedNodeId(state)).toBe(state.session.selectedNodeIds[0]);
  });

  it('returns the selected item', () => {
    const state = createDefaultEditorState(buildDocument());
    const items = state.document.nodes.flatMap(collectLeafItems);
    state.session.selectedNodeIds = [items[1].id, items[0].id];
    expect(selectSelectedItem(state.document, state)?.id).toBe(state.session.selectedNodeIds[0]);
  });

  it('returns all selected items in document order', () => {
    const state = createDefaultEditorState(buildDocument());
    const items = state.document.nodes.flatMap(collectLeafItems);
    state.session.selectedNodeIds = [items[1].id, items[0].id];
    expect(selectSelectedItems(state.document, state).map((item) => item.id)).toEqual([items[1].id, items[0].id]);
  });

  it('returns undefined when there is no selected item', () => {
    const state = createDefaultEditorState(buildDocument());
    expect(selectPrimarySelectedNodeId(state)).toBeUndefined();
    expect(selectSelectedItem(state.document, state)).toBeUndefined();
    expect(selectSelectedItems(state.document, state)).toEqual([]);
  });

  it('computes undo/redo availability from history', () => {
    const state = createDefaultEditorState();
    expect(selectCanUndo(state.history)).toBe(false);
    expect(selectCanRedo(state.history)).toBe(false);

    state.history.past.push(createDefaultProjectDocument());
    state.history.future.push(createDefaultProjectDocument());
    expect(selectCanUndo(state.history)).toBe(true);
    expect(selectCanRedo(state.history)).toBe(true);
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

    expect(selectAvailableFonts(state.session)).toEqual(state.session.availableFonts);
    expect(selectMissingFontFamilies(state.session)).toEqual(['Missing One', 'Missing Two']);
  });
});
