import { describe, expect, it } from 'vitest';

import { createLineItem, createRectangleItem } from '../model/defaults';
import { getItemRect, getResizeSnappedRect, getSnappedRect } from './snapping';

describe('snapping geometry', () => {
  it('snaps to the stage center when the moving item is close enough', () => {
    const stageRect = { x: 0, y: 0, width: 1200, height: 600 };
    const movingRect = { x: 498, y: 40, width: 200, height: 100 };

    const result = getSnappedRect(movingRect, [], stageRect);

    expect(result.rect.x).toBe(500);
    expect(result.guides).toContainEqual({
      orientation: 'vertical',
      position: 600,
    });
  });

  it('snaps to neighboring item edges for alignment guides', () => {
    const stageRect = { x: 0, y: 0, width: 1200, height: 600 };
    const sibling = createRectangleItem({
      x: 320,
      y: 100,
      width: 200,
      height: 120,
    });
    const movingRect = { x: 116, y: 104, width: 200, height: 120 };

    const result = getSnappedRect(movingRect, [sibling], stageRect);

    expect(result.rect.y).toBe(100);
    expect(result.guides).toContainEqual({
      orientation: 'horizontal',
      position: 100,
    });
  });

  it('snaps to neighboring object centers', () => {
    const stageRect = { x: 0, y: 0, width: 1200, height: 600 };
    const sibling = createRectangleItem({
      x: 320,
      y: 160,
      width: 200,
      height: 120,
    });
    const movingRect = { x: 329, y: 160, width: 180, height: 120 };

    const result = getSnappedRect(movingRect, [sibling], stageRect);

    expect(result.rect.x).toBe(330);
    expect(result.guides).toContainEqual({
      orientation: 'vertical',
      position: 420,
    });
  });

  it('derives line bounds from endpoint geometry', () => {
    const line = createLineItem({
      startX: 400,
      startY: 200,
      endX: 100,
      endY: 80,
    });

    expect(getItemRect(line)).toEqual({
      x: 100,
      y: 80,
      width: 300,
      height: 120,
    });
  });

  it('snaps only the moving top edge during a top-center resize', () => {
    const stageRect = { x: 0, y: 0, width: 1200, height: 600 };
    const sibling = createRectangleItem({
      x: 320,
      y: 180,
      width: 200,
      height: 120,
    });
    const movingRect = { x: 600, y: 186, width: 200, height: 120 };

    const result = getResizeSnappedRect(
      movingRect,
      [sibling],
      stageRect,
      'top-center'
    );

    expect(result.rect).toEqual({
      x: 600,
      y: 180,
      width: 200,
      height: 126,
    });
    expect(result.guides).toContainEqual({
      orientation: 'horizontal',
      position: 180,
    });
  });

  it('ignores non-moving center guides during a top-center resize', () => {
    const stageRect = { x: 0, y: 0, width: 1200, height: 600 };
    const sibling = createRectangleItem({
      x: 320,
      y: 100,
      width: 200,
      height: 120,
    });
    const movingRect = { x: 600, y: 40, width: 200, height: 120 };

    const result = getResizeSnappedRect(
      movingRect,
      [sibling],
      stageRect,
      'top-center'
    );

    expect(result.rect).toEqual(movingRect);
    expect(result.guides).toEqual([]);
  });

  it('keeps the fixed bottom edge pinned when the top edge snaps', () => {
    const stageRect = { x: 0, y: 0, width: 1200, height: 600 };
    const sibling = createRectangleItem({
      x: 320,
      y: 190,
      width: 200,
      height: 120,
    });
    const movingRect = { x: 600, y: 184, width: 200, height: 120 };

    const result = getResizeSnappedRect(
      movingRect,
      [sibling],
      stageRect,
      'top-center'
    );

    expect(result.rect.y).toBe(190);
    expect(result.rect.height).toBe(114);
    expect(result.rect.y + result.rect.height).toBe(
      movingRect.y + movingRect.height
    );
  });

  it('snaps the moving edge after a top-center resize crosses through zero', () => {
    const stageRect = { x: 0, y: 0, width: 1200, height: 600 };
    const sibling = createRectangleItem({
      x: 320,
      y: 330,
      width: 200,
      height: 120,
    });
    const crossedRect = { x: 600, y: 324, width: 200, height: -104 };

    const result = getResizeSnappedRect(
      crossedRect,
      [sibling],
      stageRect,
      'top-center'
    );

    expect(result.rect).toEqual({
      x: 600,
      y: 330,
      width: 200,
      height: -110,
    });
    expect(result.guides).toContainEqual({
      orientation: 'horizontal',
      position: 330,
    });
  });
});
