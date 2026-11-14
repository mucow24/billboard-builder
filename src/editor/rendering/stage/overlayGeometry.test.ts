import { describe, expect, it } from 'vitest';

import { createRectangleItem } from '../../document/documentDefaults';

import {
  getCanvasOverlayMetrics,
  getShapeOverlayHandlePoints,
  getViewportHandleRect,
  showsEdgeAddHandle,
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
      guideDash: [4, 2],
      guideStrokeWidth: 0.5,
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

  it('shows the edge "+" from 42 screen px on a polygon and from 72 on a line', () => {
    // Closed polygon: the body is the interior, so the "+" only has to fit.
    expect(showsEdgeAddHandle(41, 1, true)).toBe(false);
    expect(showsEdgeAddHandle(42, 1, true)).toBe(true);
    // A line's body is the segment, so the "+" must leave room to grab it.
    expect(showsEdgeAddHandle(71, 1, false)).toBe(false);
    expect(showsEdgeAddHandle(72, 1, false)).toBe(true);
    // The length that counts is the one on screen.
    expect(showsEdgeAddHandle(200, 0.25, false)).toBe(false);
    expect(showsEdgeAddHandle(200, 0.5, false)).toBe(true);
    expect(showsEdgeAddHandle(30, 3, false)).toBe(true);
  });
});
