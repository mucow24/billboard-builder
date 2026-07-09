import { describe, expect, it } from 'vitest';

import {
  buildInteractionCommit,
  buildRenderedRenderables,
  createCreateSession,
  createGroupDragSession,
  createGroupResizeSession,
  createGroupRotateSession,
  createPolygonEdgeInsertSession,
  createPolygonVertexSession,
  getCommitChanges,
  resolveInteractionSession,
  type SelectionFrame,
} from './interactionSession';
import {
  createGroupNode,
  createLineItem,
  createPolygonItem,
  createRectangleItem,
} from '../document/documentDefaults';
import { buildRenderableCanvasItems } from './renderAdapter';
import type { ProjectDocument } from '../document/documentTypes';

function createDocument(nodes: ProjectDocument['nodes']): ProjectDocument {
  return {
    version: 2,
    name: 'Untitled canvas',
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
      siblingItems: [],
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

  it('drops a sub-threshold create preview and commits the centered default on a click', () => {
    // Regression: a stray same-spot pointermove between down and up builds a
    // 1x1 preview; a click must still drop the full default-size item centered
    // on the click, not the degenerate preview.
    const start = { x: 500, y: 400 };
    const session = createCreateSession('polygon', start);
    const moved = resolveInteractionSession(
      { ...session, snapDisabled: true },
      start,
      { stageBounds: canvasBounds },
    );
    expect(moved.kind).toBe('create');
    if (moved.kind !== 'create') return;
    expect(moved.previewItem).not.toBeNull();

    const commit = buildInteractionCommit(moved, {
      orderedItems: [],
      pointer: { x: 501, y: 400 },
      canvasBounds,
    });
    expect(commit.kind).toBe('create');
    if (commit.kind !== 'create') return;
    expect(commit.item.kind).toBe('polygon');
    expect(commit.item.width).toBeGreaterThan(1);
    expect(commit.item.height).toBeGreaterThan(1);
    // Centered on the click.
    expect(commit.item.x + commit.item.width / 2).toBeCloseTo(500, 0);
    expect(commit.item.y + commit.item.height / 2).toBeCloseTo(400, 0);
  });

  it('keeps a real drag preview when the pointer traveled past the click threshold', () => {
    const session = createCreateSession('rectangle', { x: 100, y: 120 });
    const dragged = resolveInteractionSession(
      { ...session, snapDisabled: true },
      { x: 260, y: 300 },
      { stageBounds: canvasBounds },
    );
    if (dragged.kind !== 'create') throw new Error('expected create session');

    const commit = buildInteractionCommit(dragged, {
      orderedItems: [],
      pointer: { x: 260, y: 300 },
      canvasBounds,
    });
    if (commit.kind !== 'create') throw new Error('expected create commit');
    expect(commit.item).toMatchObject({ kind: 'rectangle', x: 100, y: 120, width: 160, height: 180 });
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

  it('excludes locked items from marquee selection', () => {
    const unlocked = createRectangleItem({ id: 'unlocked', x: 100, y: 100, width: 60, height: 40 });
    const locked = createRectangleItem({ id: 'locked', x: 120, y: 110, width: 60, height: 40, locked: true });
    const commit = buildInteractionCommit(
      {
        kind: 'marquee',
        pointerStart: { x: 90, y: 90 },
        pointerSource: 'stage',
        currentPointer: { x: 200, y: 170 },
        toggleMode: false,
        guides: [],
      },
      {
        orderedItems: [unlocked, locked],
        pointer: { x: 200, y: 170 },
        canvasBounds,
      }
    );

    expect(commit).toEqual({
      kind: 'marquee',
      hitIds: ['unlocked'],
      toggleMode: false,
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

  it('snaps create session preview to stage guides', () => {
    const session = {
      ...createCreateSession('rectangle', { x: 50, y: 50 }),
      siblingItems: [] as ReturnType<typeof createRectangleItem>[],
    };
    // Pointer x=515 is 3px from canvas center (512) — within snap threshold
    const resolved = resolveInteractionSession(session, { x: 515, y: 200 }, {
      stageBounds: canvasBounds,
    });

    expect(resolved.guides).toEqual(
      expect.arrayContaining([{ orientation: 'vertical', position: 512 }])
    );
    if (resolved.kind === 'create' && resolved.previewItem) {
      // The right edge of the rect should snap to 512
      expect(resolved.previewItem.x + resolved.previewItem.width).toBe(512);
    }
  });

  it('snaps create session line endpoint to stage guides', () => {
    const session = {
      ...createCreateSession('line', { x: 100, y: 100 }),
      siblingItems: [] as ReturnType<typeof createRectangleItem>[],
    };
    // Pointer y=515 is 3px from canvas center (512)
    const resolved = resolveInteractionSession(session, { x: 400, y: 515 }, {
      stageBounds: canvasBounds,
    });

    expect(resolved.guides).toEqual(
      expect.arrayContaining([{ orientation: 'horizontal', position: 512 }])
    );
  });

  it('does not snap create session when snapDisabled is true', () => {
    const session = {
      ...createCreateSession('rectangle', { x: 50, y: 50 }),
      siblingItems: [] as ReturnType<typeof createRectangleItem>[],
      snapDisabled: true,
    };
    const resolved = resolveInteractionSession(session, { x: 515, y: 200 }, {
      stageBounds: canvasBounds,
    });

    expect(resolved.guides).toEqual([]);
  });

  it('constrains create rectangle to square when shiftConstrain is true', () => {
    const session = {
      ...createCreateSession('rectangle', { x: 100, y: 100 }),
      siblingItems: [] as ReturnType<typeof createRectangleItem>[],
      shiftConstrain: true,
    };
    const resolved = resolveInteractionSession(session, { x: 250, y: 180 }, {
      stageBounds: canvasBounds,
    });

    if (resolved.kind !== 'create' || !resolved.previewItem) {
      throw new Error('Expected create preview.');
    }
    // Larger dimension is x (150), so both should be 150
    expect(resolved.previewItem.width).toBe(resolved.previewItem.height);
    expect(resolved.previewItem.width).toBe(150);
  });

  it('constrains create ellipse to circle when shiftConstrain is true', () => {
    const session = {
      ...createCreateSession('ellipse', { x: 100, y: 100 }),
      siblingItems: [] as ReturnType<typeof createRectangleItem>[],
      shiftConstrain: true,
    };
    const resolved = resolveInteractionSession(session, { x: 200, y: 260 }, {
      stageBounds: canvasBounds,
    });

    if (resolved.kind !== 'create' || !resolved.previewItem) {
      throw new Error('Expected create preview.');
    }
    expect(resolved.previewItem.kind).toBe('ellipse');
    // Larger dimension is y (160), so both should be 160
    expect(resolved.previewItem.width).toBe(resolved.previewItem.height);
    expect(resolved.previewItem.width).toBe(160);
  });

  it('does not constrain create line with shiftConstrain', () => {
    const session = {
      ...createCreateSession('line', { x: 100, y: 100 }),
      siblingItems: [] as ReturnType<typeof createRectangleItem>[],
      shiftConstrain: true,
    };
    const resolved = resolveInteractionSession(session, { x: 250, y: 180 }, {
      stageBounds: canvasBounds,
    });

    if (resolved.kind !== 'create' || !resolved.previewItem || resolved.previewItem.kind !== 'line') {
      throw new Error('Expected line create preview.');
    }
    // Line endpoint should match snapped pointer, not be constrained to 1:1
    expect(resolved.previewItem.endX).not.toBe(resolved.previewItem.endY);
  });

  it('constrains group resize to original aspect ratio when shiftConstrain is true', () => {
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 220, y: 100, width: 80, height: 40 });
    const frame: SelectionFrame = {
      bounds: { x: 100, y: 100, width: 200, height: 40 },
      rotation: 0,
    };
    const session = createGroupResizeSession('bottom-right', { x: 300, y: 140 }, {
      selectedItems: [first, second],
      siblingItems: [],
      activeSelectionFrame: frame,
    });

    if (!session) {
      throw new Error('Expected group resize session.');
    }

    // Drag bottom-right corner: +100 in x, +30 in y
    const withShift = { ...session, shiftConstrain: true };
    const resolved = resolveInteractionSession(
      withShift,
      { x: 400, y: 170 },
      { stageBounds: canvasBounds }
    );

    if (resolved.kind !== 'group-resize') {
      throw new Error('Expected group-resize session.');
    }

    // Original ratio is 200/40 = 5. The constrained result should maintain that.
    const commit = buildInteractionCommit(resolved, {
      orderedItems: [first, second],
      pointer: { x: 400, y: 170 },
      canvasBounds,
    });
    if (commit.kind !== 'group') {
      throw new Error('Expected group commit.');
    }
    expect(commit.selectionFrame).toBeTruthy();
    const b = commit.selectionFrame!.bounds;
    expect(b.width / b.height).toBeCloseTo(5, 1);
  });

  it('keeps the group aspect ratio locked when a proportional resize snaps a vertical guide', () => {
    // Square selection (ratio 1). Drag the bottom-right corner proportionally so
    // the moving corner lands at (462, 462): the right edge (x=462) is 8px from a
    // sibling's left edge at x=470 (snaps), while the bottom edge is out of range
    // of every horizontal guide. Snapping only the right edge used to stretch the
    // selection across the band; the ratio must stay locked instead.
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 100, height: 100 });
    const second = createRectangleItem({ id: 'second', x: 200, y: 200, width: 100, height: 100 });
    const sibling = createRectangleItem({ id: 'guide', x: 470, y: 700, width: 40, height: 40 });
    const frame: SelectionFrame = { bounds: { x: 100, y: 100, width: 200, height: 200 }, rotation: 0 };
    const session = createGroupResizeSession('bottom-right', { x: 300, y: 300 }, {
      selectedItems: [first, second],
      siblingItems: [sibling],
      activeSelectionFrame: frame,
    });
    if (!session) throw new Error('Expected group resize session.');

    const withShift = { ...session, shiftConstrain: true };
    const resolved = resolveInteractionSession(
      withShift,
      { x: 462, y: 462 },
      { stageBounds: canvasBounds }
    );
    if (resolved.kind !== 'group-resize') throw new Error('Expected group-resize session.');

    expect(resolved.guides).toContainEqual({ orientation: 'vertical', position: 470 });
    const commit = buildInteractionCommit(resolved, {
      orderedItems: [first, second],
      pointer: { x: 462, y: 462 },
      canvasBounds,
    });
    if (commit.kind !== 'group') throw new Error('Expected group commit.');
    const b = commit.selectionFrame!.bounds;
    // Right edge snapped to the guide (width 370) and height scaled to match.
    expect(b.width).toBeCloseTo(370, 1);
    expect(b.width / b.height).toBeCloseTo(1, 3);
  });

  it('keeps the group aspect ratio locked when a proportional resize snaps a horizontal guide', () => {
    // Mirror of the vertical case: the bottom edge (y=462) snaps to a sibling's
    // top edge at y=470 while the right edge is out of range, so the width must
    // scale to match the snapped height.
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 100, height: 100 });
    const second = createRectangleItem({ id: 'second', x: 200, y: 200, width: 100, height: 100 });
    const sibling = createRectangleItem({ id: 'guide', x: 700, y: 470, width: 40, height: 40 });
    const frame: SelectionFrame = { bounds: { x: 100, y: 100, width: 200, height: 200 }, rotation: 0 };
    const session = createGroupResizeSession('bottom-right', { x: 300, y: 300 }, {
      selectedItems: [first, second],
      siblingItems: [sibling],
      activeSelectionFrame: frame,
    });
    if (!session) throw new Error('Expected group resize session.');

    const withShift = { ...session, shiftConstrain: true };
    const resolved = resolveInteractionSession(
      withShift,
      { x: 462, y: 462 },
      { stageBounds: canvasBounds }
    );
    if (resolved.kind !== 'group-resize') throw new Error('Expected group-resize session.');

    expect(resolved.guides).toContainEqual({ orientation: 'horizontal', position: 470 });
    const commit = buildInteractionCommit(resolved, {
      orderedItems: [first, second],
      pointer: { x: 462, y: 462 },
      canvasBounds,
    });
    if (commit.kind !== 'group') throw new Error('Expected group commit.');
    const b = commit.selectionFrame!.bounds;
    expect(b.height).toBeCloseTo(370, 1);
    expect(b.width / b.height).toBeCloseTo(1, 3);
  });

  it('snaps group drag using AABB when frame is rotated', () => {
    // Two items at different positions, with a rotated selection frame.
    // The frame rotation means current.bounds is NOT the AABB.
    // The fix should snap based on the items' AABB instead.
    const first = createRectangleItem({ id: 'first', x: 100, y: 100, width: 80, height: 40, rotation: 45 });
    const second = createRectangleItem({ id: 'second', x: 200, y: 100, width: 80, height: 40, rotation: 45 });

    // Frame with non-zero rotation — bounds are NOT the AABB
    const frame: SelectionFrame = {
      bounds: { x: 100, y: 80, width: 200, height: 80 },
      rotation: 45,
    };
    const session = createGroupDragSession({ x: 200, y: 120 }, {
      selectedItems: [first, second],
      siblingItems: [],
      activeSelectionFrame: frame,
    });

    if (!session) {
      throw new Error('Expected group drag session.');
    }

    // Resolve the session — should not throw and should produce valid previews
    const resolved = resolveInteractionSession(session, { x: 300, y: 120 }, {
      stageBounds: { x: 0, y: 0, width: 1024, height: 1024 },
    });

    expect(resolved.kind).toBe('group-drag');
    if (resolved.kind !== 'group-drag') return;
    expect(resolved.previewItems).toHaveLength(2);
    // The items should have moved by the drag delta
    expect(resolved.previewItems[0].x).not.toBe(first.x);
  });
});

