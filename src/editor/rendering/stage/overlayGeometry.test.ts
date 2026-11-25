import { describe, expect, it } from 'vitest';

import { createRectangleItem } from '../../document/documentDefaults';

import {
  getCanvasOverlayMetrics,
  getHandleFreeCore,
  getShapeOverlayHandlePoints,
  handleTakesPress,
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

  it('leaves every handle whole on a box at least four reaches long each way', () => {
    // 48 x 60 box centred on (100, 100), handles reaching 12.
    const core = getHandleFreeCore({ x: 100, y: 100 }, 48, 60, 0, 12);
    expect(core).toMatchObject({ halfWidth: 12, halfHeight: 18 });

    // middle-right handle at (124, 100): its inner edge only touches the core.
    const middleRight = { x: 124, y: 100 };
    expect(handleTakesPress({ x: -12, y: 0 }, middleRight, 12, core)).toBe(true);
    expect(handleTakesPress({ x: 11.9, y: -12 }, middleRight, 12, core)).toBe(true);
    // Outside the square it never did.
    expect(handleTakesPress({ x: 12, y: 0 }, middleRight, 12, core)).toBe(false);
    expect(handleTakesPress({ x: 0, y: -12.1 }, middleRight, 12, core)).toBe(false);
  });

  it('keeps the middle half of a small box for the item', () => {
    // 8 x 6 box centred on (100, 100): every handle square covers its centre.
    const core = getHandleFreeCore({ x: 100, y: 100 }, 8, 6, 0, 12);
    expect(core).toMatchObject({ halfWidth: 2, halfHeight: 1.5 });

    const middleRight = { x: 104, y: 100 };
    // The box centre and the rest of the core go to the item ...
    expect(handleTakesPress({ x: -4, y: 0 }, middleRight, 12, core)).toBe(false);
    expect(handleTakesPress({ x: -2.5, y: 1 }, middleRight, 12, core)).toBe(false);
    // ... the handle keeps the box's rim and everything outside the box.
    expect(handleTakesPress({ x: -1, y: 0 }, middleRight, 12, core)).toBe(true);
    expect(handleTakesPress({ x: 0, y: 0 }, middleRight, 12, core)).toBe(true);
    expect(handleTakesPress({ x: 11, y: -11 }, middleRight, 12, core)).toBe(true);
    expect(handleTakesPress({ x: -4, y: 2 }, middleRight, 12, core)).toBe(true);
    // Without a core the whole square is the handle's.
    expect(handleTakesPress({ x: -4, y: 0 }, middleRight, 12, null)).toBe(true);
  });

  it('turns the core with the box', () => {
    // 8 x 40 box turned 90 degrees: on screen it is 40 wide and 8 tall.
    const core = getHandleFreeCore({ x: 100, y: 100 }, 8, 40, 90, 12);
    expect(core).toMatchObject({ halfWidth: 2, halfHeight: 10 });

    const above = { x: 100, y: 96 };
    // 9 to the side of the centre along the long screen axis: still core.
    expect(handleTakesPress({ x: 9, y: 4 }, above, 12, core)).toBe(false);
    // 3 above the centre is past the core's short side.
    expect(handleTakesPress({ x: 0, y: 1 }, above, 12, core)).toBe(true);
  });
});
