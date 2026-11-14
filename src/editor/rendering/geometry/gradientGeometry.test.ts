import { describe, expect, it } from 'vitest';

import { computeGradientEndpoints, mirrorGradientAngleHorizontally } from './gradientGeometry';

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
