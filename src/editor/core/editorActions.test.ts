import { describe, expect, it } from 'vitest';

import { createRectangleItem } from '../document/documentDefaults';
import type { EditorCommand } from '../document/documentTypes';
import { createTransactionAction, isSelectionCommand, toEditorAction } from './editorActions';

describe('editor action families', () => {
  it('classifies selection commands separately from document commands', () => {
    const selectCommand: EditorCommand = { type: 'select_nodes', nodeIds: ['item-1'] };
    const addCommand: EditorCommand = { type: 'add_node', item: createRectangleItem() };

    expect(isSelectionCommand(selectCommand)).toBe(true);
    expect(isSelectionCommand(addCommand)).toBe(false);
    expect(toEditorAction(selectCommand)).toEqual({ family: 'selection', command: selectCommand });
    expect(toEditorAction(addCommand)).toEqual({ family: 'document', command: addCommand });
  });

  it('can create grouped transaction actions with a single history mode', () => {
    const addCommand: EditorCommand = { type: 'add_node', item: createRectangleItem() };

    expect(createTransactionAction([toEditorAction(addCommand)], 'single')).toEqual({
      family: 'transaction',
      actions: [{ family: 'document', command: addCommand }],
      historyMode: 'single',
    });
  });
});
