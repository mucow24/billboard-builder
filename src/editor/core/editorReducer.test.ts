import { describe, expect, it } from 'vitest';

import {
  createDefaultProjectDocument,
  createGroupNode,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import { collectLeafItems } from '../document/sceneGraph';
import { createDefaultEditorState } from './editorState';
import { applyEditorCommand, createResetDocumentTransaction, reduceEditorState } from './editorReducer';
import { createTransactionAction, toEditorAction } from './editorActions';

describe('editor reducer', () => {
  it('adds an item and selects it immediately', () => {
    const state = createDefaultEditorState();
    const item = createRectangleItem();

    const nextState = reduceEditorState(state, {
      ...toEditorAction({ type: 'add_node', item }),
    });

    expect(nextState.document.nodes.flatMap(collectLeafItems)).toHaveLength(1);
    expect(nextState.session.selectedNodeIds).toEqual([item.id]);
    expect(nextState.history.past).toEqual([state.document]);
  });

  it('treats selection-only commands as session-safe history no-ops', () => {
    const item = createRectangleItem();
    const seeded = reduceEditorState(createDefaultEditorState(), {
      ...toEditorAction({ type: 'add_node', item }),
    });

    const selected = reduceEditorState(seeded, {
      ...toEditorAction({ type: 'select_nodes', nodeIds: [item.id] }),
    });

    expect(selected.session.selectedNodeIds).toEqual([item.id]);
    expect(selected.history).toEqual(seeded.history);
  });

  it('opens by replacing the document and resetting redo history', () => {
    const firstItem = createRectangleItem();
    const secondDoc = {
      ...createDefaultProjectDocument(),
      nodes: [createTextItem({ id: 'loaded-item' })],
    };
    const seeded = reduceEditorState(createDefaultEditorState(), {
      ...toEditorAction({ type: 'add_node', item: firstItem }),
    });
    const undone = reduceEditorState(seeded, { family: 'history', type: 'undo' });

    const opened = reduceEditorState(undone, {
      ...toEditorAction({ type: 'load_document', document: secondDoc }),
    });

    expect(opened.document.nodes.flatMap(collectLeafItems).map((item) => item.id)).toEqual(['loaded-item']);
    expect(opened.session.selectedNodeIds).toEqual([]);
    expect(opened.history.future).toEqual([]);
    expect(opened.history.past).toEqual([]);
  });


  it('records a grouped transaction as a single undo step', () => {
    const state = createDefaultEditorState();
    const first = createRectangleItem({ id: 'first' });
    const second = createRectangleItem({ id: 'second' });

    const nextState = reduceEditorState(
      state,
      createTransactionAction([
        toEditorAction({ type: 'add_node', item: first }),
        toEditorAction({ type: 'add_node', item: second }),
      ])
    );

    expect(nextState.document.nodes.flatMap(collectLeafItems)).toHaveLength(2);
    expect(nextState.history.past).toHaveLength(1);

    const undone = reduceEditorState(nextState, { family: 'history', type: 'undo' });
    expect(undone.document.nodes.flatMap(collectLeafItems)).toHaveLength(0);
  });

  it('does not create history for session-only transactions', () => {
    const seeded = reduceEditorState(createDefaultEditorState(), {
      ...toEditorAction({ type: 'add_node', item: createRectangleItem() }),
    });

    const nextState = reduceEditorState(
      seeded,
      createTransactionAction([
        { family: 'session', type: 'set_active_tool', tool: 'text' },
        { family: 'selection', command: { type: 'clear_selection' } },
      ])
    );

    expect(nextState.history).toEqual(seeded.history);
    expect(nextState.session.activeTool).toBe('text');
  });

  it('uses reset-document transaction as one undoable clear step', () => {
    const seeded = reduceEditorState(createDefaultEditorState(), {
      ...toEditorAction({ type: 'add_node', item: createRectangleItem() }),
    });

    const cleared = reduceEditorState(seeded, createResetDocumentTransaction());
    expect(cleared.document.nodes.flatMap(collectLeafItems)).toHaveLength(0);
    expect(cleared.history.past).toHaveLength(2);

    const undone = reduceEditorState(cleared, { family: 'history', type: 'undo' });
    expect(undone.document.nodes.flatMap(collectLeafItems)).toHaveLength(1);
    expect(undone.session.activeTool).toBe('select');
  });

  it('undoes and redoes document mutations', () => {
    const item = createRectangleItem();
    const seeded = reduceEditorState(createDefaultEditorState(), {
      ...toEditorAction({ type: 'add_node', item }),
    });

    const undone = reduceEditorState(seeded, { family: 'history', type: 'undo' });
    const redone = reduceEditorState(undone, { family: 'history', type: 'redo' });

    expect(undone.document.nodes.flatMap(collectLeafItems)).toHaveLength(0);
    expect(redone.document.nodes.flatMap(collectLeafItems)).toHaveLength(1);
  });

  it('normalizes document updates through the reducer path', () => {
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
    const baseDocument = {
      ...createDefaultProjectDocument(),
      nodes: [rectangleItem],
    };

    const nextDocument = applyEditorCommand(baseDocument, {
      type: 'update_node',
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
    const nextItem = nextDocument.nodes.flatMap(collectLeafItems)[0];

    expect(nextItem.width).toBe(1);
    expect(nextItem.height).toBe(1);
    expect(nextItem.opacity).toBe(1);
    expect(nextItem.shadow.blur).toBe(0);
    expect(nextItem.shadow.opacity).toBe(0);
    expect(() =>
      parseProjectDocument(JSON.parse(serializeProjectDocument(nextDocument)))
    ).not.toThrow();
  });

  it('recomputes line geometry from endpoint updates', () => {
    const item = createLineItem({ startX: 10, startY: 20, endX: 110, endY: 60 });
    const document = {
      ...createDefaultProjectDocument(),
      nodes: [item],
    };

    const nextDocument = applyEditorCommand(document, {
      type: 'update_node',
      itemId: item.id,
      changes: { endX: 160, endY: 90 },
    });
    const nextItem = nextDocument.nodes.flatMap(collectLeafItems)[0];

    expect(nextItem.width).toBe(150);
    expect(nextItem.height).toBe(70);
    expect(nextItem.x).toBe(10);
    expect(nextItem.y).toBe(20);
  });

  describe('interaction sessions', () => {
    function seedWithRectangle(width = 100) {
      const item = createRectangleItem({ id: 'rect-1', width });
      const seeded = reduceEditorState(createDefaultEditorState(), {
        ...toEditorAction({ type: 'add_node', item }),
      });
      return { seeded, item };
    }

    it('batches multiple update_node actions into a single history entry on commit', () => {
      const { seeded, item } = seedWithRectangle(100);

      const begun = reduceEditorState(seeded, { family: 'interaction', type: 'begin' });
      const afterFirst = reduceEditorState(begun, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 110 } }),
      });
      const afterSecond = reduceEditorState(afterFirst, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 120 } }),
      });
      const afterThird = reduceEditorState(afterSecond, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 150 } }),
      });
      const committed = reduceEditorState(afterThird, {
        family: 'interaction',
        type: 'commit',
      });

      // Exactly one new history entry versus the seeded state.
      expect(committed.history.past).toHaveLength(seeded.history.past.length + 1);
      // The entry is the pre-begin document.
      expect(committed.history.past.at(-1)).toBe(seeded.document);
      // Document reflects the final value.
      const leaf = committed.document.nodes.flatMap(collectLeafItems)[0];
      expect(leaf.width).toBe(150);
      // Interaction slot cleared.
      expect(committed.interactionSnapshot).toBeNull();
    });

    it('exposes intermediate document state during an interaction (live preview)', () => {
      const { seeded, item } = seedWithRectangle(100);

      const begun = reduceEditorState(seeded, { family: 'interaction', type: 'begin' });
      const afterFirst = reduceEditorState(begun, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 130 } }),
      });

      // Intermediate document reflects the dragged value...
      const leaf = afterFirst.document.nodes.flatMap(collectLeafItems)[0];
      expect(leaf.width).toBe(130);
      // ...but history was NOT pushed yet.
      expect(afterFirst.history.past).toEqual(seeded.history.past);
      // Snapshot holds the pre-begin document.
      expect(afterFirst.interactionSnapshot).toBe(seeded.document);
    });

    it('cancel restores document to the pre-begin snapshot and leaves history untouched', () => {
      const { seeded, item } = seedWithRectangle(100);

      const begun = reduceEditorState(seeded, { family: 'interaction', type: 'begin' });
      const dragged = reduceEditorState(begun, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 200 } }),
      });
      const cancelled = reduceEditorState(dragged, { family: 'interaction', type: 'cancel' });

      expect(cancelled.document).toBe(seeded.document);
      expect(cancelled.history).toEqual(seeded.history);
      expect(cancelled.interactionSnapshot).toBeNull();
    });

    it('commit with no mutating actions does not push a history entry', () => {
      const { seeded } = seedWithRectangle(100);

      const begun = reduceEditorState(seeded, { family: 'interaction', type: 'begin' });
      const committed = reduceEditorState(begun, { family: 'interaction', type: 'commit' });

      expect(committed.history.past).toEqual(seeded.history.past);
      expect(committed.interactionSnapshot).toBeNull();
    });

    it('undo and redo are no-ops while an interaction is active', () => {
      const { seeded, item } = seedWithRectangle(100);

      const begun = reduceEditorState(seeded, { family: 'interaction', type: 'begin' });
      const dragged = reduceEditorState(begun, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 150 } }),
      });

      const undoAttempt = reduceEditorState(dragged, { family: 'history', type: 'undo' });
      expect(undoAttempt).toBe(dragged);

      const redoAttempt = reduceEditorState(dragged, { family: 'history', type: 'redo' });
      expect(redoAttempt).toBe(dragged);
    });

    it('second begin while one is active is a no-op', () => {
      const { seeded, item } = seedWithRectangle(100);

      const begun = reduceEditorState(seeded, { family: 'interaction', type: 'begin' });
      const dragged = reduceEditorState(begun, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 150 } }),
      });
      const begunAgain = reduceEditorState(dragged, { family: 'interaction', type: 'begin' });

      // Snapshot is still the pre-begin document, NOT the intermediate (width=150) state.
      expect(begunAgain.interactionSnapshot).toBe(seeded.document);
    });

    it('load_document dispatched mid-interaction clears interactionSnapshot', () => {
      const { seeded, item } = seedWithRectangle(100);

      const begun = reduceEditorState(seeded, { family: 'interaction', type: 'begin' });
      const dragged = reduceEditorState(begun, {
        ...toEditorAction({ type: 'update_node', itemId: item.id, changes: { width: 150 } }),
      });

      const loaded = reduceEditorState(dragged, {
        ...toEditorAction({
          type: 'load_document',
          document: { ...createDefaultProjectDocument(), nodes: [createTextItem({ id: 'loaded' })] },
        }),
      });

      expect(loaded.interactionSnapshot).toBeNull();
    });
  });

  it('collapses singleton groups after deleting a grouped child through the reducer command path', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createTextItem({ id: 'second' });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';
    const document = {
      ...createDefaultProjectDocument(),
      nodes: [group],
    };

    const nextDocument = applyEditorCommand(document, {
      type: 'delete_nodes',
      nodeIds: [first.id],
    });

    expect(nextDocument.nodes).toHaveLength(1);
    expect(nextDocument.nodes[0]).toMatchObject({
      id: second.id,
      kind: 'text',
    });
  });
});
