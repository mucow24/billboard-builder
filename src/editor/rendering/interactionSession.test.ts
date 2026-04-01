import { describe, expect, it } from 'vitest';

import {
  buildInteractionCommit,
  buildRenderedRenderables,
  createCreateSession,
  createGroupDragSession,
  createGroupResizeSession,
  createGroupRotateSession,
  resolveInteractionSession,
  type SelectionFrame,
} from './interactionSession';
import {
  createGroupNode,
  createLineItem,
  createRectangleItem,
} from '../document/documentDefaults';
import { buildRenderableCanvasItems } from './renderAdapter';
import type { ProjectDocument } from '../document/documentTypes';

function createDocument(nodes: ProjectDocument['nodes']): ProjectDocument {
  return {
    version: 2,
    canvas: {
      width: 1024,
      height: 1024,
      presetId: 'square-lg',
    },
    background: '#ffffff00',
    nodes,
    fonts: [],
  };
}

describe('interactionSession', () => {
  const canvasBounds = { x: 0, y: 0, width: 1024, height: 1024 };

  it('keeps unchanged renderables by reference while overlaying previews', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createRectangleItem({ id: 'second', x: 220 });
    const group = createGroupNode([first, second], 'Poster Group');
    group.id = 'group-1';
    const renderables = buildRenderableCanvasItems(createDocument([group]), [group.id]);
    const [firstRenderable, secondRenderable] = renderables;
    const preview = createRectangleItem({ id: 'second', x: 999, y: 888 });

    const rendered = buildRenderedRenderables(renderables, {
      kind: 'drag',
      itemId: second.id,
      originalItem: second,
      previewItem: preview,
      siblingItems: [first],
      pointerStart: { x: 0, y: 0 },
      pointerSource: 'stage',
      guides: [],
      snapDisabled: false,
      axisLock: undefined,
    });

    expect(rendered[0]).toBe(firstRenderable);
    expect(rendered[1]).not.toBe(secondRenderable);
    expect(rendered[1]).toMatchObject({
      id: second.id,
      x: 999,
      y: 888,
      groupPath: secondRenderable.groupPath,
      selectableNodeId: secondRenderable.selectableNodeId,
      opacity: secondRenderable.opacity,
    });
  });

  it('returns the original renderables array when no preview is active', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createRectangleItem({ id: 'second' });
    const renderables = buildRenderableCanvasItems(createDocument([first, second]));

    expect(buildRenderedRenderables(renderables, null)).toBe(renderables);
  });

  it('synthesizes create previews with default render metadata', () => {
    const first = createRectangleItem({ id: 'first' });
    const renderables = buildRenderableCanvasItems(createDocument([first]));
    const createPreview = createRectangleItem({ id: 'created', x: 320, y: 240, opacity: 0.6 });

    const rendered = buildRenderedRenderables(renderables, {
      kind: 'create',
      tool: 'rectangle',
      pointerStart: { x: 10, y: 20 },
      pointerSource: 'stage',
      previewItem: createPreview,
      guides: [],
      snapDisabled: false,
    });

    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toBe(renderables[0]);
    expect(rendered[1]).toMatchObject({
      id: 'created',
      groupPath: [],
      selectableNodeId: 'created',
      opacity: 0.6,
    });
  });

  it('returns null for group sessions without a frame or enough items', () => {
    const item = createRectangleItem();

    expect(
      createGroupDragSession(
        { x: 10, y: 20 },
        {
          selectedItems: [item],
          siblingItems: [],
          activeSelectionFrame: null,
        }
      )
    ).toBeNull();
  });

  it('uses the final pointer to build a create commit when there is no preview item yet', () => {
    const session = createCreateSession('rectangle', { x: 100, y: 120 });
    const commit = buildInteractionCommit(session, {
      orderedItems: [],
      pointer: { x: 180, y: 200 },
      canvasBounds,
    });

    expect(commit).toEqual({
      kind: 'create',
      item: expect.objectContaining({
        kind: 'rectangle',
        x: 100,
        y: 120,
        width: 80,
        height: 80,
      }),
      nextTool: 'select',
    });
  });

  it('builds marquee commits from hit-tested ordered items', () => {
    const visible = createRectangleItem({ id: 'visible', x: 100, y: 100, width: 60, height: 40 });
    const hidden = createRectangleItem({ id: 'hidden', x: 120, y: 110, width: 60, height: 40, hidden: true });
    const commit = buildInteractionCommit(
      {
        kind: 'marquee',
        pointerStart: { x: 90, y: 90 },
        pointerSource: 'stage',
        currentPointer: { x: 180, y: 160 },
        toggleMode: true,
        guides: [],
      },
      {
        orderedItems: [visible, hidden],
        pointer: { x: 180, y: 160 },
        canvasBounds,
      }
    );

    expect(commit).toEqual({
      kind: 'marquee',
      hitIds: ['visible'],
      toggleMode: true,
    });
  });

  it('selects fully off-canvas items when the marquee stays outside the canvas', () => {
    const offCanvas = createRectangleItem({
      id: 'off-canvas',
      x: -180,
      y: 120,
      width: 140,
      height: 120,
    });

    const commit = buildInteractionCommit(
      {
        kind: 'marquee',
        pointerStart: { x: -260, y: 80 },
        pointerSource: 'stage',
        currentPointer: { x: -40, y: 280 },
        toggleMode: false,
        guides: [],
      },
      {
        orderedItems: [offCanvas],
        pointer: { x: -40, y: 280 },
        canvasBounds,
      }
    );

    expect(commit).toEqual({
      kind: 'marquee',
      hitIds: ['off-canvas'],
      toggleMode: false,
    });
  });

  it('includes edge-crossing and fully off-canvas items when the marquee crosses the canvas edge', () => {
    const partlyVisible = createRectangleItem({
      id: 'partly-visible',
      x: -80,
      y: 140,
      width: 180,
      height: 120,
    });
    const fullyOutside = createRectangleItem({
      id: 'fully-outside',
      x: -260,
      y: 140,
      width: 120,
      height: 120,
    });

    const commit = buildInteractionCommit(
      {
        kind: 'marquee',
        pointerStart: { x: -300, y: 100 },
        pointerSource: 'stage',
        currentPointer: { x: 90, y: 300 },
        toggleMode: false,
        guides: [],
      },
      {
        orderedItems: [partlyVisible, fullyOutside],
        pointer: { x: 90, y: 300 },
        canvasBounds,
      }
    );

    expect(commit).toEqual({
      kind: 'marquee',
      hitIds: ['partly-visible', 'fully-outside'],
      toggleMode: false,
    });
  });

  it('resolves group resize sessions into updates and a committed frame', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const frame: SelectionFrame = {
      bounds: { x: 100, y: 100, width: 200, height: 40 },
      rotation: 0,
    };
    const session = createGroupResizeSession('middle-right', { x: 300, y: 120 }, {
      selectedItems: [first, second],
      siblingItems: [createLineItem({ id: 'sibling-line' })],
      activeSelectionFrame: frame,
    });

    if (!session) {
      throw new Error('Expected group resize session.');
    }

    const resolved = resolveInteractionSession(session, { x: 360, y: 120 }, {
      stageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    });
    const commit = buildInteractionCommit(resolved, {
      orderedItems: [first, second],
      pointer: { x: 360, y: 120 },
      canvasBounds,
    });

    expect(commit.kind).toBe('group');
    if (commit.kind !== 'group') {
      throw new Error('Expected group commit.');
    }
    expect(commit.updates).toHaveLength(2);
    expect(commit.selectionFrame).toEqual({
      bounds: { x: 100, y: 100, width: 260, height: 40 },
      rotation: 0,
    });
  });

  it('widens snap threshold when zoomed out', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const frame: SelectionFrame = {
      bounds: { x: 100, y: 100, width: 200, height: 40 },
      rotation: 0,
    };
    const session = createGroupDragSession({ x: 200, y: 120 }, {
      selectedItems: [first, second],
      siblingItems: [],
      activeSelectionFrame: frame,
    });

    if (!session) {
      throw new Error('Expected group drag session.');
    }

    // Move group 12 canvas-pixels away from stage center (512).
    // At zoom=1, threshold=8 so 12px is too far — no snap.
    // At zoom=0.5, threshold=16 so 12px should snap.
    const noSnap = resolveInteractionSession(session, { x: 424, y: 120 }, {
      stageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
      zoom: 1,
    });
    expect(noSnap.guides).toEqual([]);

    const snapped = resolveInteractionSession(session, { x: 424, y: 120 }, {
      stageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
      zoom: 0.5,
    });
    expect(snapped.guides).toEqual(
      expect.arrayContaining([{ orientation: 'vertical', position: 512 }])
    );
  });

  it('snaps committed group-rotate frame rotation when shiftConstrain is true', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const frame: SelectionFrame = {
      bounds: { x: 100, y: 100, width: 200, height: 40 },
      rotation: 0,
    };
    const session = createGroupRotateSession({ x: 300, y: 120 }, {
      selectedItems: [first, second],
      siblingItems: [],
      activeSelectionFrame: frame,
    });

    if (!session) {
      throw new Error('Expected group rotate session.');
    }

    // Apply shiftConstrain and resolve with a pointer that produces a non-15° angle
    const withShift = { ...session, shiftConstrain: true };
    const resolved = resolveInteractionSession(withShift, { x: 250, y: 50 }, {
      stageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    });
    const commit = buildInteractionCommit(resolved, {
      orderedItems: [first, second],
      pointer: { x: 250, y: 50 },
      canvasBounds,
    });

    expect(commit.kind).toBe('group');
    if (commit.kind !== 'group') {
      throw new Error('Expected group commit.');
    }

    // The committed frame rotation must be a multiple of 15°
    expect(commit.selectionFrame?.rotation).not.toBeUndefined();
    expect(Math.abs(commit.selectionFrame!.rotation % 15)).toBe(0);
  });
});
