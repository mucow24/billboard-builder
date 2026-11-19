import { describe, expect, it } from 'vitest';

import {
  getGroupDescendantAtPoint,
  getItemsAtPoint,
  getSelectedHitAtPoint,
  getSelectionCycleTargetAtPoint,
  resolveCoveredSelectionPress,
} from './interactionHitTesting';
import { buildRenderableCanvasItems } from './renderAdapter';
import {
  createDefaultProjectDocument,
  createGeneratorItem,
  createLineItem,
  createRectangleItem,
} from '../document/documentDefaults';
import { createGroupNode } from '../document/sceneGraph';
import type { CanvasNode, ProjectDocument } from '../document/documentTypes';

function rect(id: string, x: number, y: number, size = 100, extra: Record<string, unknown> = {}) {
  return createRectangleItem({ id, x, y, width: size, height: size, ...extra });
}

function renderablesFor(nodes: CanvasNode[], selectedNodeIds: string[] = []) {
  const document: ProjectDocument = { ...createDefaultProjectDocument(), nodes };
  return buildRenderableCanvasItems(document, selectedNodeIds);
}

/** Alt-click `times` times at `point`, feeding each result back in as the selection. */
function cycle(nodes: CanvasNode[], point: { x: number; y: number }, times: number, start: string[] = []) {
  const visited: Array<string | null> = [];
  let selection = start;
  for (let i = 0; i < times; i++) {
    const target = getSelectionCycleTargetAtPoint(renderablesFor(nodes, selection), selection, point);
    visited.push(target);
    selection = target ? [target] : [];
  }
  return visited;
}

describe('getItemsAtPoint', () => {
  it('lists every item under the point top-most first, including locked and covered ones', () => {
    const nodes = [
      rect('bottom', 0, 0, 300),
      rect('middle', 50, 50, 200, { locked: true }),
      rect('top', 100, 100, 100),
      rect('elsewhere', 600, 600),
    ];

    expect(getItemsAtPoint(renderablesFor(nodes), { x: 150, y: 150 }).map((item) => item.id)).toEqual([
      'top',
      'middle',
      'bottom',
    ]);
    expect(getItemsAtPoint(renderablesFor(nodes), { x: 20, y: 20 }).map((item) => item.id)).toEqual(['bottom']);
    expect(getItemsAtPoint(renderablesFor(nodes), { x: 450, y: 450 })).toEqual([]);
  });

  it('never returns hidden items', () => {
    const nodes = [rect('shown', 0, 0), rect('hidden', 0, 0, 100, { hidden: true })];

    expect(getItemsAtPoint(renderablesFor(nodes), { x: 50, y: 50 }).map((item) => item.id)).toEqual(['shown']);
  });

  it('hits a diagonal line along its stroke corridor, not across its bounding box', () => {
    const line = createLineItem({ id: 'line', vertices: [{ x: 0, y: 0 }, { x: 200, y: 200 }], strokeWidth: 4 });
    const items = renderablesFor([line]);

    expect(getItemsAtPoint(items, { x: 100, y: 104 }).map((item) => item.id)).toEqual(['line']);
    // Inside the bounding box, far from the stroke.
    expect(getItemsAtPoint(items, { x: 180, y: 20 })).toEqual([]);
    // Past the end of the line, beyond the 12px grab margin around its ends.
    expect(getItemsAtPoint(items, { x: 215, y: 215 })).toEqual([]);
  });

  it('treats a generator as covering the whole canvas', () => {
    const generator = { ...createGeneratorItem('noise', 800, 600), id: 'generator' };
    const items = renderablesFor([generator]);

    expect(getItemsAtPoint(items, { x: 790, y: 590 }).map((item) => item.id)).toEqual(['generator']);
    expect(getItemsAtPoint(items, { x: 810, y: 300 })).toEqual([]);
  });
});

