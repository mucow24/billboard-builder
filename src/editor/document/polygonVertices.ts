import type { PolygonVertex } from './documentTypes';

/**
 * Pure vertex-list operations for freeform polygon items, shared by the
 * document normalizer, editing interactions, and defaults. Vertices are
 * absolute canvas coordinates, in order; `closed` polygons connect the last
 * vertex back to the first. An open polygon is what the app calls a line.
 */

// A closed polygon never drops below a triangle, so deleting a vertex at the
// floor is a no-op.
export const POLYGON_MIN_VERTICES = 3;
// A line never drops below a single segment.
export const LINE_MIN_VERTICES = 2;

/** Fewest vertices the shape can have: 3 closed, 2 open. */
export function polygonMinVertices(closed: boolean): number {
  return closed ? POLYGON_MIN_VERTICES : LINE_MIN_VERTICES;
}

/**
 * A line is an open polygon. Everything that names or labels an item ("Line",
 * its layer icon, its properties) asks this rather than reading `kind`.
 */
export function isLineItem(item: { kind: string; closed?: boolean }): boolean {
  return item.kind === 'polygon' && item.closed === false;
}

/** The kind to show for an item: its `kind`, except that open polygons are 'line'. */
export function getItemDisplayKind<K extends string>(item: {
  kind: K;
  closed?: boolean;
}): K | 'line' {
  return isLineItem(item) ? 'line' : item.kind;
}

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

/**
 * Remove a vertex; a no-op at the floor (3 vertices closed, 2 open) so the
 * shape never degenerates.
 */
export function removePolygonVertex(
  vertices: PolygonVertex[],
  index: number,
  closed = true,
): PolygonVertex[] {
  if (vertices.length <= polygonMinVertices(closed)) return vertices;
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

/**
 * Flip the vertices left to right across the vertical line through the middle
 * of their bounds, so the shape stays where it was. Vertex order (and so every
 * vertex and edge index) is kept; applying it twice gives the original back.
 */
export function mirrorPolygonVerticesHorizontally(vertices: PolygonVertex[]): PolygonVertex[] {
  if (vertices.length === 0) return vertices;
  // The true extent, not polygonBounds: that floors the width at 1, which
  // would shift a sliver narrower than a pixel sideways.
  let minX = vertices[0].x;
  let maxX = vertices[0].x;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
  }
  return vertices.map((v) => ({ x: minX + maxX - v.x, y: v.y }));
}
