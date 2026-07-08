import { describe, expect, it } from 'vitest';

import {
  insertPolygonVertex,
  polygonBounds,
  polygonEdgeCount,
  polygonEdgeMidpoint,
  rectanglePolygonVertices,
  removePolygonVertex,
  translatePolygonVertices,
} from './polygonVertices';

const SQUARE = [
  { x: 10, y: 10 },
  { x: 110, y: 10 },
  { x: 110, y: 110 },
  { x: 10, y: 110 },
];

describe('polygonBounds', () => {
  it('returns the AABB of the vertices', () => {
    expect(polygonBounds(SQUARE)).toEqual({ x: 10, y: 10, width: 100, height: 100 });
  });

  it('floors degenerate dimensions at 1', () => {
    const flat = [
      { x: 0, y: 50 },
      { x: 80, y: 50 },
      { x: 40, y: 50 },
    ];
    expect(polygonBounds(flat)).toEqual({ x: 0, y: 50, width: 80, height: 1 });
  });
});

describe('polygonEdgeCount', () => {
  it('wraps the closing edge only when closed', () => {
    expect(polygonEdgeCount(4, true)).toBe(4);
    expect(polygonEdgeCount(4, false)).toBe(3);
  });
});

describe('polygonEdgeMidpoint', () => {
  it('returns the midpoint of an interior edge', () => {
    expect(polygonEdgeMidpoint(SQUARE, 0)).toEqual({ x: 60, y: 10 });
  });

  it('wraps the last edge back to the first vertex', () => {
    expect(polygonEdgeMidpoint(SQUARE, 3)).toEqual({ x: 10, y: 60 });
  });
});

describe('insertPolygonVertex', () => {
  it('inserts the edge midpoint right after the edge index', () => {
    const next = insertPolygonVertex(SQUARE, 1);
    expect(next).toHaveLength(5);
    expect(next[2]).toEqual({ x: 110, y: 60 });
    expect(next[3]).toEqual(SQUARE[2]);
  });

  it('ignores out-of-range edge indices', () => {
    expect(insertPolygonVertex(SQUARE, -1)).toBe(SQUARE);
    expect(insertPolygonVertex(SQUARE, 4)).toBe(SQUARE);
  });

  it('does not mutate the input', () => {
    insertPolygonVertex(SQUARE, 0);
    expect(SQUARE).toHaveLength(4);
  });
});

describe('removePolygonVertex', () => {
  it('removes the vertex at the index', () => {
    const next = removePolygonVertex(SQUARE, 1);
    expect(next).toEqual([SQUARE[0], SQUARE[2], SQUARE[3]]);
  });

  it('no-ops at the 3-vertex floor', () => {
    const triangle = SQUARE.slice(0, 3);
    expect(removePolygonVertex(triangle, 0)).toBe(triangle);
  });

  it('ignores out-of-range indices', () => {
    expect(removePolygonVertex(SQUARE, 4)).toBe(SQUARE);
  });
});

describe('rectanglePolygonVertices', () => {
  it('builds a clockwise 4-vertex ring from the top-left', () => {
    expect(rectanglePolygonVertices(10, 20, 100, 50)).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]);
  });
});

describe('translatePolygonVertices', () => {
  it('shifts every vertex by the delta', () => {
    expect(translatePolygonVertices(SQUARE, 5, -5)[2]).toEqual({ x: 115, y: 105 });
  });
});
