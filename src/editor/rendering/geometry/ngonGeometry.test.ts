import { describe, expect, it } from 'vitest';

import { computeNgonPoints } from './ngonGeometry';

describe('computeNgonPoints', () => {
  it('returns one point per side', () => {
    expect(computeNgonPoints(100, 100, 3)).toHaveLength(3);
    expect(computeNgonPoints(100, 100, 6)).toHaveLength(6);
  });

  it('normalizes vertices to fill the [0,w] x [0,h] box', () => {
    const pts = computeNgonPoints(120, 80, 5);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(120, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(80, 6);
  });

  it('places an odd polygon apex centered at the top', () => {
    const [apex] = computeNgonPoints(100, 100, 3);
    expect(apex.x).toBeCloseTo(50, 6);
    expect(apex.y).toBeCloseTo(0, 6);
  });
});
