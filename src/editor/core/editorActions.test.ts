import { describe, expect, it } from 'vitest';

import { createRectangleItem } from '../document/documentDefaults';
import type { EditorCommand } from '../document/documentTypes';
import { createTransactionAction, isHistoryCommand, isSelectionCommand, toEditorAction } from './editorActions';

describe('editor action families', () => {
  it('classifies selection commands separately from document commands', () => {
    const selectCommand: EditorCommand = { type: 'select_items', itemIds: ['item-1'] };
    const addCommand: EditorCommand = { type: 'add_item', item: createRectangleItem() };

    expect(isSelectionCommand(selectCommand)).toBe(true);
    expect(isSelectionCommand(addCommand)).toBe(false);
    expect(toEditorAction(selectCommand)).toEqual({ family: 'selection', command: selectCommand });
    expect(toEditorAction(addCommand)).toEqual({ family: 'document', command: addCommand });
  });

  it('only records history for document-affecting commands that should be undoable', () => {
    expect(isHistoryCommand({ type: 'add_item', item: createRectangleItem() })).toBe(true);
    expect(isHistoryCommand({ type: 'load_document', document: { version: 1, canvas: { width: 1, height: 1, presetId: 'custom' }, background: '#fff', items: [], fonts: [] } })).toBe(false);
    expect(isHistoryCommand({ type: 'register_font', font: { family: 'Test', sourceName: 'Test.ttf', kind: 'uploaded' } })).toBe(false);
    expect(isHistoryCommand({ type: 'clear_selection' })).toBe(false);
  });
});

  it('can create grouped transaction actions with a single history mode', () => {
    const addCommand: EditorCommand = { type: 'add_item', item: createRectangleItem() };

    expect(createTransactionAction([toEditorAction(addCommand)], 'single')).toEqual({
      family: 'transaction',
      actions: [{ family: 'document', command: addCommand }],
      historyMode: 'single',
    });
  });
