import { describe, expect, it } from 'vitest';

import { strokedTextPlacement, textStrokeOf } from './textStroke';

describe('textStrokeOf', () => {
  it('has no outline at width 0, the width of new text', () => {
    expect(textStrokeOf({ stroke: '#000000ff', strokeWidth: 0 })).toBeNull();
  });

  it('splits the colour into an opaque colour and its alpha', () => {
    expect(textStrokeOf({ stroke: '#ff0000', strokeWidth: 6 })).toEqual({ width: 6, color: '#ff0000', alpha: 1 });
    const seeThrough = textStrokeOf({ stroke: '#3366ff80', strokeWidth: 2.5 });
    expect(seeThrough).toMatchObject({ width: 2.5, color: '#3366ff' });
    expect(seeThrough?.alpha).toBeCloseTo(128 / 255, 5);
  });

  it('has no outline where the colour shows nothing', () => {
    expect(textStrokeOf({ stroke: '#ff000000', strokeWidth: 6 })).toBeNull();
    expect(textStrokeOf({ stroke: 'transparent', strokeWidth: 6 })).toBeNull();
    expect(textStrokeOf({ stroke: '', strokeWidth: 6 })).toBeNull();
  });

  it('has no outline for a width that is not a usable number', () => {
    expect(textStrokeOf({ stroke: '#ff0000', strokeWidth: -3 })).toBeNull();
    expect(textStrokeOf({ stroke: '#ff0000', strokeWidth: Number.NaN })).toBeNull();
    expect(textStrokeOf({ stroke: '#ff0000', strokeWidth: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('strokedTextPlacement', () => {
  it('moves the text back by half the stroke, which Pixi draws it further in by', () => {
    expect(strokedTextPlacement(0, 12, 1).offset).toBe(-6);
    expect(strokedTextPlacement(40, 5, 2).offset).toBe(-2.5);
  });

  // Blocks of 16 texels: where the glyphs of the unstroked text sit in every
  // mip level (see `snapPaddingToTexels`).
  it.each([
    { inkRoom: 0, strokeWidth: 12, resolution: 1 },
    { inkRoom: 7, strokeWidth: 12, resolution: 1 },
    { inkRoom: 30, strokeWidth: 5, resolution: 2 },
    { inkRoom: 3, strokeWidth: 1, resolution: 1.25 },
    { inkRoom: 100, strokeWidth: 33, resolution: 3 },
  ])(
    'puts the glyphs a whole number of texel blocks into the texture ($inkRoom, $strokeWidth, $resolution)',
    ({ inkRoom, strokeWidth, resolution }) => {
      const { padding } = strokedTextPlacement(inkRoom, strokeWidth, resolution);
      const blocks = ((padding + strokeWidth / 2) * resolution) / 16;
      expect(blocks).toBeCloseTo(Math.round(blocks), 6);
      // Never less room than the ink needs, and less than a block more.
      expect(padding).toBeGreaterThanOrEqual(inkRoom);
      expect(padding - inkRoom).toBeLessThan(16 / resolution);
    },
  );

  it('is the padding of an unstroked text where there is no stroke', () => {
    expect(strokedTextPlacement(20, 0, 1)).toEqual({ padding: 32, offset: 0 });
    expect(strokedTextPlacement(0, 0, 2)).toEqual({ padding: 0, offset: 0 });
  });
});
