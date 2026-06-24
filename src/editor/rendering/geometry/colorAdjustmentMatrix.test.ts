import { describe, expect, it } from 'vitest';

import {
  IDENTITY_COLOR_MATRIX,
  brightnessContrastMatrix,
  tintMatrix,
} from './colorAdjustmentMatrix';

describe('brightnessContrastMatrix', () => {
  it('returns null when there is nothing to adjust', () => {
    expect(brightnessContrastMatrix(0, 0)).toBeNull();
  });

  it('applies brightness as an offset with a unit factor when contrast is 0', () => {
    const m = brightnessContrastMatrix(0.2, 0)!;
    // diagonal RGB factor stays 1
    expect(m[0]).toBeCloseTo(1, 6);
    expect(m[6]).toBeCloseTo(1, 6);
    expect(m[12]).toBeCloseTo(1, 6);
    // RGB offset column == brightness
    expect(m[4]).toBeCloseTo(0.2, 6);
    expect(m[9]).toBeCloseTo(0.2, 6);
    expect(m[14]).toBeCloseTo(0.2, 6);
    // alpha row untouched
    expect(m[18]).toBeCloseTo(1, 6);
  });

  it('scales around the 0.5 midpoint for contrast', () => {
    const m = brightnessContrastMatrix(0, 100)!;
    const factor = ((100 + 100) / 100) ** 2; // 4
    expect(m[0]).toBeCloseTo(factor, 6);
    expect(m[4]).toBeCloseTo(0.5 * (1 - factor), 6); // -1.5
  });
});

describe('tintMatrix', () => {
  it('returns null when tint is fully transparent', () => {
    expect(tintMatrix(255, 0, 0, 0)).toBeNull();
  });

  it('blends each channel toward the tint color by alpha', () => {
    const m = tintMatrix(255, 0, 0, 0.5)!;
    expect(m[0]).toBeCloseTo(0.5, 6); // 1 - a
    expect(m[4]).toBeCloseTo(0.5, 6); // r/255 * a
    expect(m[6]).toBeCloseTo(0.5, 6);
    expect(m[9]).toBeCloseTo(0, 6); // g/255 * a
    expect(m[12]).toBeCloseTo(0.5, 6);
    expect(m[14]).toBeCloseTo(0, 6); // b/255 * a
    expect(m[18]).toBeCloseTo(1, 6);
  });
});

describe('IDENTITY_COLOR_MATRIX', () => {
  it('is a 4x5 row-major identity', () => {
    expect(IDENTITY_COLOR_MATRIX).toEqual([
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  });
});
