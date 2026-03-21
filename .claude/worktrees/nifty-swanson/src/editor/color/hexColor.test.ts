import { describe, expect, it } from 'vitest';

import {
  clampAlpha,
  parseHexColor,
  toHexColorWithAlpha,
  toStoredHexColor,
} from './hexColor';

describe('hexColor', () => {
  it('parses opaque and alpha hex colors into a canonical shape', () => {
    expect(parseHexColor('#336699')).toEqual({
      hex: '#336699',
      alpha: 1,
    });
    expect(parseHexColor('#33669980')).toEqual({
      hex: '#336699',
      alpha: 128 / 255,
    });
  });

  it('falls back to black for invalid colors and clamps alpha output', () => {
    expect(parseHexColor('not-a-color')).toEqual({
      hex: '#000000',
      alpha: 1,
    });
    expect(clampAlpha(-1)).toBe(0);
    expect(clampAlpha(2)).toBe(1);
    expect(toHexColorWithAlpha('#336699', 1.5)).toBe('#336699ff');
  });

  it('normalizes stored colors to lowercase eight-digit hex', () => {
    expect(toStoredHexColor('#336699')).toBe('#336699ff');
    expect(toStoredHexColor('#33669980')).toBe('#33669980');
  });
});
