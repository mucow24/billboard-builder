import { describe, expect, it } from 'vitest';

import {
  edgeField,
  outlineCoverage,
  outlineCoverageOf,
  outlinedShapeCoverage,
  outlinedShapeCoverageOf,
} from './alphaOutline';

const SIZE = 40;

/** A `SIZE` square image of whatever `alphaAt` says, 0 to 1 per texel. */
function shape(alphaAt: (x: number, y: number) => number): Uint8Array {
  const alpha = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) alpha[y * SIZE + x] = Math.round(255 * alphaAt(x, y));
  }
  return alpha;
}

/** The coverage along row `y`, 0 to 1 per texel. */
function row(coverage: Uint8ClampedArray, y: number): number[] {
  return Array.from(coverage.slice(y * SIZE, (y + 1) * SIZE), (value) => value / 255);
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('outlineCoverage', () => {
  // Texels 10 to 29 across and down: its edges run between texels.
  const square = shape((x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? 1 : 0));

  it('covers nothing without a width or a shape', () => {
    expect(sum(Array.from(outlineCoverage(square, SIZE, SIZE, 0)))).toBe(0);
    expect(sum(Array.from(outlineCoverage(shape(() => 0), SIZE, SIZE, 3)))).toBe(0);
    expect(sum(Array.from(outlineCoverage(shape(() => 1), SIZE, SIZE, 3)))).toBe(0);
  });

  it('is a band of twice the half-width, centred on the edge', () => {
    const across = row(outlineCoverage(square, SIZE, SIZE, 2), 20);
    // The left edge is at 10: texels 8 to 11 are covered, nothing else nearby.
    expect(across.slice(6, 14)).toEqual([0, 0, 1, 1, 1, 1, 0, 0]);
    // And the same on the right edge, at 30.
    expect(across.slice(26, 34)).toEqual([0, 0, 1, 1, 1, 1, 0, 0]);
    // The inside of the shape stays clear.
    expect(sum(across.slice(12, 28))).toBe(0);
  });

  it('follows an edge that runs through texels', () => {
    // The left edge at 10.25: texel 10 is three quarters covered.
    const soft = shape((x, y) => {
      if (y < 10 || y >= 30 || x >= 30) return 0;
      return x > 10 ? 1 : x === 10 ? 0.75 : 0;
    });
    const across = row(outlineCoverage(soft, SIZE, SIZE, 1.5), 20).slice(6, 14);
    // 3 wide from 8.75 to 11.75.
    expect(sum(across)).toBeCloseTo(3, 1);
    expect(across[2]).toBeCloseTo(0.25, 1);
    expect(across[5]).toBeCloseTo(0.75, 1);
  });

  it('rounds the outline at a corner', () => {
    const coverage = outlineCoverage(square, SIZE, SIZE, 4);
    const at = (x: number, y: number) => coverage[y * SIZE + x] / 255;
    // Straight out from the corner texel (10, 10) the band reaches 4 texels.
    expect(at(7, 10)).toBe(1);
    expect(at(5, 10)).toBe(0);
    // Along the diagonal it reaches as far, not to the corner of a square.
    expect(at(8, 8)).toBe(1);
    expect(at(6, 6)).toBe(0);
  });

  it('fills a stem thinner than the outline', () => {
    const stem = shape((x) => (x >= 18 && x < 21 ? 1 : 0));
    const across = row(outlineCoverage(stem, SIZE, SIZE, 3), 20);
    expect(across.slice(15, 24)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(across[14]).toBe(0);
    expect(across[24]).toBe(0);
  });

  // The browser softens the upright edges of glyphs over two texels.
  it('finds an edge that is spread over two texels', () => {
    // The left edge at 10: texel 9 a fifth covered, texel 10 four fifths.
    const soft = shape((x, y) => {
      if (y < 5 || y >= 35 || x >= 30) return 0;
      return x > 10 ? 1 : x === 10 ? 0.8 : x === 9 ? 0.2 : 0;
    });
    const across = row(outlineCoverage(soft, SIZE, SIZE, 2), 20).slice(5, 15);
    // 4 wide from 8 to 12.
    expect(sum(across)).toBeCloseTo(4, 1);
    expect(across.map((value) => Math.round(value))).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('keeps its width along a slanted edge', () => {
    // Everything below the line y = x + 0.5, antialiased as a renderer would.
    const slanted = shape((x, y) => Math.min(1, Math.max(0, (y - x - 0.5) / Math.SQRT2 + 0.5)));
    const coverage = outlineCoverage(slanted, SIZE, SIZE, 2);
    // Across the edge the band is 4 wide: along a row it is that times root two.
    expect(sum(row(coverage, 20))).toBeCloseTo(4 * Math.SQRT2, 0);
  });
});

describe('outlinedShapeCoverage', () => {
  const square = shape((x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? 1 : 0));

  it('is the shape itself without a width', () => {
    expect(Array.from(outlinedShapeCoverage(square, SIZE, SIZE, 0))).toEqual(Array.from(square));
  });

  it('is the shape and its outline in one', () => {
    const across = row(outlinedShapeCoverage(square, SIZE, SIZE, 3), 20);
    // From 7 to 33, whole.
    expect(across.slice(5, 35)).toEqual([0, 0, ...Array.from({ length: 26 }, () => 1), 0, 0]);
  });
});

describe('edgeField', () => {
  const square = shape((x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? 1 : 0));

  it('is nothing for an image without a shape', () => {
    expect(edgeField(shape(() => 0), SIZE, SIZE, 3)).toBeNull();
    expect(sum(Array.from(outlineCoverageOf(null, SIZE * SIZE, 3)))).toBe(0);
    expect(sum(Array.from(outlinedShapeCoverageOf(null, SIZE * SIZE, 3)))).toBe(0);
  });

  it('covers the ink and what an outline can reach, and no more of the image', () => {
    const field = edgeField(square, SIZE, SIZE, 3);
    // The ink is 10 to 29: 3 texels of reach and 2 to spare on every side.
    expect(field).toMatchObject({ left: 5, top: 5, width: 30, height: 30, imageWidth: SIZE, imageHeight: SIZE });
    expect(field?.distances).toHaveLength(30 * 30);
  });

  it('stops at the edges of the image', () => {
    const field = edgeField(square, SIZE, SIZE, 30);
    expect(field).toMatchObject({ left: 0, top: 0, width: SIZE, height: SIZE });
  });

  it('serves the outline and the grown shape alike, at any width up to its reach', () => {
    const field = edgeField(square, SIZE, SIZE, 4);
    for (const halfWidth of [1, 2.5, 4]) {
      expect(Array.from(outlineCoverageOf(field, SIZE * SIZE, halfWidth))).toEqual(
        Array.from(outlineCoverage(square, SIZE, SIZE, halfWidth)),
      );
      expect(Array.from(outlinedShapeCoverageOf(field, SIZE * SIZE, halfWidth))).toEqual(
        Array.from(outlinedShapeCoverage(square, SIZE, SIZE, halfWidth)),
      );
    }
  });

  it('leaves texels beyond its reach out of a narrow outline and inside the grown shape', () => {
    // A block wide enough that its middle is far from every edge.
    const block = shape((x, y) => (x >= 4 && x < 36 && y >= 4 && y < 36 ? 1 : 0));
    const field = edgeField(block, SIZE, SIZE, 2);
    const middle = 20 * SIZE + 20;
    expect(outlineCoverageOf(field, SIZE * SIZE, 2)[middle]).toBe(0);
    expect(outlinedShapeCoverageOf(field, SIZE * SIZE, 2)[middle]).toBe(255);
  });
});