describe('getGroupDescendantAtPoint', () => {
  // Drilling into a group is more forgiving than a click: see pointHitsRenderableItem.
  it('finds a straight line anywhere in its padded box, a bent line only along its stroke', () => {
    const straight = createLineItem({
      id: 'straight',
      vertices: [{ x: 0, y: 0 }, { x: 200, y: 200 }],
    });
    const bent = createLineItem({
      id: 'bent',
      vertices: [{ x: 400, y: 0 }, { x: 600, y: 200 }, { x: 800, y: 0 }],
    });
    const group = { ...createGroupNode([straight, bent]), id: 'group' };
    const renderables = renderablesFor([group]);

    // Far off the diagonal stroke, inside the straight line's box.
    expect(getGroupDescendantAtPoint(renderables, 'group', { x: 180, y: 20 })?.id).toBe('straight');
    // Just outside the box, within its 8px padding.
    expect(getGroupDescendantAtPoint(renderables, 'group', { x: 205, y: 100 })?.id).toBe('straight');
    expect(getGroupDescendantAtPoint(renderables, 'group', { x: 220, y: 100 })).toBeNull();

    // Inside the bent line's box but off both strokes: no hit.
    expect(getGroupDescendantAtPoint(renderables, 'group', { x: 600, y: 40 })).toBeNull();
    expect(getGroupDescendantAtPoint(renderables, 'group', { x: 500, y: 100 })?.id).toBe('bent');
  });
});

describe('getSelectedHitAtPoint', () => {
  const overlap = { x: 150, y: 150 };

  function selectedHit(nodes: CanvasNode[], selection: string[], point = overlap) {
    const hit = getSelectedHitAtPoint(renderablesFor(nodes, selection), selection, point);
    return hit ? { itemId: hit.item.id, nodeId: hit.nodeId } : null;
  }

  it('finds a selected item covered by an unselected one', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('top', 100, 100)];

    expect(selectedHit(nodes, ['bottom'])).toEqual({ itemId: 'bottom', nodeId: 'bottom' });
  });

  it('returns null when the selection is empty or not under the point', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('top', 100, 100), rect('elsewhere', 600, 600)];

    expect(selectedHit(nodes, [])).toBeNull();
    expect(selectedHit(nodes, ['elsewhere'])).toBeNull();
    expect(selectedHit(nodes, ['top'], { x: 20, y: 20 })).toBeNull();
  });

  it('returns the top-most selected item of a multi-selection', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('middle', 50, 50, 200), rect('top', 100, 100)];

    expect(selectedHit(nodes, ['bottom', 'middle'])).toEqual({ itemId: 'middle', nodeId: 'middle' });
  });

  it('resolves an item inside a selected group to the group', () => {
    const group = { ...createGroupNode([rect('child', 0, 0, 300)]), id: 'group' };
    const nodes = [group, rect('top', 100, 100)];

    expect(selectedHit(nodes, ['group'])).toEqual({ itemId: 'child', nodeId: 'group' });
  });

  it('skips locked items and generators', () => {
    const generator = { ...createGeneratorItem('noise', 800, 600), id: 'generator' };
    const nodes = [generator, rect('locked', 0, 0, 300, { locked: true }), rect('top', 100, 100)];

    expect(selectedHit(nodes, ['generator', 'locked'])).toBeNull();
  });
});

describe('resolveCoveredSelectionPress', () => {
  const overlap = { x: 150, y: 150 };

  function coveredPress(nodes: CanvasNode[], selection: string[], pressedItemId: string, point = overlap) {
    const hit = resolveCoveredSelectionPress(renderablesFor(nodes, selection), selection, pressedItemId, point);
    return hit ? { itemId: hit.item.id, nodeId: hit.nodeId } : null;
  }

  it('resolves a press on an unselected item to the selected item it covers', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('top', 100, 100)];

    expect(coveredPress(nodes, ['bottom'], 'top')).toEqual({ itemId: 'bottom', nodeId: 'bottom' });
  });

  it('is null when the pressed item is itself selected', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('top', 100, 100)];

    expect(coveredPress(nodes, ['top'], 'top')).toBeNull();
    expect(coveredPress(nodes, ['bottom', 'top'], 'top')).toBeNull();
  });

  it('is null when the pressed item belongs to a selected group', () => {
    const group = { ...createGroupNode([rect('child-a', 0, 0, 300), rect('child-b', 100, 100)]), id: 'group' };

    expect(coveredPress([group], ['group'], 'child-b')).toBeNull();
  });

  it('is null when nothing is selected, the selection is elsewhere, or the pressed item is unknown', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('top', 100, 100), rect('elsewhere', 600, 600)];

    expect(coveredPress(nodes, [], 'top')).toBeNull();
    expect(coveredPress(nodes, ['elsewhere'], 'top')).toBeNull();
    expect(coveredPress(nodes, ['bottom'], 'missing')).toBeNull();
  });

  it('resolves a press on a sibling to the drilled-in child it covers', () => {
    const group = { ...createGroupNode([rect('child-a', 0, 0, 300), rect('child-b', 100, 100)]), id: 'group' };

    expect(coveredPress([group], ['child-a'], 'child-b')).toEqual({ itemId: 'child-a', nodeId: 'child-a' });
  });

  it('resolves to the selected group of a covered item', () => {
    const group = { ...createGroupNode([rect('child', 0, 0, 300)]), id: 'group' };

    expect(coveredPress([group, rect('top', 100, 100)], ['group'], 'top')).toEqual({
      itemId: 'child',
      nodeId: 'group',
    });
  });

  it('is null over a selected locked item or generator', () => {
    const generator = { ...createGeneratorItem('noise', 800, 600), id: 'generator' };
    const nodes = [generator, rect('locked', 0, 0, 300, { locked: true }), rect('top', 100, 100)];

    expect(coveredPress(nodes, ['generator', 'locked'], 'top')).toBeNull();
  });
});

