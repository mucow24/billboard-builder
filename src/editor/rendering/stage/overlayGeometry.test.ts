import { describe, expect, it } from 'vitest';

import { createRectangleItem } from '../../document/documentDefaults';

import {
  getCanvasOverlayMetrics,
  getShapeOverlayHandlePoints,
  getViewportHandleRect,
} from './overlayGeometry';

describe('overlayGeometry', () => {
  it('scales overlay metrics inversely to zoom so viewport sizing stays fixed', () => {
    expect(getCanvasOverlayMetrics(2)).toMatchObject({
      cropCornerLength: 12,
      cropHandleHitSize: 12,
      cropHandleStrokeWidth: 4,
      cropHandleUnderlayWidth: 6.5,
      cropOutlineStrokeWidth: 3,
      cropOutlineUnderlayWidth: 5,
      fullHandleRadius: 4,
      handleRadius: 4,
      handleStrokeWidth: 1,
      lineSelectionHitStrokeWidth: 12,
      lineSelectionStrokeWidth: 9,
      rotateHandleOffset: 25,
      selectionDash: [4, 2],
      selectionStrokeWidth: 1,
    });
  });

  it('positions the rotater with an inverse-zoom canvas offset', () => {
    const item = createRectangleItem({
      x: 20,
      y: 30,
      width: 80,
      height: 40,
      rotation: 0,
    });

    expect(getShapeOverlayHandlePoints(item, 2).rotater).toEqual({ x: 60, y: 5 });
  });

  it('builds fixed-size viewport handle rects around viewport points', () => {
    expect(getViewportHandleRect({ x: 80, y: 120 })).toEqual({
      left: 72,
      top: 112,
      width: 16,
      height: 16,
    });
  });
});
