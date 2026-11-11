import { describe, expect, it } from 'vitest';

import { inkWidthOf, pixiLinePositionYShift } from './canvasTextMeasurer';

// Mirrors Pixi's CanvasTextMetrics._measureText: `boundsWidth =
// actualBoundingBoxRight + actualBoundingBoxLeft`, each counted as 0 when the
// browser does not report it. Pixi aligns a line by the larger of this and the
// advance width, so the SVG exporter needs the same number.
describe('inkWidthOf', () => {
  it('adds how far the ink reaches left of the pen to how far it reaches right', () => {
    // A first glyph that starts 3px before the pen, ink ending 50px after it.
    expect(inkWidthOf({ actualBoundingBoxLeft: 3, actualBoundingBoxRight: 50 })).toBe(53);
  });

  it('leaves out the gap when the ink starts right of the pen', () => {
    // An ordinary left side bearing: the ink starts 2px after the pen.
    expect(inkWidthOf({ actualBoundingBoxLeft: -2, actualBoundingBoxRight: 48 })).toBe(46);
  });

  it('counts a bound the browser does not report as zero', () => {
    const metrics = {} as Pick<TextMetrics, 'actualBoundingBoxLeft' | 'actualBoundingBoxRight'>;
    expect(inkWidthOf(metrics)).toBe(0);
    expect(inkWidthOf({ ...metrics, actualBoundingBoxRight: 48 })).toBe(48);
  });
});

// Mirrors Pixi's CanvasTextGenerator: `linePositionYShift = (lineHeight -
// fontProperties.fontSize) / 2`, clamped to 0 when negative. The SVG exporter
// must apply the same shift so the exported baseline matches the on-screen one.
describe('pixiLinePositionYShift', () => {
  it('is zero when the line box is shorter than the font ink height', () => {
    // Modernia "M" case: lineHeight 142 < ink height (171 + 30).
    expect(pixiLinePositionYShift(171, 30, 142)).toBe(0);
  });

  it('is zero when the line box exactly matches the font ink height', () => {
    expect(pixiLinePositionYShift(80, 20, 100)).toBe(0);
  });

  it('splits the extra leading evenly when the line box is taller', () => {
    // ink height 100, lineHeight 160 => 60 of leading, half above the baseline.
    expect(pixiLinePositionYShift(80, 20, 160)).toBe(30);
  });
});
