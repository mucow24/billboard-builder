import { describe, expect, it } from 'vitest';

import { inkWidthOf } from './canvasTextMeasurer';

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
