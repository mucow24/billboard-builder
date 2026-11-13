import { describe, expect, it, vi } from 'vitest';

import { createTextItem } from '../../document/documentDefaults';
import { fakeMeasurer } from '../../../test/svgExportFakes';
import { smearOffsets, syntheticBoldFor, syntheticBoldStrokeWidth } from './syntheticFontStyle';

describe('syntheticBoldStrokeWidth', () => {
  it('is 1/32 of the font size from 36 px up', () => {
    expect(syntheticBoldStrokeWidth(36)).toBeCloseTo(36 / 32);
    expect(syntheticBoldStrokeWidth(100)).toBeCloseTo(100 / 32);
  });

  it('is 1/24 of the font size at 9 px and below', () => {
    expect(syntheticBoldStrokeWidth(9)).toBeCloseTo(9 / 24);
    expect(syntheticBoldStrokeWidth(4)).toBeCloseTo(4 / 24);
  });

  it('moves in a straight line between the two shares in between', () => {
    // Halfway from 9 to 36 px the share is halfway from 1/24 to 1/32.
    expect(syntheticBoldStrokeWidth(22.5)).toBeCloseTo(22.5 * ((1 / 24 + 1 / 32) / 2));
  });
});

describe('smearOffsets', () => {
  it('spreads copies from 0 to the distance, no further apart than 1/192 of the font size', () => {
    expect(smearOffsets(2, 96)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it('uses at least three copies', () => {
    expect(smearOffsets(0.1, 96)).toEqual([0, 0.05, 0.1]);
  });

  it('uses at most nine copies, still ending at the distance', () => {
    const offsets = smearOffsets(10, 96);
    expect(offsets).toHaveLength(9);
    expect(offsets[0]).toBe(0);
    expect(offsets[8]).toBe(10);
  });
});

describe('syntheticBoldFor', () => {
  const item = createTextItem({ fontSize: 96, fontWeight: 'bold' });

  it('is a smear when the browser draws faked bold wider, by that much', () => {
    const measurer = { ...fakeMeasurer, syntheticBoldAdvance: () => 2 };
    expect(syntheticBoldFor(item, 'AB', measurer)).toEqual({
      kind: 'smear',
      offsets: [0, 0.5, 1, 1.5, 2],
    });
  });

  it('is a stroke when faked bold is no wider', () => {
    const measurer = { ...fakeMeasurer, syntheticBoldAdvance: () => 0 };
    expect(syntheticBoldFor(item, 'AB', measurer)).toEqual({ kind: 'stroke', width: 3 });
  });

  it('is a stroke when the measurer cannot tell', () => {
    expect(syntheticBoldFor(item, 'AB', fakeMeasurer)).toEqual({ kind: 'stroke', width: 3 });
  });

  it('measures the first character of the text that draws something', () => {
    const syntheticBoldAdvance = vi.fn(() => 0);
    syntheticBoldFor(item, ' \n AB', { ...fakeMeasurer, syntheticBoldAdvance });
    expect(syntheticBoldAdvance).toHaveBeenCalledWith(item, 'A');
  });

  it('is a stroke for a text with nothing to draw, without measuring', () => {
    const syntheticBoldAdvance = vi.fn(() => 2);
    expect(syntheticBoldFor(item, '  ', { ...fakeMeasurer, syntheticBoldAdvance }).kind).toBe('stroke');
    expect(syntheticBoldAdvance).not.toHaveBeenCalled();
  });
});
