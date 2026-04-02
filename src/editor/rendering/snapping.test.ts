import { describe, expect, it } from 'vitest';

import { createLineItem, createRectangleItem } from '../document/documentDefaults';
import { getItemAABB } from './selectionGeometry';
import { buildCandidateCache, getItemRect, getResizeSnappedRect, getSnappedRect, isMultipleOf90 } from './snapping';

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

describe('isMultipleOf90', () => {
  it('returns true for exact multiples of 90', () => {
    expect(isMultipleOf90(0)).toBe(true);
    expect(isMultipleOf90(90)).toBe(true);
    expect(isMultipleOf90(180)).toBe(true);
    expect(isMultipleOf90(270)).toBe(true);
    expect(isMultipleOf90(360)).toBe(true);
  });

  it('returns true for negative multiples of 90', () => {
    expect(isMultipleOf90(-90)).toBe(true);
    expect(isMultipleOf90(-180)).toBe(true);
    expect(isMultipleOf90(-270)).toBe(true);
  });

  it('returns false for non-multiples of 90', () => {
    expect(isMultipleOf90(45)).toBe(false);
    expect(isMultipleOf90(30)).toBe(false);
    expect(isMultipleOf90(135)).toBe(false);
    expect(isMultipleOf90(1)).toBe(false);
  });
});

describe('getItemAABB', () => {
  it('returns the same bounds as getRenderBox for an unrotated item', () => {
    const item = createRectangleItem({ x: 100, y: 200, width: 300, height: 150, rotation: 0 });
    const aabb = getItemAABB(item);
    expect(aabb).toEqual({ x: 100, y: 200, width: 300, height: 150 });
  });

  it('returns swapped dimensions for a 90-degree rotated item', () => {
    // A 100x60 rect at (200, 100) rotated 90°:
    // Corners rotate around top-left (200, 100):
    //   (200,100) → (200,100)
    //   (300,100) → (200,200)
    //   (300,160) → (140,200)
    //   (200,160) → (140,100)
    // AABB: x=140, y=100, width=60, height=100
    const item = createRectangleItem({ x: 200, y: 100, width: 100, height: 60, rotation: 90 });
    const aabb = getItemAABB(item);
    expect(aabb.x).toBeCloseTo(140, 5);
    expect(aabb.y).toBeCloseTo(100, 5);
    expect(aabb.width).toBeCloseTo(60, 5);
    expect(aabb.height).toBeCloseTo(100, 5);
  });

  it('returns an expanded AABB for a 45-degree rotated item', () => {
    // A 100x100 square at (0, 0) rotated 45°:
    // The diagonal is 100*sqrt(2) ≈ 141.4
    // The AABB should be larger than the original 100x100
    const item = createRectangleItem({ x: 0, y: 0, width: 100, height: 100, rotation: 45 });
    const aabb = getItemAABB(item);
    // At 45°, a square becomes a diamond; AABB is wider and taller
    expect(aabb.width).toBeGreaterThan(100);
    expect(aabb.height).toBeGreaterThan(100);
    // Both dimensions should be ~141.4 for a square rotated 45°
    expect(aabb.width).toBeCloseTo(141.42, 0);
    expect(aabb.height).toBeCloseTo(141.42, 0);
  });

  it('returns line bounds unchanged (lines have no rotation)', () => {
    const line = createLineItem({ startX: 100, startY: 50, endX: 300, endY: 200 });
    const aabb = getItemAABB(line);
    expect(aabb).toEqual(getItemRect(line));
  });
});

describe('buildCandidateCache with rotated siblings', () => {
  it('uses AABB edges of a rotated sibling as snap candidates', () => {
    const stageRect = { x: 0, y: 0, width: 1024, height: 1024 };
    // A 100x60 rect at (200, 100) rotated 90°
    // AABB: x=140, y=100, w=60, h=100
    const rotatedSibling = createRectangleItem({
      x: 200, y: 100, width: 100, height: 60, rotation: 90,
    });
    const cache = buildCandidateCache([rotatedSibling], stageRect);

    // Vertical candidates should include AABB left (140), center (170), right (200)
    expect(cache.vertical).toContain(512); // stage center
    // Check that the AABB-based values are present (not the unrotated values)
    const aabb = getItemAABB(rotatedSibling);
    expect(cache.vertical).toContainEqual(expect.closeTo(aabb.x, 5));
    expect(cache.vertical).toContainEqual(expect.closeTo(aabb.x + aabb.width / 2, 5));
    expect(cache.vertical).toContainEqual(expect.closeTo(aabb.x + aabb.width, 5));
    expect(cache.horizontal).toContainEqual(expect.closeTo(aabb.y, 5));
    expect(cache.horizontal).toContainEqual(expect.closeTo(aabb.y + aabb.height / 2, 5));
    expect(cache.horizontal).toContainEqual(expect.closeTo(aabb.y + aabb.height, 5));
  });
});
