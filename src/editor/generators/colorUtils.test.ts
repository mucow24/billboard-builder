import { describe, expect, it } from 'vitest';

import { mixColor, rgba, splitColorAlpha } from './colorUtils';

describe('generator colorUtils', () => {
  it('multiplies embedded alpha with the explicit rgba alpha', () => {
    expect(rgba('#ff0000ff', 0.65)).toBe('rgba(255, 0, 0, 0.65)');
    expect(rgba('#ff000080', 0.5)).toBe('rgba(255, 0, 0, 0.251)');
  });

  it('mixes opaque colors and preserves opaque output', () => {
    expect(mixColor('#0000ffff', '#ff0000ff', 1)).toBe('rgba(255, 0, 0, 1)');
  });

  it('interpolates embedded alpha for midpoint translucent mixes', () => {
    expect(mixColor('#0000ff00', '#ff0000ff', 0.5)).toBe(
      'rgba(128, 0, 128, 0.5)',
    );
  });

  it('clamps out-of-range mix factors', () => {
    expect(mixColor('#00000000', '#ffffffff', -1)).toBe('rgba(0, 0, 0, 0)');
    expect(mixColor('#00000000', '#ffffffff', 2)).toBe('rgba(255, 255, 255, 1)');
  });

  it('splits a color into its opaque part and its alpha', () => {
    expect(splitColorAlpha('#00000017')).toEqual({ color: '#000000', alpha: 23 / 255 });
    expect(splitColorAlpha('#11223380')).toEqual({ color: '#112233', alpha: 128 / 255 });
    expect(splitColorAlpha('#AbCdEf')).toEqual({ color: '#abcdef', alpha: 1 });
    expect(splitColorAlpha('#f00')).toEqual({ color: '#ff0000', alpha: 1 });
  });
});
