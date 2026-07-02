import { describe, expect, it } from 'vitest';

import { computeSvgPixelScale } from './svgRasterScale';

function scaleFor(overrides: Partial<Parameters<typeof computeSvgPixelScale>[0]> = {}) {
  return computeSvgPixelScale({
    originalWidth: 100,
    originalHeight: 50,
    presentationWidth: 100,
    presentationHeight: 50,
    zoom: 1,
    devicePixelRatio: 1,
    maxTextureSize: 4096,
    ...overrides,
  });
}

describe('computeSvgPixelScale', () => {
  it('rasterizes at natural size when displayed at natural size', () => {
    expect(scaleFor()).toBe(1);
  });

  it('scales with how far the source is stretched on the canvas', () => {
    expect(scaleFor({ presentationWidth: 400, presentationHeight: 200 })).toBe(4);
  });

  it('uses the more magnified axis for non-uniform stretches', () => {
    expect(scaleFor({ presentationWidth: 100, presentationHeight: 150 })).toBe(4);
  });

  it('quantizes up to the next power of two', () => {
    expect(scaleFor({ presentationWidth: 300, presentationHeight: 150 })).toBe(4);
  });

  it('scales with zoom and devicePixelRatio', () => {
    expect(scaleFor({ zoom: 2, devicePixelRatio: 2 })).toBe(4);
  });

  it('never drops below what a 1x export needs while zoomed out', () => {
    expect(scaleFor({ presentationWidth: 400, presentationHeight: 200, zoom: 0.25 })).toBe(4);
  });

  it('clamps large sources to the GPU texture budget', () => {
    expect(
      scaleFor({
        originalWidth: 2048,
        originalHeight: 2048,
        presentationWidth: 2048,
        presentationHeight: 2048,
        zoom: 4,
      }),
    ).toBe((4096 - 256) / 2048);
  });

  it('lets small sources rasterize at large multiples within the budget', () => {
    expect(
      scaleFor({
        originalWidth: 24,
        originalHeight: 24,
        presentationWidth: 2048,
        presentationHeight: 2048,
      }),
    ).toBe(128);
  });
});