describe('getSelectionCycleTargetAtPoint', () => {
  const overlap = { x: 150, y: 150 };

  it('returns null when nothing is under the point', () => {
    expect(getSelectionCycleTargetAtPoint(renderablesFor([rect('a', 0, 0)]), [], { x: 500, y: 500 })).toBeNull();
  });

  it('selects the top-most item first, like a plain click', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('top', 100, 100)];

    expect(getSelectionCycleTargetAtPoint(renderablesFor(nodes), [], overlap)).toBe('top');
  });

  it('starts from the top when the selection is somewhere else', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('top', 100, 100), rect('elsewhere', 600, 600)];

    expect(getSelectionCycleTargetAtPoint(renderablesFor(nodes), ['elsewhere'], overlap)).toBe('top');
  });

  it('steps down through covered items and wraps back to the top', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('middle', 50, 50, 200), rect('top', 100, 100)];

    expect(cycle(nodes, overlap, 5)).toEqual(['top', 'middle', 'bottom', 'top', 'middle']);
  });

  it('includes locked items in the cycle', () => {
    const nodes = [
      rect('locked-bottom', 0, 0, 300, { locked: true }),
      rect('middle', 50, 50, 200),
      rect('top', 100, 100),
    ];

    expect(cycle(nodes, overlap, 4)).toEqual(['top', 'middle', 'locked-bottom', 'top']);
  });

  it('starts on the item a plain click would select when a locked item sits on top', () => {
    const nodes = [
      rect('bottom', 0, 0, 300),
      rect('middle', 50, 50, 200),
      rect('locked-top', 100, 100, 100, { locked: true }),
    ];

    expect(cycle(nodes, overlap, 4)).toEqual(['middle', 'bottom', 'locked-top', 'middle']);
  });

  it('selects a locked item when only locked items are under the point', () => {
    const nodes = [rect('locked', 0, 0, 300, { locked: true }), rect('elsewhere', 600, 600)];

    expect(cycle(nodes, overlap, 2)).toEqual(['locked', 'locked']);
  });

  it('keeps the only item under the point selected', () => {
    const nodes = [rect('only', 0, 0, 300)];

    expect(getSelectionCycleTargetAtPoint(renderablesFor(nodes, ['only']), ['only'], overlap)).toBe('only');
  });

  it('steps below the deepest selected item in a multi-selection', () => {
    const nodes = [rect('bottom', 0, 0, 300), rect('middle', 50, 50, 200), rect('top', 100, 100)];
    const selection = ['top', 'middle'];

    expect(getSelectionCycleTargetAtPoint(renderablesFor(nodes, selection), selection, overlap)).toBe('bottom');
  });

  it('treats an undrilled group as a single stop', () => {
    const group = { ...createGroupNode([rect('child-a', 50, 50, 200), rect('child-b', 100, 100)]), id: 'group' };
    const nodes = [rect('bottom', 0, 0, 300), group];

    expect(cycle(nodes, overlap, 4)).toEqual(['group', 'bottom', 'group', 'bottom']);
  });

  it('cycles sibling items once a group has been drilled into', () => {
    const group = { ...createGroupNode([rect('child-a', 50, 50, 200), rect('child-b', 100, 100)]), id: 'group' };
    const nodes = [rect('bottom', 0, 0, 300), group];

    expect(cycle(nodes, overlap, 4, ['child-b'])).toEqual(['child-a', 'bottom', 'group', 'bottom']);
  });
});
