import { describe, expect, it } from 'vitest';

import { hexToRgb, mixColor, rgba } from './colorUtils';

describe('generator colorUtils', () => {
  it('parses 8-digit hex colors into RGB channels', () => {
    expect(hexToRgb('#ff0000ff')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#33669980')).toEqual({ r: 51, g: 102, b: 153 });
  });

  it('preserves existing 3-digit and 6-digit hex behavior', () => {
    expect(hexToRgb('#0f8')).toEqual({ r: 0, g: 255, b: 136 });
    expect(hexToRgb('#336699')).toEqual({ r: 51, g: 102, b: 153 });
  });

  it('falls back to white for invalid colors', () => {
    expect(hexToRgb('not-a-color')).toEqual({ r: 255, g: 255, b: 255 });
  });

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
});
