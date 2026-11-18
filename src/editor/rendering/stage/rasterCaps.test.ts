import { describe, expect, it } from 'vitest';

import { clampRasterResolution, clampResolutionToTexelBudget, OUTLINE_TEXEL_BUDGET } from './rasterCaps';

describe('clampRasterResolution', () => {
  it('passes through the requested resolution when itemDim × resolution fits', () => {
    expect(clampRasterResolution(8, 800, 16384)).toBe(8);
    expect(clampRasterResolution(2, 100, 4096)).toBe(2);
  });

  it('caps the resolution so itemDim × resolution stays under maxTextureSize', () => {
    // (16384 - 256) / 800 = 20.16
    expect(clampRasterResolution(40, 800, 16384)).toBeCloseTo(20.16, 2);
  });

  it('floors at a small positive value when the item dimension is huge', () => {
    expect(clampRasterResolution(8, 10_000_000, 16384)).toBeGreaterThan(0);
  });

  it('handles zero/negative dimensions without dividing by zero', () => {
    expect(clampRasterResolution(8, 0, 16384)).toBe(8);
    expect(clampRasterResolution(8, -10, 16384)).toBe(8);
  });
});

describe('clampResolutionToTexelBudget', () => {
  it('passes through the requested resolution while the image fits the budget', () => {
    // 1000 x 250 px at 4 texels per px is 4 million texels.
    expect(clampResolutionToTexelBudget(4, 1000, 250, 4_000_000)).toBe(4);
    expect(clampResolutionToTexelBudget(1, 1000, 250, 4_000_000)).toBe(1);
  });

  it('lowers the resolution so that the image has no more texels than the budget', () => {
    const resolution = clampResolutionToTexelBudget(16, 1000, 250, 4_000_000);
    expect(resolution).toBeCloseTo(4, 6);
    expect(1000 * resolution * 250 * resolution).toBeLessThanOrEqual(4_000_000 * 1.000001);
  });

  it('goes by the area, whatever the shape of the image', () => {
    expect(clampResolutionToTexelBudget(16, 250, 1000, 4_000_000)).toBeCloseTo(4, 6);
    expect(clampResolutionToTexelBudget(16, 500, 500, 4_000_000)).toBeCloseTo(4, 6);
  });

  it('uses the outline budget unless told otherwise', () => {
    const resolution = clampResolutionToTexelBudget(64, 2000, 500);
    expect(2000 * 500 * resolution * resolution).toBeCloseTo(OUTLINE_TEXEL_BUDGET, 0);
  });

  it('handles empty images without dividing by zero', () => {
    expect(clampResolutionToTexelBudget(8, 0, 0)).toBe(8);
  });
});
