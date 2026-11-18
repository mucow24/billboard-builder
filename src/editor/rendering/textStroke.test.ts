import { describe, expect, it } from 'vitest';

import { textStrokeOf } from './textStroke';

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
