import { describe, expect, it } from 'vitest';

import {
  CANVAS_PRESETS,
  DUPLICATE_ITEM_OFFSET,
  cloneCanvasItem,
  createEllipseItem,
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
  createDefaultProjectDocument,
  normalizeZIndices,
  sortByZIndex,
} from './defaults';

describe('default item factories', () => {
  it('builds the expected default text and shape items', () => {
    const textItem = createTextItem({ x: 12, y: 34 });
    const rectangleItem = createRectangleItem();
    const ellipseItem = createEllipseItem();
    const lineItem = createLineItem();

    expect(textItem.kind).toBe('text');
    expect(textItem.x).toBe(12);
    expect(textItem.y).toBe(34);
    expect(textItem.letterSpacing).toBe(0);
    expect(rectangleItem.cornerRadius).toBeGreaterThan(0);
    expect(ellipseItem.kind).toBe('ellipse');
    expect(lineItem.strokeWidth).toBeGreaterThan(0);
    expect(lineItem.endX).toBeGreaterThan(lineItem.startX);
  });

  it('derives image size from the source aspect ratio', () => {
    const imageItem = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 400,
      originalHeight: 200,
    });

    expect(imageItem.width).toBe(320);
    expect(imageItem.height).toBe(160);
    expect(imageItem.preserveAspectRatio).toBe(true);
  });

  it('reindexes the provided order and can sort by existing z-indices first', () => {
    const first = createRectangleItem({ zIndex: 5 });
    const second = createRectangleItem({ zIndex: 1 });

    const sorted = sortByZIndex([first, second]);
    const normalized = normalizeZIndices(sorted);

    expect(sorted[0].id).toBe(second.id);
    expect(normalized.map((item) => item.zIndex)).toEqual([0, 1]);
  });

  it('starts with a transparent background and the requested canvas presets', () => {
    const document = createDefaultProjectDocument();

    expect(document.background).toBe('#ffffff00');
    expect(CANVAS_PRESETS.map((preset) => [preset.width, preset.height])).toEqual([
      [1024, 1024],
      [1024, 512],
      [512, 1024],
      [512, 512],
    ]);
  });

  it('clones regular and line items with new ids and a visible offset', () => {
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
      throw new Error('Expected a line item clone');
    }
    expect(clonedLine.startX).toBe(lineItem.startX + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.startY).toBe(lineItem.startY + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.endX).toBe(lineItem.endX + DUPLICATE_ITEM_OFFSET);
    expect(clonedLine.endY).toBe(lineItem.endY + DUPLICATE_ITEM_OFFSET);
  });
});
