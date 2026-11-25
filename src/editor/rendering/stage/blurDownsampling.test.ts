import { describe, expect, it } from 'vitest';

import { blurHalvings, gaussianBlurResolution } from './blurDownsampling';

describe('blurHalvings', () => {
  it('is 0 while halving once would leave fewer texels than are kept', () => {
    expect(blurHalvings(1, 0, 8)).toBe(0);
    expect(blurHalvings(1, 15.9, 8)).toBe(0);
    expect(blurHalvings(1, Number.NaN, 8)).toBe(0);
    expect(blurHalvings(0, 100, 8)).toBe(0);
  });

  it('halves for as long as the texels kept are left across the strength', () => {
    expect(blurHalvings(1, 16, 8)).toBe(1);
    expect(blurHalvings(1, 31.9, 8)).toBe(1);
    expect(blurHalvings(1, 32, 8)).toBe(2);
    expect(blurHalvings(1, 1000, 8)).toBe(6);
  });

  it('counts texels: a finer texture is halved more often, a stricter count less', () => {
    expect(blurHalvings(2, 16, 8)).toBe(2);
    expect(blurHalvings(0.5, 16, 8)).toBe(0);
    expect(blurHalvings(1, 64, 8)).toBe(3);
    expect(blurHalvings(1, 64, 32)).toBe(1);
  });
});

describe('gaussianBlurResolution', () => {
  it('keeps the resolution of the surface for a blur under 128 texels', () => {
    expect(gaussianBlurResolution(1, 0)).toBe(1);
    expect(gaussianBlurResolution(1, 100)).toBe(1);
    expect(gaussianBlurResolution(1.5, 85)).toBe(1.5);
    expect(gaussianBlurResolution(2, 63)).toBe(2);
  });

  it('halves the resolution while 64 texels are left across the strength', () => {
    expect(gaussianBlurResolution(1, 128)).toBe(0.5);
    expect(gaussianBlurResolution(1, 255)).toBe(0.5);
    expect(gaussianBlurResolution(1, 256)).toBe(0.25);
    // A blur radius of 100 at 200% on a screen with a device pixel ratio of 1.5.
    expect(gaussianBlurResolution(1.5, 200)).toBe(0.375);
  });

  it('leaves at least 64 texels across the strength, and fewer than 128 once it halves', () => {
    for (const resolution of [1, 1.25, 1.5, 2]) {
      for (const strength of [130, 200, 333, 800, 1600]) {
        const texels = strength * gaussianBlurResolution(resolution, strength);
        expect(texels).toBeGreaterThanOrEqual(64);
        expect(texels).toBeLessThan(128);
      }
    }
  });
});
