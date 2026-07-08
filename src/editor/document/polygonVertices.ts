import type { PolygonVertex } from './documentTypes';

/**
 * Pure vertex-list operations for freeform polygon items, shared by the
 * document normalizer, editing interactions, and defaults. Vertices are
 * absolute canvas coordinates, in order; `closed` polygons connect the last
 * vertex back to the first.
 */

// A polygon never drops below a triangle, so deleting a vertex at the floor is
// a no-op.
export const POLYGON_MIN_VERTICES = 3;

export function polygonBounds(vertices: PolygonVertex[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (vertices.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  let minX = vertices[0].x;
  let minY = vertices[0].y;
  let maxX = vertices[0].x;
  let maxY = vertices[0].y;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Number of edges: a closed polygon wraps back to vertex 0, an open chain doesn't. */
export function polygonEdgeCount(vertexCount: number, closed: boolean): number {
  return closed ? vertexCount : Math.max(0, vertexCount - 1);
}

/** Midpoint of the edge from vertex `edgeIndex` to `(edgeIndex + 1) % n`. */
export function polygonEdgeMidpoint(
  vertices: PolygonVertex[],
  edgeIndex: number,
): PolygonVertex {
  const n = vertices.length;
  const a = vertices[edgeIndex % n];
  const b = vertices[(edgeIndex + 1) % n];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Split the edge `edgeIndex -> (edgeIndex + 1) % n` by inserting its midpoint
 * right after `edgeIndex`. Returns a new array; the original is untouched.
 */
export function insertPolygonVertex(
  vertices: PolygonVertex[],
  edgeIndex: number,
): PolygonVertex[] {
  const n = vertices.length;
  if (edgeIndex < 0 || edgeIndex >= n) return vertices;
  const next = vertices.slice();
  next.splice(edgeIndex + 1, 0, polygonEdgeMidpoint(vertices, edgeIndex));
  return next;
}

/** Remove a vertex; a no-op at the 3-vertex floor so a polygon never degenerates. */
export function removePolygonVertex(
  vertices: PolygonVertex[],
  index: number,
): PolygonVertex[] {
  if (vertices.length <= POLYGON_MIN_VERTICES) return vertices;
  if (index < 0 || index >= vertices.length) return vertices;
  const next = vertices.slice();
  next.splice(index, 1);
  return next;
}

/** Axis-aligned rectangle as a 4-vertex ring, clockwise from the top-left. */
export function rectanglePolygonVertices(
  x: number,
  y: number,
  width: number,
  height: number,
): PolygonVertex[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** Translate every vertex by the same delta. */
export function translatePolygonVertices(
  vertices: PolygonVertex[],
  deltaX: number,
  deltaY: number,
): PolygonVertex[] {
  return vertices.map((v) => ({ x: v.x + deltaX, y: v.y + deltaY }));
}
