import { describe, expect, it } from 'vitest';

import {
  buildPolygonPathSegments,
  distanceToPolygonEdges,
  pointInPolygonVertices,
  type PolygonPathSegment,
} from './polygonGeometry';

const SQUARE = [
  { x: 10, y: 10 },
  { x: 110, y: 10 },
  { x: 110, y: 110 },
  { x: 10, y: 110 },
];

describe('buildPolygonPathSegments', () => {
  it('emits straight segments with a close for radius 0', () => {
    const segments = buildPolygonPathSegments(SQUARE, 0, true);
    expect(segments).toEqual([
      { type: 'move', x: 10, y: 10 },
      { type: 'line', x: 110, y: 10 },
      { type: 'line', x: 110, y: 110 },
      { type: 'line', x: 10, y: 110 },
      { type: 'close' },
    ]);
  });

  it('omits the close for an open chain', () => {
    const segments = buildPolygonPathSegments(SQUARE, 0, false);
    expect(segments.at(-1)).toEqual({ type: 'line', x: 10, y: 110 });
    expect(segments.some((s) => s.type === 'close')).toBe(false);
  });

  it('rounds every corner of a closed polygon with quadratic curves', () => {
    const segments = buildPolygonPathSegments(SQUARE, 20, true);
    const quads = segments.filter((s) => s.type === 'quad');
    expect(quads).toHaveLength(4);
    // First corner: path starts at the incoming trim point of vertex 0
    // (20 units back along the closing edge) and curves through the vertex.
    expect(segments[0]).toEqual({ type: 'move', x: 10, y: 30 });
    expect(segments[1]).toEqual({ type: 'quad', cx: 10, cy: 10, x: 30, y: 10 });
    expect(segments.at(-1)).toEqual({ type: 'close' });
  });

  it('clamps the trim to half the shorter adjacent edge', () => {
    const segments = buildPolygonPathSegments(SQUARE, 500, true);
    // Trim clamps to 50 (half of the 100-unit edges): vertex 0's incoming trim
    // point is the closing edge's midpoint.
    expect(segments[0]).toEqual({ type: 'move', x: 10, y: 60 });
  });

  it('keeps open-chain endpoints exact and rounds only interior vertices', () => {
    const segments = buildPolygonPathSegments(SQUARE, 20, false);
    expect(segments[0]).toEqual({ type: 'move', x: 10, y: 10 });
    expect(segments.at(-1)).toEqual({ type: 'line', x: 10, y: 110 });
    expect(segments.filter((s) => s.type === 'quad')).toHaveLength(2);
  });

  it('falls back to straight segments when an edge is degenerate', () => {
    const degenerate = [...SQUARE, { x: 10, y: 110 }];
    const segments = buildPolygonPathSegments(degenerate, 20, true);
    expect(segments.some((s) => s.type === 'quad')).toBe(false);
  });

  it('returns no segments for fewer than 2 vertices', () => {
    expect(buildPolygonPathSegments([{ x: 0, y: 0 }], 0, true)).toEqual([]);
  });
});

describe('pointInPolygonVertices', () => {
  it('detects interior and exterior points', () => {
    expect(pointInPolygonVertices({ x: 60, y: 60 }, SQUARE)).toBe(true);
    expect(pointInPolygonVertices({ x: 200, y: 60 }, SQUARE)).toBe(false);
  });

  it('handles concave shapes', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 50, y: 50 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygonVertices({ x: 50, y: 80 }, concave)).toBe(false);
    expect(pointInPolygonVertices({ x: 10, y: 80 }, concave)).toBe(true);
  });
});

describe('distanceToPolygonEdges', () => {
  it('measures distance to the nearest edge', () => {
    expect(distanceToPolygonEdges({ x: 60, y: 0 }, SQUARE, true)).toBe(10);
  });

  it('excludes the closing edge for open chains', () => {
    // Point next to the closing edge (x = 10): far from the open chain's edges.
    const p = { x: 0, y: 60 };
    expect(distanceToPolygonEdges(p, SQUARE, true)).toBe(10);
    expect(distanceToPolygonEdges(p, SQUARE, false)).toBeCloseTo(
      Math.hypot(10, 50),
      6,
    );
  });
});

// Type-only assertion that the segment union stays narrow enough for exhaustive
// switches in the renderer/exporter.
const _exhaustive = (s: PolygonPathSegment): string => s.type;
void _exhaustive;
