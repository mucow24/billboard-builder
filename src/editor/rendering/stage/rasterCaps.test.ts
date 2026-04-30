import { describe, expect, it } from 'vitest';

import { clampRasterResolution } from './rasterCaps';

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
