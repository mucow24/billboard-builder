import { describe, expect, it } from 'vitest';

import { parseHexColor, toHexColorWithAlpha } from './colors';

describe('color helpers', () => {
  it('parses 8-digit hex colors with alpha', () => {
    const parsed = parseHexColor('#33669980');

    expect(parsed.hex).toBe('#336699');
    expect(parsed.alpha).toBeCloseTo(128 / 255);
  });

  it('combines a base color with a new alpha channel', () => {
    expect(toHexColorWithAlpha('#336699', 0.5)).toBe('#33669980');
  });
});
