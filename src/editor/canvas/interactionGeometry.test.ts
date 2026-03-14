import { describe, expect, it } from 'vitest';

import {
  buildCreatedItem,
  getCreatePreview,
  getShapeHandlePoints,
  rotateVector,
  solveDragSession,
  solveLineHandleSession,
  solveResizeSession,
  solveRotateSession,
} from './interactionGeometry';
import {
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../model/defaults';
import type { LineCanvasItem } from '../model/types';

describe('interaction geometry', () => {
  it('creates normalized rectangle bounds regardless of drag direction', () => {
    const item = buildCreatedItem('rectangle', { x: 320, y: 240 }, { x: 120, y: 140 });

    expect(item).toMatchObject({
      kind: 'rectangle',
      x: 120,
      y: 140,
      width: 200,
      height: 100,
    });
  });

  it('creates a centered default item for click-without-drag', () => {
    const item = buildCreatedItem('text', { x: 400, y: 240 }, { x: 401, y: 241 });

    expect(item.kind).toBe('text');
    expect(item.x + item.width / 2).toBeCloseTo(400, 0);
    expect(item.y + item.height / 2).toBeCloseTo(240, 0);
  });

  it('keeps the create preview anchored to the drag origin before click fallback applies', () => {
    const item = getCreatePreview('rectangle', { x: 400, y: 240 }, { x: 402, y: 242 });

    expect(item).toMatchObject({
      kind: 'rectangle',
      x: 400,
      y: 240,
      width: 2,
      height: 2,
    });
  });

  it('keeps the fixed bottom edge pinned while top-center resize crosses through zero', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const handle = getShapeHandlePoints(item)['top-center'];
    const result = solveResizeSession(
      item,
      'top-center',
      { x: handle.x, y: item.y + item.height + 60 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    expect(result.item.y).toBeCloseTo(240, 0);
    expect(result.item.height).toBeCloseTo(60, 0);
    expect(result.item.y + result.item.height).toBeCloseTo(300, 0);
  });

  it('keeps the fixed right edge pinned while middle-left resize crosses through zero', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const handle = getShapeHandlePoints(item)['middle-left'];
    const result = solveResizeSession(
      item,
      'middle-left',
      { x: item.x + item.width + 80, y: handle.y },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    expect(result.item.x).toBeCloseTo(440, 0);
    expect(result.item.width).toBeCloseTo(80, 0);
    expect(result.item.x + result.item.width).toBeCloseTo(520, 0);
  });

  it('snaps only the dragged edge during top-center resize', () => {
    const sibling = createRectangleItem({
      x: 320,
      y: 188,
      width: 200,
      height: 120,
    });
    const item = createRectangleItem({
      x: 600,
      y: 184,
      width: 200,
      height: 120,
    });
    const handle = getShapeHandlePoints(item)['top-center'];

    const result = solveResizeSession(
      item,
      'top-center',
      { x: handle.x, y: 190 },
      { x: 0, y: 0 },
      [sibling],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    expect(result.item.y).toBe(188);
    expect(result.item.y + result.item.height).toBe(304);
  });

  it('preserves image aspect ratio on bottom-right resize', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 800,
      originalHeight: 400,
      x: 200,
      y: 120,
      width: 320,
      height: 160,
    });
    const handle = getShapeHandlePoints(item)['bottom-right'];
    const result = solveResizeSession(
      item,
      'bottom-right',
      { x: handle.x + 120, y: handle.y + 20 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    expect(result.item.width / result.item.height).toBeCloseTo(2, 5);
    expect(result.item.width).toBeGreaterThan(item.width);
  });

  it('grows text height when a live resize narrows the text box', () => {
    const item = createTextItem({
      x: 200,
      y: 120,
      width: 320,
      height: 96,
      text: 'One two three four five six seven eight nine ten eleven twelve.',
    });
    const handle = getShapeHandlePoints(item)['middle-right'];
    const result = solveResizeSession(
      item,
      'middle-right',
      { x: handle.x - 120, y: handle.y },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    expect(result.item.width).toBeCloseTo(200, 0);
    expect(result.item.height).toBeGreaterThan(item.height);
  });

  it('keeps the center stable while rotating', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const center = {
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
    };
    const startPointer = { x: center.x, y: center.y - 100 };
    const currentPointer = { x: center.x + 100, y: center.y };
    const result = solveRotateSession(item, startPointer, currentPointer);
    const rotatedCenter = rotateVector(
      { x: result.item.width / 2, y: result.item.height / 2 },
      result.item.rotation
    );

    expect(result.item.rotation).toBeCloseTo(90, 0);
    expect(result.item.x + rotatedCenter.x).toBeCloseTo(center.x, 0);
    expect(result.item.y + rotatedCenter.y).toBeCloseTo(center.y, 0);
  });

  it('updates only the dragged line endpoint', () => {
    const item = createLineItem({
      startX: 160,
      startY: 160,
      endX: 400,
      endY: 184,
    });
    const result = solveLineHandleSession(
      item,
      'start',
      { x: 240, y: 200 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    const line = result.item as LineCanvasItem;

    expect(line.startX).toBe(240);
    expect(line.startY).toBe(200);
    expect(line.endX).toBe(400);
    expect(line.endY).toBe(184);
  });

  it('snaps dragged rectangles against sibling guides during drag', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
    });
    const sibling = createRectangleItem({
      x: 480,
      y: 120,
      width: 240,
      height: 120,
    });
    const result = solveDragSession(
      item,
      { x: 300, y: 180 },
      { x: 584, y: 180 },
      [sibling],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    expect(result.item.x).toBeCloseTo(480, 0);
    expect(result.guides).toEqual(
      expect.arrayContaining([{ orientation: 'vertical', position: 480 }])
    );
  });
});
