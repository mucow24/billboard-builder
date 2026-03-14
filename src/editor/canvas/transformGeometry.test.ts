import { describe, expect, it } from 'vitest';

import {
  applyPreviewToItem,
  buildTransformCommit,
  getRenderBox,
} from './transformGeometry';
import { createEllipseItem, createRectangleItem, createTextItem } from '../model/defaults';

describe('transform geometry helpers', () => {
  it('normalizes a transformer snapshot into a persisted commit', () => {
    expect(
      buildTransformCommit(
        {
          x: 120,
          y: 80,
          width: 240,
          height: 100,
        },
        {
          x: 180,
          y: 90,
          width: 240,
          height: 100,
          scaleX: 1.5,
          scaleY: 0.5,
          rotation: 135,
        }
      )
    ).toEqual({
      x: 180,
      y: 90,
      width: 360,
      height: 50,
      rotation: 135,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('applies local preview geometry without mutating unrelated item fields', () => {
    const item = createTextItem({ text: 'Hello there' });

    expect(
      applyPreviewToItem(item, {
        itemId: item.id,
        x: 10,
        y: 20,
        width: 180,
        height: 140,
        rotation: 25,
      })
    ).toMatchObject({
      id: item.id,
      text: 'Hello there',
      x: 10,
      y: 20,
      width: 180,
      height: 140,
      rotation: 25,
    });
  });

  it('derives a top-left render box for ellipse and rectangle items', () => {
    const rectangle = createRectangleItem({ x: 100, y: 200, width: 240, height: 80 });
    const ellipse = createEllipseItem({ x: 100, y: 200, width: 240, height: 80 });

    expect(getRenderBox(rectangle)).toEqual({
      x: 100,
      y: 200,
      width: 240,
      height: 80,
    });
    expect(getRenderBox(ellipse)).toEqual({
      x: 100,
      y: 200,
      width: 240,
      height: 80,
    });
  });
});
