import { describe, expect, it } from 'vitest';

import {
  createLineItem,
  createRectangleItem,
} from '../../document/documentDefaults';

import { buildStageDerivedState } from './stageDerived';

describe('stageDerived', () => {
  it('derives viewport overlays for single selection and marquee sessions', () => {
    const rectangle = createRectangleItem({
      x: 20,
      y: 30,
      width: 80,
      height: 40,
    });

    const derived = buildStageDerivedState({
      renderedGroupBounds: null,
      renderedSelectedItems: [rectangle],
      renderedSelectionFrame: null,
      selectedRenderedItem: rectangle,
      session: {
        kind: 'marquee',
        pointerStart: { x: 10, y: 15 },
        currentPointer: { x: 70, y: 65 },
      },
      viewport: {
        toViewportPoint: (point) => point,
        toViewportRect: (rect) => ({
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }),
      },
    });

    expect(derived.selectedItemViewportRect).toEqual({
      left: rectangle.x,
      top: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
    });
    expect(derived.marqueeViewportRect).toEqual({
      left: 10,
      top: 15,
      width: 60,
      height: 50,
    });
    expect(derived.selectedShapeHandleRects).not.toBeNull();
    expect(derived.showGroupInteractionHooks).toBe(false);
  });

  it('derives group overlay geometry and line handle rects for grouped sessions', () => {
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });
    const line = createLineItem({ id: 'line', startX: 10, startY: 20, endX: 100, endY: 50 });

    const grouped = buildStageDerivedState({
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      renderedSelectedItems: [first, second],
      renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 0 },
      selectedRenderedItem: first,
      session: {
        kind: 'group-drag',
        previewItems: [first, second],
        frameRotation: 15,
        bounds: { x: 20, y: 30, width: 180, height: 80 },
        pointerStart: { x: 110, y: 70 },
        currentPointer: { x: 150, y: 110 },
      },
      viewport: {
        toViewportPoint: (point) => point,
        toViewportRect: (rect) => ({
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }),
      },
    });

    expect(grouped.groupOverlayFrame).not.toBeNull();
    expect(grouped.groupOverlayViewportRect).not.toBeNull();
    expect(grouped.groupHandleViewportPoints).not.toBeNull();
    expect(grouped.groupRotaterViewportPoint).not.toBeNull();
    expect(grouped.showGroupInteractionHooks).toBe(true);

    const lineDerived = buildStageDerivedState({
      renderedGroupBounds: null,
      renderedSelectedItems: [line],
      renderedSelectionFrame: null,
      selectedRenderedItem: line,
      session: null,
      viewport: {
        toViewportPoint: (point) => point,
        toViewportRect: (rect) => ({
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }),
      },
    });

    expect(lineDerived.selectedLineHandleRects).not.toBeNull();
    expect(lineDerived.selectedShapeHandleRects).toBeNull();
  });
});
