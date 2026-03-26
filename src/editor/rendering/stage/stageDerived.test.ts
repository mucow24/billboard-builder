import { describe, expect, it } from 'vitest';

import {
  createLineItem,
  createRectangleItem,
} from '../../document/documentDefaults';

import { buildStageDerivedState } from './stageDerived';

describe('stageDerived', () => {
  const canvasBounds = { x: 0, y: 0, width: 1024, height: 1024 };

  it('derives viewport overlays for single selection and marquee sessions', () => {
    const rectangle = createRectangleItem({
      x: 20,
      y: 30,
      width: 80,
      height: 40,
    });

    const derived = buildStageDerivedState({
      canvasBounds,
      renderedGroupBounds: null,
      renderedSelectedItems: [rectangle],
      renderedSelectionFrame: null,
      selectedRenderedItem: rectangle,
      session: {
        kind: 'marquee',
        pointerStart: { x: 10, y: 15 },
        currentPointer: { x: 70, y: 65 },
      },
      zoom: 1,
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
      activeTool: 'select',
      canvasBounds,
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
      zoom: 1,
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
      canvasBounds,
      renderedGroupBounds: null,
      renderedSelectedItems: [line],
      renderedSelectionFrame: null,
      selectedRenderedItem: line,
      session: null,
      zoom: 1,
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

  it('derives marquee preview geometry from the full drag rect outside the canvas bounds', () => {
    const derived = buildStageDerivedState({
      canvasBounds,
      renderedGroupBounds: null,
      renderedSelectedItems: [],
      renderedSelectionFrame: null,
      selectedRenderedItem: null,
      session: {
        kind: 'marquee',
        pointerStart: { x: -160, y: 120 },
        currentPointer: { x: 120, y: 260 },
      },
      zoom: 1,
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

    expect(derived.marqueeViewportRect).toEqual({
      left: -160,
      top: 120,
      width: 280,
      height: 140,
    });
  });

  it('hides group interaction hooks when activeTool is not select', () => {
    const first = createRectangleItem({ id: 'first', x: 20, y: 30, width: 80, height: 40 });
    const second = createRectangleItem({ id: 'second', x: 140, y: 60, width: 60, height: 50 });

    const derived = buildStageDerivedState({
      activeTool: 'pan',
      canvasBounds,
      renderedGroupBounds: { x: 20, y: 30, width: 180, height: 80 },
      renderedSelectedItems: [first, second],
      renderedSelectionFrame: { bounds: { x: 20, y: 30, width: 180, height: 80 }, rotation: 0 },
      selectedRenderedItem: first,
      session: null,
      zoom: 1,
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

    expect(derived.showGroupInteractionHooks).toBe(false);
  });

  it('keeps viewport hook handle sizes and rotater offset stable across zoom', () => {
    const rectangle = createRectangleItem({
      x: 20,
      y: 30,
      width: 80,
      height: 40,
      rotation: 0,
    });

    const derived = buildStageDerivedState({
      canvasBounds,
      renderedGroupBounds: null,
      renderedSelectedItems: [rectangle],
      renderedSelectionFrame: null,
      selectedRenderedItem: rectangle,
      session: null,
      zoom: 2,
      viewport: {
        toViewportPoint: (point) => ({ x: point.x * 2, y: point.y * 2 }),
        toViewportRect: (rect) => ({
          left: rect.x * 2,
          top: rect.y * 2,
          width: rect.width * 2,
          height: rect.height * 2,
        }),
      },
    });

    expect(derived.selectedShapeHandleRects?.['middle-right']).toEqual({
      left: 192,
      top: 92,
      width: 16,
      height: 16,
    });
    expect(derived.selectedShapeHandleRects?.rotater).toEqual({
      left: 112,
      top: 2,
      width: 16,
      height: 16,
    });
  });
});
