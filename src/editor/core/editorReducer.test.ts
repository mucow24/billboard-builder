import { describe, expect, it } from 'vitest';

import {
  createDefaultProjectDocument,
  createGroupNode,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import type { CanvasNode, DocumentFontReference, UploadedFont } from '../document/documentTypes';
import { cloneCanvasNode, collectLeafItems } from '../document/sceneGraph';
import { createDefaultEditorState, type EditorState } from './editorState';
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

  it('updates the canvas name and pushes a single undo entry', () => {
    const state = createDefaultEditorState();
    expect(state.document.name).toBe('Untitled canvas');

    const renamed = reduceEditorState(state, {
      ...toEditorAction({ type: 'set_canvas_name', name: 'My Banner' }),
    });
    expect(renamed.document.name).toBe('My Banner');
    expect(renamed.history.past).toEqual([state.document]);

    const undone = reduceEditorState(renamed, { family: 'history', type: 'undo' });
    expect(undone.document.name).toBe('Untitled canvas');
  });
});

describe('font references of the families text is set in', () => {
  function fontFile(
    sourceName: string,
    overrides: Partial<UploadedFont> = {},
  ): UploadedFont {
    return {
      family: 'Poster Sans',
      sourceName,
      weight: '400',
      style: 'normal',
      kind: 'uploaded',
      ...overrides,
    };
  }

  function reference({ family, sourceName, kind }: UploadedFont): DocumentFontReference {
    return { family, sourceName, kind };
  }

  const regular = fontFile('PosterSans-Regular.ttf');
  const bold = fontFile('PosterSans-Bold.ttf', { weight: '700' });
  const italic = fontFile('PosterSans-Italic.ttf', { style: 'italic' });

  function makeAvailable(state: EditorState, ...fonts: UploadedFont[]): EditorState {
    return fonts.reduce(
      (current, font) =>
        reduceEditorState(current, { family: 'session', type: 'register_available_font', font }),
      state,
    );
  }

  function registerFont(state: EditorState, font: UploadedFont): EditorState {
    return reduceEditorState(
      state,
      toEditorAction({ type: 'register_font', font: reference(font) }),
    );
  }

  /** A document whose only text item is set in `fontFamily`. */
  function stateWithText(fontFamily = 'Poster Sans'): EditorState {
    return reduceEditorState(
      createDefaultEditorState(),
      toEditorAction({ type: 'add_node', item: createTextItem({ id: 'headline', fontFamily }) }),
    );
  }

  it('references every uploaded file of a family that text is set in', () => {
    const state = makeAvailable(stateWithText(), regular, bold, italic);

    expect(state.document.fonts).toEqual([
      reference(regular),
      reference(bold),
      reference(italic),
    ]);
  });

  it('keeps an explicitly registered file first, whichever of the family was uploaded first', () => {
    const state = makeAvailable(createDefaultEditorState(), bold, regular);

    // As when a favorite is inserted together with the references it was saved with.
    const inserted = reduceEditorState(
      state,
      createTransactionAction([
        toEditorAction({
          type: 'insert_nodes',
          nodes: [createTextItem({ id: 'favorite-headline', fontFamily: 'Poster Sans' })],
        }),
        toEditorAction({ type: 'register_font', font: reference(regular) }),
      ]),
    );

    expect(inserted.document.fonts).toEqual([reference(regular), reference(bold)]);
  });

  it('references a file uploaded after its family was registered, without an undo step', () => {
    const chosen = registerFont(makeAvailable(stateWithText(), regular), regular);
    expect(chosen.document.fonts).toEqual([reference(regular)]);

    const uploadedLater = makeAvailable(chosen, bold);

    expect(uploadedLater.document.fonts).toEqual([reference(regular), reference(bold)]);
    expect(uploadedLater.history).toBe(chosen.history);
  });

  it('leaves the document untouched when the uploaded family is not referenced', () => {
    const state = stateWithText('Arial');

    const uploaded = makeAvailable(state, regular, bold);

    expect(uploaded.document).toBe(state.document);
    expect(uploaded.document.fonts).toEqual([]);
  });

  it('does not re-add files that are already referenced', () => {
    const complete = registerFont(makeAvailable(stateWithText(), regular, bold), regular);

    const selected = reduceEditorState(
      complete,
      toEditorAction({ type: 'select_nodes', nodeIds: ['headline'] }),
    );
    const reuploaded = makeAvailable(selected, bold);

    expect(reuploaded.document).toBe(complete.document);
  });

  it('still references a later upload after undoing back past it', () => {
    const chosen = registerFont(makeAvailable(stateWithText(), regular), regular);
    const moved = reduceEditorState(
      chosen,
      toEditorAction({ type: 'update_node', itemId: 'headline', changes: { x: 400 } }),
    );
    const uploadedLater = makeAvailable(moved, bold);

    // The restored snapshot predates the upload, but its text still uses the family.
    const undone = reduceEditorState(uploadedLater, { family: 'history', type: 'undo' });

    const headlineX = (state: EditorState) => state.document.nodes.flatMap(collectLeafItems)[0].x;
    expect(headlineX(undone)).toBe(headlineX(chosen));
    expect(headlineX(undone)).not.toBe(400);
    expect(undone.document.fonts).toEqual([reference(regular), reference(bold)]);

    const redone = reduceEditorState(undone, { family: 'history', type: 'redo' });
    expect(redone.document.fonts).toEqual([reference(regular), reference(bold)]);
  });

  it('completes the family of a loaded document from the files uploaded this session', () => {
    const state = makeAvailable(createDefaultEditorState(), regular, bold);

    const loaded = reduceEditorState(
      state,
      toEditorAction({
        type: 'load_document',
        document: {
          ...createDefaultProjectDocument(),
          nodes: [createTextItem({ id: 'loaded-headline', fontFamily: 'Poster Sans' })],
          fonts: [reference(bold)],
        },
      }),
    );

    expect(loaded.document.fonts).toEqual([reference(bold), reference(regular)]);
  });

  it('completes the family inside a transaction that inserts text with one reference', () => {
    const state = makeAvailable(createDefaultEditorState(), regular, bold);

    const inserted = reduceEditorState(
      state,
      createTransactionAction([
        toEditorAction({
          type: 'insert_nodes',
          nodes: [createTextItem({ id: 'favorite-headline', fontFamily: 'Poster Sans' })],
        }),
        toEditorAction({ type: 'register_font', font: reference(regular) }),
      ]),
    );

    expect(inserted.document.fonts).toEqual([reference(regular), reference(bold)]);
    expect(inserted.history.past).toHaveLength(1);
  });

  it('adds uploaded files to a family that is referenced through a bundled file', () => {
    const bundledRegular = fontFile('PosterSans-Regular.otf', { kind: 'bundled' });
    const bundledBold = fontFile('PosterSans-Bold.otf', { kind: 'bundled', weight: '700' });
    const uploadedBoldItalic = fontFile('PosterSans-BoldItalic.ttf', {
      weight: '700',
      style: 'italic',
    });
    const state = makeAvailable(stateWithText(), bundledRegular, bundledBold, uploadedBoldItalic);

    const registered = registerFont(state, bundledRegular);

    // Bundled files load at every start, so one reference is enough for them.
    expect(registered.document.fonts).toEqual([
      reference(bundledRegular),
      reference(uploadedBoldItalic),
    ]);
  });

  it('ignores uploaded files of other families', () => {
    const otherFamily = fontFile('SessionSans-Bold.ttf', { family: 'Session Sans', weight: '700' });
    const state = makeAvailable(stateWithText(), regular, otherFamily);

    const registered = registerFont(state, regular);

    expect(registered.document.fonts).toEqual([reference(regular)]);
  });

  it('drops every reference of a family once no text uses it', () => {
    const complete = registerFont(makeAvailable(stateWithText(), regular, bold), regular);

    const switched = reduceEditorState(
      complete,
      toEditorAction({ type: 'update_node', itemId: 'headline', changes: { fontFamily: 'Arial' } }),
    );

    expect(switched.document.fonts).toEqual([]);
  });

  describe('when text enters the document', () => {
    const bundledBold = fontFile('PosterSans-Bold.otf', { kind: 'bundled', weight: '700' });
    const bundledRegular = fontFile('PosterSans-Regular.otf', { kind: 'bundled' });
    const otherFamily = fontFile('SessionSans-Regular.ttf', { family: 'Session Sans' });

    /** What a paste dispatches: the pasted nodes, then their selection. */
    function paste(state: EditorState, ...nodes: CanvasNode[]): EditorState {
      return reduceEditorState(
        state,
        createTransactionAction([
          toEditorAction({ type: 'insert_nodes', nodes }),
          toEditorAction({ type: 'select_nodes', nodeIds: nodes.map((node) => node.id) }),
        ]),
      );
    }

    it('references the first file of a bundled family that pasted text is set in', () => {
      const state = makeAvailable(createDefaultEditorState(), bundledBold, bundledRegular);

      const pasted = paste(state, createTextItem({ id: 'pasted', fontFamily: 'Poster Sans' }));

      // The file the font picker used to register: the first one the family has.
      expect(pasted.document.fonts).toEqual([reference(bundledBold)]);
    });

    it('references every uploaded file of the family that pasted text is set in', () => {
      const state = makeAvailable(createDefaultEditorState(), regular, bold);

      const pasted = paste(state, createTextItem({ id: 'pasted', fontFamily: 'Poster Sans' }));

      expect(pasted.document.fonts).toEqual([reference(regular), reference(bold)]);
    });

    it('puts the reference back when the only text in a font is cut and pasted', () => {
      const state = makeAvailable(stateWithText(), regular);
      const [headline] = state.document.nodes;

      const cut = reduceEditorState(
        state,
        toEditorAction({ type: 'delete_nodes', nodeIds: ['headline'] }),
      );
      expect(cut.document.fonts).toEqual([]);

      const pasted = paste(cut, cloneCanvasNode(headline));

      expect(pasted.document.fonts).toEqual([reference(regular)]);
    });

    it('references each family once for text nested in a pasted group', () => {
      const state = makeAvailable(createDefaultEditorState(), bundledBold, otherFamily);

      const pasted = paste(
        state,
        createGroupNode([
          createTextItem({ id: 'first', fontFamily: 'Poster Sans' }),
          createRectangleItem({ id: 'shape' }),
          createGroupNode([
            createTextItem({ id: 'second', fontFamily: 'Session Sans' }),
            createTextItem({ id: 'third', fontFamily: 'Poster Sans' }),
          ]),
        ]),
      );

      expect(pasted.document.fonts).toEqual([reference(bundledBold), reference(otherFamily)]);
    });

    it('adds no reference for a family the session has no file for', () => {
      const state = makeAvailable(createDefaultEditorState(), regular);

      const pasted = paste(state, createTextItem({ id: 'pasted', fontFamily: 'Arial' }));

      expect(pasted.document.fonts).toEqual([]);
    });

    it('undoes and redoes a paste together with its font reference', () => {
      const state = makeAvailable(createDefaultEditorState(), regular);

      const pasted = paste(state, createTextItem({ id: 'pasted', fontFamily: 'Poster Sans' }));
      expect(pasted.history.past).toHaveLength(1);

      const undone = reduceEditorState(pasted, { family: 'history', type: 'undo' });
      expect(undone.document.nodes).toEqual([]);
      expect(undone.document.fonts).toEqual([]);

      const redone = reduceEditorState(undone, { family: 'history', type: 'redo' });
      expect(redone.document.fonts).toEqual([reference(regular)]);
    });

    it('references the family that existing text is switched to', () => {
      const state = makeAvailable(stateWithText('Arial'), bundledBold);

      const switched = reduceEditorState(
        state,
        toEditorAction({
          type: 'update_node',
          itemId: 'headline',
          changes: { fontFamily: 'Poster Sans' },
        }),
      );

      expect(switched.document.fonts).toEqual([reference(bundledBold)]);
    });

    it('references the families of a loaded document that came without references', () => {
      const state = makeAvailable(createDefaultEditorState(), bundledBold);

      const loaded = reduceEditorState(
        state,
        toEditorAction({
          type: 'load_document',
          document: {
            ...createDefaultProjectDocument(),
            nodes: [createTextItem({ id: 'loaded-headline', fontFamily: 'Poster Sans' })],
          },
        }),
      );

      expect(loaded.document.fonts).toEqual([reference(bundledBold)]);
    });

    it('references a font imported after text was already set in its family, without an undo step', () => {
      const state = stateWithText();
      expect(state.document.fonts).toEqual([]);

      const imported = makeAvailable(state, regular);

      expect(imported.document.fonts).toEqual([reference(regular)]);
      expect(imported.history).toBe(state.history);
    });
  });
});
