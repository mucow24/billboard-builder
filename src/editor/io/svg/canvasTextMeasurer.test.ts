import { describe, expect, it } from 'vitest';

import { pixiLinePositionYShift } from './canvasTextMeasurer';

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
