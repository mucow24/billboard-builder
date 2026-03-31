import { describe, expect, it } from 'vitest';

import {
  CANVAS_PRESETS,
  DUPLICATE_ITEM_OFFSET,
  cloneCanvasItem,
  createDefaultProjectDocument,
  createEllipseItem,
  createGeneratorItem,
  createGroupNode,
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
  normalizeZIndices,
  sortByZIndex,
} from './documentDefaults';

describe('document defaults', () => {
  it('creates an empty default project document', () => {
    const document = createDefaultProjectDocument();

    expect(document).toMatchObject({
      version: 2,
      background: '#ffffff00',
      nodes: [],
      fonts: [],
    });
    expect(document.canvas).toEqual({
      width: 2048,
      height: 2048,
      presetId: 'square-lg',
    });
  });

  it('builds the expected default text and shape items', () => {
    const textItem = createTextItem({ x: 12, y: 34 });
    const rectangleItem = createRectangleItem();
    const ellipseItem = createEllipseItem();
    const lineItem = createLineItem();

    expect(textItem.kind).toBe('text');
    expect(textItem.x).toBe(12);
    expect(textItem.y).toBe(34);
    expect(textItem.letterSpacing).toBe(0);
    expect(textItem.verticalAlign).toBe('top');
    expect(textItem.fontWeight).toBe('normal');
    expect(textItem.fill).toBe('#ffffff');
    expect(textItem.secondaryFill).toBe(textItem.fill);
    expect(textItem.gradientEnabled).toBe(false);
    expect(textItem.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(rectangleItem.cornerRadius).toBe(0);
    expect(rectangleItem.secondaryFill).toBe(rectangleItem.fill);
    expect(rectangleItem.gradientEnabled).toBe(false);
    expect(ellipseItem.kind).toBe('ellipse');
    expect(ellipseItem.secondaryFill).toBe(ellipseItem.fill);
    expect(ellipseItem.gradientEnabled).toBe(false);
    expect(lineItem.strokeWidth).toBeGreaterThan(0);
    expect(lineItem.endX).toBeGreaterThan(lineItem.startX);
  });

  it('defaults blurRadius to zero for all item types', () => {
    expect(createTextItem().blurRadius).toBe(0);
    expect(createRectangleItem().blurRadius).toBe(0);
    expect(createEllipseItem().blurRadius).toBe(0);
    expect(createLineItem().blurRadius).toBe(0);
    expect(
      createImageItem({
        src: 'data:image/png;base64,AAA',
        mimeType: 'image/png',
        originalWidth: 40,
        originalHeight: 20,
      }).blurRadius
    ).toBe(0);
  });

  it('derives image size from the source aspect ratio', () => {
    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 400,
      originalHeight: 200,
    });

    expect(imageItem.width).toBe(400);
    expect(imageItem.height).toBe(200);
    expect(imageItem.preserveAspectRatio).toBe(true);
    expect(imageItem.crop).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    });
    expect(imageItem.adjustments).toEqual({
      brightness: 100,
      contrast: 50,
      tintColor: '#ffffff',
      tintStrength: 0,
    });
  });

  it('sorts and normalizes derived z-indices deterministically', () => {
    const first = createRectangleItem({ zIndex: 9 });
    const second = createRectangleItem({ zIndex: 3 });

    const normalized = normalizeZIndices(sortByZIndex([first, second]));

    expect(normalized.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(normalized.map((item) => item.zIndex)).toEqual([0, 1]);
  });

  it('clones regular and line items with a new id and visible offset', () => {
    const rectangleItem = createRectangleItem({ x: 40, y: 60 });
    const clonedRectangle = cloneCanvasItem(rectangleItem);
    const lineItem = createLineItem({
      x: 10,
      y: 20,
      startX: 10,
      startY: 20,
      endX: 110,
      endY: 120,
    });
    const clonedLine = cloneCanvasItem(lineItem);

    expect(clonedRectangle.id).not.toBe(rectangleItem.id);
    expect(clonedRectangle.x).toBe(rectangleItem.x + DUPLICATE_ITEM_OFFSET);
    expect(clonedRectangle.y).toBe(rectangleItem.y + DUPLICATE_ITEM_OFFSET);

    expect(clonedLine.id).not.toBe(lineItem.id);
    expect(clonedLine.x).toBe(lineItem.x + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.y).toBe(lineItem.y + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.kind).toBe('line');
    if (clonedLine.kind !== 'line') {
      throw new Error('Expected a line item clone.');
    }
    expect(clonedLine.startX).toBe(lineItem.startX + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.startY).toBe(lineItem.startY + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.endX).toBe(lineItem.endX + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.endY).toBe(lineItem.endY + DUPLICATE_ITEM_OFFSET);
  });

  it('creates a default group node shell', () => {
    expect(createGroupNode()).toMatchObject({
      kind: 'group',
      name: 'Group',
      opacity: 1,
      children: [],
    });
  });

  it('defines the expected preset sizes', () => {
    expect(CANVAS_PRESETS.map(({ width, height }) => [width, height])).toEqual([
      [2048, 2048],
      [2048, 1024],
      [1024, 2048],
      [1024, 1024],
    ]);
  });

  it('creates scanlines generators with the expected default params', () => {
    const scanlines = createGeneratorItem('scanlines', 1024, 1024);

    expect(scanlines.generatorParams).toEqual({
      generatorType: 'scanlines',
      scanlineColor: '#00000017',
      scanlineHeight: 1,
      scanlineSpacing: 4,
    });
  });
});
