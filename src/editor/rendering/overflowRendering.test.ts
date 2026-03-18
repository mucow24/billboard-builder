import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createLineItem, createRectangleItem } from '../document/documentDefaults';
import { doesRenderBoxOverflowCanvas, getOverflowClipRects, getOverflowRenderableItems } from './overflowRendering';
import { getRenderBox } from './transformGeometry';

describe('overflowRendering', () => {
  const canvasBox = { x: 0, y: 0, width: 1024, height: 1024 };

  it('detects whether a render box extends beyond the canvas', () => {
    expect(doesRenderBoxOverflowCanvas({ x: 40, y: 40, width: 100, height: 100 }, canvasBox)).toBe(false);
    expect(doesRenderBoxOverflowCanvas({ x: -1, y: 40, width: 100, height: 100 }, canvasBox)).toBe(true);
    expect(doesRenderBoxOverflowCanvas({ x: 40, y: -1, width: 100, height: 100 }, canvasBox)).toBe(true);
    expect(doesRenderBoxOverflowCanvas({ x: 980, y: 40, width: 80, height: 100 }, canvasBox)).toBe(true);
    expect(doesRenderBoxOverflowCanvas({ x: 40, y: 980, width: 100, height: 80 }, canvasBox)).toBe(true);
  });

  it('returns only visible items whose render boxes overflow the canvas', () => {
    const inside = createRectangleItem({ x: 100, y: 100, width: 200, height: 200 });
    const leftOverflow = createRectangleItem({ x: -20, y: 100, width: 200, height: 200 });
    const hiddenOverflow = createRectangleItem({ x: -20, y: 100, width: 200, height: 200, hidden: true });
    const lineOverflow = createLineItem({ startX: 900, startY: 200, endX: 1100, endY: 260 });

    expect(getOverflowRenderableItems([inside, leftOverflow, hiddenOverflow, lineOverflow], canvasBox)).toEqual([
      leftOverflow,
      lineOverflow,
    ]);
    expect(getRenderBox(lineOverflow).x).toBe(900);
  });

  it('builds top, bottom, left, and right clip rects around the canvas', () => {
    const workspaceBox = { x: -3000, y: -3000, width: 6000, height: 6000 };

    expect(getOverflowClipRects(canvasBox, workspaceBox)).toEqual([
      { x: -3000, y: -3000, width: 6000, height: 3000 },
      { x: -3000, y: 1024, width: 6000, height: 1976 },
      { x: -3000, y: 0, width: 3000, height: 1024 },
      { x: 1024, y: 0, width: 1976, height: 1024 },
    ]);
  });

  it('matches the default document canvas bounds cleanly', () => {
    const document = createDefaultProjectDocument();
    expect(canvasBox).toEqual({
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
    });
  });
});