describe('polygon vertex sessions', () => {
  const stageBounds = { x: 0, y: 0, width: 1024, height: 1024 };
  const squarePolygon = () =>
    createPolygonItem({
      vertices: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 },
      ],
    });

  it('drags a vertex through resolve and commits the updated vertices', () => {
    const item = squarePolygon();
    const session = createPolygonVertexSession(item, 1, { x: 300, y: 100 }, []);
    if (!session) throw new Error('Expected polygon vertex session.');
    expect(session.insertedVertex).toBe(false);

    const resolved = resolveInteractionSession(
      { ...session, snapDisabled: true },
      { x: 360, y: 80 },
      { stageBounds },
    );
    expect(resolved.kind).toBe('polygon-vertex');
    if (resolved.kind !== 'polygon-vertex') return;
    if (resolved.previewItem.kind !== 'polygon') throw new Error('expected polygon preview');
    expect(resolved.previewItem.vertices[1]).toEqual({ x: 360, y: 80 });

    const commit = buildInteractionCommit(resolved, {
      orderedItems: [item],
      pointer: { x: 360, y: 80 },
      canvasBounds: stageBounds,
    });
    expect(commit.kind).toBe('single-item');
    if (commit.kind !== 'single-item') return;
    expect(commit.changes).toMatchObject({
      vertices: [
        { x: 100, y: 100 },
        { x: 360, y: 80 },
        { x: 300, y: 300 },
        { x: 100, y: 300 },
      ],
      x: 100,
      y: 80,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('returns null for a vertex session on a missing vertex', () => {
    expect(createPolygonVertexSession(squarePolygon(), 9, { x: 0, y: 0 }, [])).toBeNull();
  });

  it('edge insert starts from a preview containing the midpoint vertex', () => {
    const item = squarePolygon();
    const session = createPolygonEdgeInsertSession(item, 1, { x: 300, y: 200 }, []);
    if (!session) throw new Error('Expected edge insert session.');

    expect(session.insertedVertex).toBe(true);
    expect(session.vertexIndex).toBe(2);
    if (session.previewItem.kind !== 'polygon') throw new Error('expected polygon preview');
    expect(session.previewItem.vertices).toHaveLength(5);
    expect(session.previewItem.vertices[2]).toEqual({ x: 300, y: 200 });

    // A no-move tap still commits the insert (the preview already differs from
    // the document item).
    const commit = buildInteractionCommit(session, {
      orderedItems: [item],
      pointer: { x: 300, y: 200 },
      canvasBounds: stageBounds,
    });
    expect(commit.kind).toBe('single-item');
    if (commit.kind !== 'single-item') return;
    expect((commit.changes as { vertices: unknown[] }).vertices).toHaveLength(5);
  });

  it('rejects an edge insert for an out-of-range edge index', () => {
    expect(createPolygonEdgeInsertSession(squarePolygon(), 4, { x: 0, y: 0 }, [])).toBeNull();
  });

  it('persists vertices plus the derived box on commit', () => {
    const item = squarePolygon();
    expect(getCommitChanges(item)).toEqual({
      vertices: item.vertices,
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      scaleX: 1,
      scaleY: 1,
    });
  });
});
