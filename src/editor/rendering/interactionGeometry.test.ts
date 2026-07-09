import { describe, expect, it } from 'vitest';

import {
  buildCreatedItem,
  getCreatePreview,
  getLineHandleRects,
  getSelectionOutlinePoints,
  getShapeHandleRects,
  getShapeHandlePoints,
  isCreateTool,
  localToStage,
  rotateVector,
  solveDragSession,
  solveLineHandleSession,
  solvePolygonVertexSession,
  solveResizeSession,
  solveRotateSession,
  stageToLocal,
} from './interactionGeometry';
import {
  createImageItem,
  createLineItem,
  createPolygonItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import type { LineCanvasItem } from '../document/documentTypes';

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

  it('scales image source transforms with the resized frame', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 160,
      originalHeight: 90,
      x: 200,
      y: 120,
      width: 160,
      height: 90,
    });
    item.crop = {
      x: 20,
      y: 10,
      width: 100,
      height: 60,
    };
    item.sourceTransform = {
      x: -32,
      y: -15,
      width: 256,
      height: 135,
      rotation: 0,
    };
    const handle = getShapeHandlePoints(item)['bottom-right'];
    const result = solveResizeSession(
      item,
      'bottom-right',
      { x: handle.x + 80, y: handle.y + 30 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 }
    );

    if (result.item.kind !== 'image') {
      throw new Error('Expected image resize result.');
    }

    const scaleX = result.item.width / item.width;
    const scaleY = result.item.height / item.height;
    expect(result.item.sourceTransform.x).toBeCloseTo(item.sourceTransform.x * scaleX, 5);
    expect(result.item.sourceTransform.y).toBeCloseTo(item.sourceTransform.y * scaleY, 5);
    expect(result.item.sourceTransform.width).toBeCloseTo(item.sourceTransform.width * scaleX, 5);
    expect(result.item.sourceTransform.height).toBeCloseTo(item.sourceTransform.height * scaleY, 5);
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

  it('converts between stage and local coordinates for rotated items', () => {
    const origin = { x: 120, y: 80 };
    const local = { x: 40, y: -20 };
    const stagePoint = localToStage(local, origin, 90);

    expect(stagePoint).toEqual({ x: 140, y: 120 });
    const roundTripped = stageToLocal(stagePoint, origin, 90);

    expect(roundTripped.x).toBeCloseTo(local.x, 5);
    expect(roundTripped.y).toBeCloseTo(local.y, 5);
  });

  it('builds handle rects and outlines for rotated shapes and line endpoints', () => {
    const rectangle = createRectangleItem({
      x: 100,
      y: 120,
      width: 80,
      height: 40,
      rotation: 90,
    });
    const line = createLineItem({
      startX: 20,
      startY: 30,
      endX: 120,
      endY: 90,
    });

    const rects = getShapeHandleRects(rectangle);
    const outline = getSelectionOutlinePoints(rectangle);
    const lineRects = getLineHandleRects(line);

    expect(rects['top-left']).toMatchObject({ width: 16, height: 16 });
    expect(outline).toHaveLength(8);
    expect(lineRects.start).toMatchObject({ x: 12, y: 22, width: 16, height: 16 });
    expect(lineRects.end).toMatchObject({ x: 112, y: 82, width: 16, height: 16 });
  });

  it('disables resize snapping for rotated items even when siblings are close', () => {
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
      rotation: 15,
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

    expect(result.guides).toEqual([]);
  });

  it('snaps rotate sessions to 22.5-degree increments when absolute snapping is enabled', () => {
    const item = createRectangleItem({
      x: 200,
      y: 120,
      width: 240,
      height: 120,
      rotation: 8,
    });
    const center = {
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
    };

    const result = solveRotateSession(
      item,
      { x: center.x, y: center.y - 100 },
      { x: center.x + 100, y: center.y - 20 },
      true
    );

    expect(result.item.rotation % 22.5).toBeCloseTo(0, 5);
  });

  it('snaps line handle drags to the anchor axes when close enough', () => {
    const item = createLineItem({
      startX: 100,
      startY: 120,
      endX: 240,
      endY: 260,
    });

    const result = solveLineHandleSession(
      item,
      'end',
      { x: 104, y: 126 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 },
      false
    );

    expect(result.item).toMatchObject({
      endX: 100,
      endY: 120,
    });
    expect(result.guides).toEqual(
      expect.arrayContaining([
        { orientation: 'vertical', position: 100 },
        { orientation: 'horizontal', position: 120 },
      ])
    );
  });

  it('snaps dragged rectangles at wider range when given a larger threshold', () => {
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
    // 12px away from sibling edge — too far for default threshold (8), but within 16
    const result = solveDragSession(
      item,
      { x: 300, y: 180 },
      { x: 588, y: 180 },
      [sibling],
      { x: 0, y: 0, width: 1200, height: 600 },
      true,
      16
    );

    expect(result.item.x).toBeCloseTo(480, 0);
    expect(result.guides).toEqual(
      expect.arrayContaining([{ orientation: 'vertical', position: 480 }])
    );
  });

  it('snaps line handle to anchor axis at wider range when given a larger threshold', () => {
    const item = createLineItem({
      startX: 100,
      startY: 120,
      endX: 240,
      endY: 260,
    });
    // 12px away from anchor Y — too far for default threshold (8), but within 16
    const result = solveLineHandleSession(
      item,
      'end',
      { x: 200, y: 132 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 },
      true,
      16
    );

    expect(result.item).toMatchObject({
      endY: 120,
    });
    expect(result.guides).toEqual(
      expect.arrayContaining([
        { orientation: 'horizontal', position: 120 },
      ])
    );
  });

  it('snaps resize edges for a 90-degree rotated item', () => {
    // 200x100 rect at (300, 200) rotated 90°. At 90°, the local right edge
    // maps to stage horizontal (bottom of AABB at y = origin.y + width = 400).
    // Place sibling with top edge at y=400 so the right handle snaps to it.
    const item = createRectangleItem({ x: 300, y: 200, width: 200, height: 100, rotation: 90 });
    const sibling = createRectangleItem({ x: 480, y: 400, width: 200, height: 100 });
    const stageRect = { x: 0, y: 0, width: 1024, height: 1024 };

    // Pointer: at 90°, stageToLocal({300, 404}, {300,200}, 90) → local {204, 0}.
    // middle-right sets rawEdges.right = 204. Stage value = 200 + 204 = 404.
    // Sibling top is at 400 → 4px away → within threshold 8 → snaps.
    const result = solveResizeSession(
      item,
      'middle-right',
      { x: 300, y: 404 },
      { x: 0, y: 0 },
      [sibling],
      stageRect,
      true,
    );

    expect(result.guides.length).toBeGreaterThan(0);
    expect(result.guides[0].orientation).toBe('horizontal');
    expect(result.guides[0].position).toBe(400);
  });

  it('does not snap resize edges for a 45-degree rotated item', () => {
    const item = createRectangleItem({ x: 300, y: 200, width: 200, height: 100, rotation: 45 });
    const sibling = createRectangleItem({ x: 480, y: 200, width: 200, height: 100 });
    const stageRect = { x: 0, y: 0, width: 1024, height: 1024 };

    const result = solveResizeSession(
      item,
      'middle-right',
      { x: 500, y: 350 },
      { x: 0, y: 0 },
      [sibling],
      stageRect,
      true,
    );

    expect(result.guides).toEqual([]);
  });

  it('preserves aspect ratio on shift+corner resize of rectangle', () => {
    const item = createRectangleItem({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    const handle = getShapeHandlePoints(item)['bottom-right'];
    const result = solveResizeSession(
      item,
      'bottom-right',
      { x: handle.x + 120, y: handle.y + 20 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 },
      true,
      undefined,
      undefined,
      true // shiftConstrain
    );

    expect(result.item.width / result.item.height).toBeCloseTo(2, 5);
    expect(result.item.width).toBeGreaterThan(item.width);
  });

  it('does not constrain on shift+edge resize', () => {
    const item = createRectangleItem({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    const handle = getShapeHandlePoints(item)['middle-right'];
    const result = solveResizeSession(
      item,
      'middle-right',
      { x: handle.x + 80, y: handle.y },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 },
      true,
      undefined,
      undefined,
      true // shiftConstrain
    );

    // Edge handle: width changes freely, height stays the same
    expect(result.item.width).toBeCloseTo(280, 0);
    expect(result.item.height).toBeCloseTo(100, 0);
  });

  it('shift+resize on preserveAspectRatio image gives same result as without shift', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,abc',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      originalWidth: 200,
      originalHeight: 100,
      mimeType: 'image/png',
    });
    const handle = getShapeHandlePoints(item)['bottom-right'];
    const withoutShift = solveResizeSession(
      item,
      'bottom-right',
      { x: handle.x + 120, y: handle.y + 20 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 }
    );
    const withShift = solveResizeSession(
      item,
      'bottom-right',
      { x: handle.x + 120, y: handle.y + 20 },
      { x: 0, y: 0 },
      [],
      { x: 0, y: 0, width: 1200, height: 600 },
      true,
      undefined,
      undefined,
      true // shiftConstrain
    );

    expect(withShift.item.width).toBeCloseTo(withoutShift.item.width, 5);
    expect(withShift.item.height).toBeCloseTo(withoutShift.item.height, 5);
  });

  it('identifies the supported creation tools explicitly', () => {
    expect(isCreateTool('text')).toBe(true);
    expect(isCreateTool('rectangle')).toBe(true);
    expect(isCreateTool('ellipse')).toBe(true);
    expect(isCreateTool('ngon')).toBe(true);
    expect(isCreateTool('line')).toBe(true);
    expect(isCreateTool('select')).toBe(false);
    expect(isCreateTool('pan')).toBe(false);
    expect(isCreateTool('zoom')).toBe(false);
  });

  it('creates an ngon with default sides when dragged out', () => {
    const item = buildCreatedItem('ngon', { x: 100, y: 100 }, { x: 300, y: 250 });

    expect(item).toMatchObject({
      kind: 'ngon',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      sides: 6,
    });
  });

  it('creates a centered default ngon for click-without-drag', () => {
    const item = buildCreatedItem('ngon', { x: 400, y: 240 }, { x: 401, y: 241 });

    expect(item.kind).toBe('ngon');
    expect(item.x + item.width / 2).toBeCloseTo(400, 0);
    expect(item.y + item.height / 2).toBeCloseTo(240, 0);
  });

  it('generates an ngon preview anchored to the drag origin', () => {
    const item = getCreatePreview('ngon', { x: 200, y: 200 }, { x: 350, y: 300 });

    expect(item).toMatchObject({
      kind: 'ngon',
      x: 200,
      y: 200,
      width: 150,
      height: 100,
    });
  });
});

