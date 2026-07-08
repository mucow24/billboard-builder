/**
 * Freeform-polygon path geometry, shared by the PixiJS renderer, the SVG
 * exporter, and hit testing so all of them tessellate a polygon identically.
 *
 * `closed` polygons connect the last vertex back to the first; open ones
 * render the vertex chain as a stroke with no closing edge and no fill.
 * `curveRadius > 0` rounds every corner with a quadratic Bézier whose trim is
 * clamped per-corner to half the shorter adjacent edge, so a large radius
 * never overshoots; open chains round only interior vertices — the endpoints
 * stay exact.
 *
 * Vertex-list editing operations (insert/remove/bounds) live in
 * `src/editor/document/polygonVertices.ts` with the document model.
 */
import type { PolygonVertex } from '../../document/documentTypes';
import { polygonEdgeCount } from '../../document/polygonVertices';

// Edges shorter than this collapse the corner-trim math (division by ~0), so
// path building falls back to straight segments.
const DEGENERATE_EDGE_EPS = 1e-6;

export type PolygonPathSegment =
  | { type: 'move'; x: number; y: number }
  | { type: 'line'; x: number; y: number }
  | { type: 'quad'; cx: number; cy: number; x: number; y: number }
  | { type: 'close' };

/**
 * Path segments for a polygon. Radius 0 yields straight `move`/`line` segments
 * (plus `close` for closed polygons); radius > 0 replaces each rounded corner
 * with `line` to the incoming trim point and `quad` through the vertex to the
 * outgoing trim point. Any degenerate edge disables rounding for the whole
 * shape (the trim math would divide by ~0).
 */
export function buildPolygonPathSegments(
  vertices: PolygonVertex[],
  curveRadius: number,
  closed: boolean,
): PolygonPathSegment[] {
  const n = vertices.length;
  if (n < 2) return [];

  const rounded =
    curveRadius > 0 && n > 2 && !hasDegenerateEdge(vertices, closed);

  if (!rounded) {
    const segments: PolygonPathSegment[] = [
      { type: 'move', x: vertices[0].x, y: vertices[0].y },
    ];
    for (let i = 1; i < n; i++) {
      segments.push({ type: 'line', x: vertices[i].x, y: vertices[i].y });
    }
    if (closed) segments.push({ type: 'close' });
    return segments;
  }

  if (!closed) {
    // Open chain: endpoints stay exact; only interior vertices round.
    const segments: PolygonPathSegment[] = [
      { type: 'move', x: vertices[0].x, y: vertices[0].y },
    ];
    for (let i = 1; i < n - 1; i++) {
      const { q1, q2 } = cornerTrimPoints(
        vertices[i - 1],
        vertices[i],
        vertices[i + 1],
        curveRadius,
      );
      segments.push({ type: 'line', x: q1.x, y: q1.y });
      segments.push({ type: 'quad', cx: vertices[i].x, cy: vertices[i].y, x: q2.x, y: q2.y });
    }
    segments.push({ type: 'line', x: vertices[n - 1].x, y: vertices[n - 1].y });
    return segments;
  }

  // Closed: every corner rounds; the path starts at vertex 0's incoming trim
  // point so each iteration emits "line to trim-in, curve through vertex to
  // trim-out".
  const segments: PolygonPathSegment[] = [];
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i + n - 1) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    const { q1, q2 } = cornerTrimPoints(prev, curr, next, curveRadius);
    segments.push(
      i === 0
        ? { type: 'move', x: q1.x, y: q1.y }
        : { type: 'line', x: q1.x, y: q1.y },
    );
    segments.push({ type: 'quad', cx: curr.x, cy: curr.y, x: q2.x, y: q2.y });
  }
  segments.push({ type: 'close' });
  return segments;
}

function hasDegenerateEdge(vertices: PolygonVertex[], wrap: boolean): boolean {
  const last = wrap ? vertices.length : vertices.length - 1;
  for (let i = 0; i < last; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < DEGENERATE_EDGE_EPS) return true;
  }
  return false;
}

/**
 * The two trim points of a rounded corner at `curr`: q1 sits on the incoming
 * edge, q2 on the outgoing edge, each pulled back by the radius clamped to
 * half its edge so adjacent corners never overshoot each other.
 */
function cornerTrimPoints(
  prev: PolygonVertex,
  curr: PolygonVertex,
  next: PolygonVertex,
  radius: number,
): { q1: PolygonVertex; q2: PolygonVertex } {
  const inDx = curr.x - prev.x;
  const inDy = curr.y - prev.y;
  const inLen = Math.hypot(inDx, inDy);
  const outDx = next.x - curr.x;
  const outDy = next.y - curr.y;
  const outLen = Math.hypot(outDx, outDy);

  const inTrim = Math.min(radius, inLen / 2);
  const outTrim = Math.min(radius, outLen / 2);

  return {
    q1: { x: curr.x - (inDx / inLen) * inTrim, y: curr.y - (inDy / inLen) * inTrim },
    q2: { x: curr.x + (outDx / outLen) * outTrim, y: curr.y + (outDy / outLen) * outTrim },
  };
}

/** Even-odd point-in-polygon test against the straight-edged vertex ring. */
export function pointInPolygonVertices(
  point: PolygonVertex,
  vertices: PolygonVertex[],
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x <
        ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Minimum distance from `point` to the polygon's edges (chain edges only when open). */
export function distanceToPolygonEdges(
  point: PolygonVertex,
  vertices: PolygonVertex[],
  closed: boolean,
): number {
  const edges = polygonEdgeCount(vertices.length, closed);
  let best = Infinity;
  for (let i = 0; i < edges; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}

function distanceToSegment(
  p: PolygonVertex,
  a: PolygonVertex,
  b: PolygonVertex,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
