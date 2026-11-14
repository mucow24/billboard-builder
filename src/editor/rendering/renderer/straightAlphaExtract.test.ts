import { describe, expect, it } from 'vitest';

import { unpremultiplyAlpha } from './straightAlphaExtract';

describe('unpremultiplyAlpha', () => {
  it('restores the colour of partly transparent pixels', () => {
    // Magenta at alpha 128, 51 and 1, stored premultiplied.
    const pixels = new Uint8ClampedArray([
      128, 0, 128, 128,
      51, 0, 51, 51,
      1, 0, 1, 1,
    ]);
    unpremultiplyAlpha(pixels);
    expect(Array.from(pixels)).toEqual([
      255, 0, 255, 128,
      255, 0, 255, 51,
      255, 0, 255, 1,
    ]);
  });

  it('rounds to the nearest colour value', () => {
    // 100 * 255 / 200 = 127.5, 50 * 255 / 200 = 63.75, 99 * 255 / 200 = 126.2.
    const pixels = new Uint8ClampedArray([100, 50, 99, 200]);
    unpremultiplyAlpha(pixels);
    expect(Array.from(pixels)).toEqual([128, 64, 126, 200]);
  });

  it('leaves opaque and fully transparent pixels alone', () => {
    const pixels = new Uint8ClampedArray([
      12, 34, 56, 255,
      0, 0, 0, 0,
    ]);
    unpremultiplyAlpha(pixels);
    expect(Array.from(pixels)).toEqual([
      12, 34, 56, 255,
      0, 0, 0, 0,
    ]);
  });

  it('caps channels that exceed their alpha', () => {
    // Not valid premultiplied data, but rounding in a filter can produce it.
    const pixels = new Uint8ClampedArray([12, 0, 0, 10]);
    unpremultiplyAlpha(pixels);
    expect(Array.from(pixels)).toEqual([255, 0, 0, 10]);
  });
});