describe('polygon interactions', () => {
  const stageRect = { x: 0, y: 0, width: 2048, height: 2048 };
  const trianglePolygon = () =>
    createPolygonItem({
      vertices: [
        { x: 200, y: 200 },
        { x: 400, y: 200 },
        { x: 300, y: 400 },
      ],
    });

  it('creates a polygon spanning the drag rect as a 4-vertex ring', () => {
    const item = buildCreatedItem('polygon', { x: 300, y: 350 }, { x: 100, y: 150 });

    expect(item).toMatchObject({ kind: 'polygon', x: 100, y: 150, width: 200, height: 200 });
    if (item.kind !== 'polygon') throw new Error('expected polygon');
    expect(item.vertices).toEqual([
      { x: 100, y: 150 },
      { x: 300, y: 150 },
      { x: 300, y: 350 },
      { x: 100, y: 350 },
    ]);
    expect(item.closed).toBe(true);
    expect(item.curveRadius).toBe(0);
  });

  it('creates a centered default polygon for click-without-drag', () => {
    const item = buildCreatedItem('polygon', { x: 500, y: 420 }, { x: 501, y: 421 });

    expect(item.kind).toBe('polygon');
    expect(item.x + item.width / 2).toBeCloseTo(500, 0);
    expect(item.y + item.height / 2).toBeCloseTo(420, 0);
    if (item.kind !== 'polygon') throw new Error('expected polygon');
    expect(item.vertices[0]).toEqual({ x: item.x, y: item.y });
  });

  it('treats the polygon tool as a create tool', () => {
    expect(isCreateTool('polygon')).toBe(true);
  });

  it('translates every vertex and the derived box in a whole-shape drag', () => {
    const item = trianglePolygon();
    const result = solveDragSession(
      item,
      { x: 0, y: 0 },
      { x: 50, y: -25 },
      [],
      stageRect,
      false,
    );

    expect(result.item.kind).toBe('polygon');
    if (result.item.kind !== 'polygon') throw new Error('expected polygon');
    expect(result.item.vertices).toEqual([
      { x: 250, y: 175 },
      { x: 450, y: 175 },
      { x: 350, y: 375 },
    ]);
    expect(result.item).toMatchObject({ x: 250, y: 175, width: 200, height: 200 });
  });

  it('moves a single vertex and re-derives the box in a vertex drag', () => {
    const item = trianglePolygon();
    const result = solvePolygonVertexSession(
      item,
      2,
      { x: 320, y: 500 },
      { x: 0, y: 0 },
      [],
      stageRect,
      false,
    );

    if (result.item.kind !== 'polygon') throw new Error('expected polygon');
    expect(result.item.vertices[2]).toEqual({ x: 320, y: 500 });
    expect(result.item).toMatchObject({ x: 200, y: 200, width: 200, height: 300 });
  });

  it('axis-aligns a dragged vertex to its neighbors when snapping', () => {
    const item = trianglePolygon();
    // 3px off the first vertex's y — inside the snap threshold.
    const result = solvePolygonVertexSession(
      item,
      2,
      { x: 320, y: 203 },
      { x: 0, y: 0 },
      [],
      stageRect,
      true,
    );

    if (result.item.kind !== 'polygon') throw new Error('expected polygon');
    expect(result.item.vertices[2].y).toBe(200);
    expect(result.guides.some((guide) => guide.orientation === 'horizontal' && guide.position === 200)).toBe(true);
  });

  it('leaves the polygon untouched for an out-of-range vertex index', () => {
    const item = trianglePolygon();
    const result = solvePolygonVertexSession(
      item,
      7,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      [],
      stageRect,
      false,
    );

    expect(result.item).toBe(item);
  });

  it('scales every vertex from the old AABB into the resized box on a box resize', () => {
    const item = trianglePolygon(); // AABB (200,200,200,200)
    const handle = getShapeHandlePoints(item)['bottom-right'];
    const result = solveResizeSession(
      item,
      'bottom-right',
      { x: handle.x + 100, y: handle.y + 100 },
      { x: 0, y: 0 },
      [],
      stageRect,
      false,
    );

    if (result.item.kind !== 'polygon') throw new Error('expected polygon');
    // Box grows from 200x200 to 300x300 anchored at (200,200): every vertex
    // scales by 1.5 about that origin.
    expect(result.item.vertices).toEqual([
      { x: 200, y: 200 },
      { x: 500, y: 200 },
      { x: 350, y: 500 },
    ]);
    expect(result.item).toMatchObject({ x: 200, y: 200, width: 300, height: 300 });
    // Polygons never carry rotation — the geometry lives in the vertices.
    expect(result.item.rotation).toBe(0);
  });

  it('spins every vertex around the box center and re-derives the box on a box rotate', () => {
    const item = trianglePolygon(); // AABB center (300,300)
    const center = { x: 300, y: 300 };
    const result = solveRotateSession(
      item,
      { x: center.x, y: center.y - 100 },
      { x: center.x + 100, y: center.y },
    );

    if (result.item.kind !== 'polygon') throw new Error('expected polygon');
    // +90° about (300,300): (x,y) → (cx - (y-cy), cy + (x-cx)).
    expect(result.item.vertices[0].x).toBeCloseTo(400, 5);
    expect(result.item.vertices[0].y).toBeCloseTo(200, 5);
    expect(result.item.vertices[1].x).toBeCloseTo(400, 5);
    expect(result.item.vertices[1].y).toBeCloseTo(400, 5);
    expect(result.item.vertices[2].x).toBeCloseTo(200, 5);
    expect(result.item.vertices[2].y).toBeCloseTo(300, 5);
    // Rotation is baked into the vertices; the item's rotation field stays 0.
    expect(result.item.rotation).toBe(0);
    expect(result.item).toMatchObject({ x: 200, y: 200, width: 200, height: 200 });
  });
});
