import { describe, expect, it } from 'vitest';

import { computeGradientEndpoints } from './gradientGeometry';

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
