import { describe, expect, it } from 'vitest';

import {
  buildInteractionCommit,
  buildRenderedItems,
  createCreateSession,
  createGroupDragSession,
  createGroupResizeSession,
  resolveInteractionSession,
  type SelectionFrame,
} from './interactionSession';
import {
  createLineItem,
  createRectangleItem,
} from '../document/documentDefaults';

describe('interactionSession', () => {
  it('builds rendered items by overlaying previews and appending create previews', () => {
    const first = createRectangleItem({ id: 'first' });
    const second = createRectangleItem({ id: 'second' });
    const preview = createRectangleItem({ id: 'second', x: 999, y: 888 });
    const createPreview = createRectangleItem({ id: 'created' });

    const rendered = buildRenderedItems([first, second], {
      kind: 'create',
      tool: 'rectangle',
      pointerStart: { x: 10, y: 20 },
      previewItem: createPreview,
      guides: [],
      snapDisabled: false,
    });
    const renderedWithOverlay = buildRenderedItems([first, second], {
      kind: 'drag',
      itemId: second.id,
      originalItem: second,
      previewItem: preview,
      siblingItems: [first],
      pointerStart: { x: 0, y: 0 },
      guides: [],
      snapDisabled: false,
      axisLock: undefined,
    });

    expect(rendered).toEqual([first, second, createPreview]);
    expect(renderedWithOverlay).toEqual([first, preview]);
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
        currentPointer: { x: 180, y: 160 },
        toggleMode: true,
        guides: [],
      },
      {
        orderedItems: [visible, hidden],
        pointer: { x: 180, y: 160 },
      }
    );

    expect(commit).toEqual({
      kind: 'marquee',
      hitIds: ['visible'],
      toggleMode: true,
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
});
