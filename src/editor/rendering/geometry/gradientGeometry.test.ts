import { describe, expect, it } from 'vitest';

import {
  computeGradientEndpoints,
  computeGradientTextureMatrix,
  mirrorGradientAngleHorizontally,
} from './gradientGeometry';

describe('computeGradientEndpoints', () => {
  it('returns null when the gradient is disabled', () => {
    expect(
      computeGradientEndpoints({ gradientEnabled: false, gradientAngle: 0 }, 100, 40),
    ).toBeNull();
  });

  it('produces a top-to-bottom span at angle 0', () => {
    const e = computeGradientEndpoints({ gradientEnabled: true, gradientAngle: 0 }, 100, 40);
    expect(e).not.toBeNull();
    expect(e!.x0).toBeCloseTo(50, 6);
    expect(e!.y0).toBeCloseTo(0, 6);
    expect(e!.x1).toBeCloseTo(50, 6);
    expect(e!.y1).toBeCloseTo(40, 6);
  });

  it('produces a left-to-right span at angle 90', () => {
    const e = computeGradientEndpoints({ gradientEnabled: true, gradientAngle: 90 }, 100, 40);
    expect(e).not.toBeNull();
    expect(e!.x0).toBeCloseTo(0, 6);
    expect(e!.y0).toBeCloseTo(20, 6);
    expect(e!.x1).toBeCloseTo(100, 6);
    expect(e!.y1).toBeCloseTo(20, 6);
  });
});

describe('mirrorGradientAngleHorizontally', () => {
  it.each([0, 30, 90, 135, 180, -45, -180, 400])(
    'flips the gradient at %d degrees left to right across the middle of its box',
    (angle) => {
      const width = 120;
      const height = 50;
      const before = computeGradientEndpoints({ gradientEnabled: true, gradientAngle: angle }, width, height)!;
      const after = computeGradientEndpoints(
        { gradientEnabled: true, gradientAngle: mirrorGradientAngleHorizontally(angle) },
        width,
        height,
      )!;

      expect(after.x0).toBeCloseTo(width - before.x0, 6);
      expect(after.y0).toBeCloseTo(before.y0, 6);
      expect(after.x1).toBeCloseTo(width - before.x1, 6);
      expect(after.y1).toBeCloseTo(before.y1, 6);
    },
  );

  it('turns left to right into right to left and leaves top to bottom alone', () => {
    expect(mirrorGradientAngleHorizontally(90)).toBe(-90);
    expect(mirrorGradientAngleHorizontally(0)).toBe(0);
  });

  it('gives the original angle back when applied twice', () => {
    expect(mirrorGradientAngleHorizontally(mirrorGradientAngleHorizontally(37))).toBe(37);
  });
});

describe('computeGradientTextureMatrix', () => {
  const TEXTURE_SIZE = 256;
  const apply = (m: ReturnType<typeof computeGradientTextureMatrix>, x: number, y: number) => ({
    x: m.a * x + m.c * y + m.tx,
    y: m.b * x + m.d * y + m.ty,
  });

  // Every quadrant, the axes between them, and angles outside 0..360.
  it.each([0, 30, 45, 90, 120, 135, 180, 210, 225, 270, 300, 315, 360, -45, -135, 495])(
    'lays the strip from the first endpoint to the second at %d degrees',
    (angle) => {
      const endpoints = computeGradientEndpoints({ gradientEnabled: true, gradientAngle: angle }, 200, 100)!;
      const m = computeGradientTextureMatrix(endpoints, TEXTURE_SIZE);

      const first = apply(m, 0, 0);
      const last = apply(m, TEXTURE_SIZE, 0);
      expect(first.x).toBeCloseTo(endpoints.x0, 6);
      expect(first.y).toBeCloseTo(endpoints.y0, 6);
      expect(last.x).toBeCloseTo(endpoints.x1, 6);
      expect(last.y).toBeCloseTo(endpoints.y1, 6);

      // Across the strip is one unit, at right angles to the line, so the
      // colour bands are perpendicular to the gradient direction.
      const across = { x: m.c, y: m.d };
      expect(Math.hypot(across.x, across.y)).toBeCloseTo(1, 6);
      expect(across.x * (endpoints.x1 - endpoints.x0) + across.y * (endpoints.y1 - endpoints.y0)).toBeCloseTo(0, 6);
    },
  );

  it('stays finite for a box with no size', () => {
    const endpoints = computeGradientEndpoints({ gradientEnabled: true, gradientAngle: 45 }, 0, 0)!;
    const m = computeGradientTextureMatrix(endpoints, TEXTURE_SIZE);
    expect(Object.values(m).every(Number.isFinite)).toBe(true);
  });
});
