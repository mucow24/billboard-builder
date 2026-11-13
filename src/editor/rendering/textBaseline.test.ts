import { describe, expect, it } from 'vitest';

import { createTextItem } from '../document/documentDefaults';
import {
  capCentredBaseline,
  capHeightOf,
  measureCapHeight,
  measureFirstBaseline,
  pixiFirstBaseline,
  snapOffsetToTexels,
} from './textBaseline';

describe('capCentredBaseline', () => {
  it('leaves as much room above the capitals as below the baseline', () => {
    // A 110px line box and capitals 70px tall: 20px above, 20px below.
    const baseline = capCentredBaseline(110, 70);
    expect(baseline).toBe(90);
    expect(baseline - 70).toBe(110 - baseline);
  });

  it('centres capitals taller than the line box too, overflowing equally at both ends', () => {
    // Capitals of 120px in a 100px line box: 10px out at the top, 10px at the bottom.
    const baseline = capCentredBaseline(100, 120);
    expect(baseline - 120).toBe(-10);
    expect(baseline - 100).toBe(10);
  });

  it('does not depend on anything but the line box and the cap height', () => {
    // The Modernia case from the bug report at 100px, line height 1.1: capitals
    // 80px tall. Pixi put this baseline at 121px, below the 110px box.
    expect(capCentredBaseline(110, 80)).toBe(95);
  });
});

// Mirrors Pixi's CanvasTextGenerator: `linePositionY = ascent +
// linePositionYShift`, where the shift is `(lineHeight - fontProperties.fontSize)
// / 2`, clamped to 0 when negative. The canvas moves its text by the difference
// between this and the baseline it wants, so this has to be Pixi's number.
describe('pixiFirstBaseline', () => {
  it('is the ascent when the line box is shorter than the font ink height', () => {
    // Modernia at 142px: line height 142 < ink height (171 + 30).
    expect(pixiFirstBaseline(171, 30, 142)).toBe(171);
  });

  it('is the ascent when the line box exactly matches the font ink height', () => {
    expect(pixiFirstBaseline(80, 20, 100)).toBe(80);
  });

  it('adds half of the extra leading when the line box is taller', () => {
    // ink height 100, line height 160 => 60 of leading, half above the text.
    expect(pixiFirstBaseline(80, 20, 160)).toBe(110);
  });
});

describe('capHeightOf', () => {
  it('is how far the ink of the measured capital rises above the baseline', () => {
    expect(capHeightOf({ actualBoundingBoxAscent: 71.6 }, 100)).toBe(71.6);
  });

  it('estimates from the font size when the browser reports nothing usable', () => {
    const unreported = {} as Pick<TextMetrics, 'actualBoundingBoxAscent'>;
    expect(capHeightOf(unreported, 100)).toBe(70);
    expect(capHeightOf({ actualBoundingBoxAscent: 0 }, 100)).toBe(70);
    expect(capHeightOf({ actualBoundingBoxAscent: Number.NaN }, 50)).toBe(35);
  });
});

describe('snapOffsetToTexels', () => {
  it('rounds to whole px when the text is rasterised at one texel per px', () => {
    expect(snapOffsetToTexels(-25.6, 1)).toBe(-26);
    expect(snapOffsetToTexels(4.4, 1)).toBe(4);
  });

  it('rounds to the finer texel grid of a higher resolution', () => {
    expect(snapOffsetToTexels(-25.6, 2)).toBe(-25.5);
    expect(snapOffsetToTexels(4.4, 1.25)).toBeCloseTo(4.8); // 5.5 texels round to 6
  });

  it('returns the offset as it is when the resolution is unusable, and 0 for an unusable offset', () => {
    expect(snapOffsetToTexels(4.4, 0)).toBe(4.4);
    expect(snapOffsetToTexels(4.4, Number.NaN)).toBe(4.4);
    expect(snapOffsetToTexels(Number.NaN, 1)).toBe(0);
  });
});

describe('measuring without a canvas (jsdom)', () => {
  it('reports that the cap height cannot be measured', () => {
    expect(measureCapHeight(createTextItem())).toBeNull();
  });

  it('places the first baseline by an estimated cap height', () => {
    const item = createTextItem({ fontSize: 100, lineHeight: 1.2 });
    // Line box 120px, estimated capitals 70px.
    expect(measureFirstBaseline(item)).toBeCloseTo(95);
  });
});
