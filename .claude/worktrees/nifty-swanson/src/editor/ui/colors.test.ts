import { describe, expect, it } from 'vitest';

import {
  commitHexColorInput,
  hexColorToHsva,
  hsvaToStoredHexColor,
  parseHexColor,
  toHexColorWithAlpha,
  toStoredHexColor,
} from './colors';

describe('color helpers', () => {
  it('parses 8-digit hex colors with alpha', () => {
    const parsed = parseHexColor('#33669980');

    expect(parsed.hex).toBe('#336699');
    expect(parsed.alpha).toBeCloseTo(128 / 255);
  });

  it('parses 6-digit hex colors as fully opaque', () => {
    const parsed = parseHexColor('#336699');

    expect(parsed.hex).toBe('#336699');
    expect(parsed.alpha).toBe(1);
  });

  it('combines a base color with a new alpha channel', () => {
    expect(toHexColorWithAlpha('#336699', 0.5)).toBe('#33669980');
  });

  it('normalizes stored colors to 8-digit lowercase hex', () => {
    expect(toStoredHexColor('#336699')).toBe('#336699ff');
    expect(toStoredHexColor('#33669980')).toBe('#33669980');
  });

  it('preserves alpha when committing 6-digit hex input', () => {
    expect(commitHexColorInput('336699', 0.5)).toBe('#33669980');
  });

  it('accepts 8-digit hex input directly', () => {
    expect(commitHexColorInput('#336699cc', 0.5)).toBe('#336699cc');
  });

  it('rejects invalid committed hex input', () => {
    expect(commitHexColorInput('#xyz', 0.5)).toBeNull();
  });

  it('round-trips a library hsva color back to stored hex', () => {
    expect(hsvaToStoredHexColor(hexColorToHsva('#33669980'))).toBe('#33669980');
  });
});
