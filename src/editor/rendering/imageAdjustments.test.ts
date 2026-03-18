import { describe, expect, it, vi } from 'vitest';

vi.mock('konva', () => ({
  default: {
    Filters: {
      Brighten: Symbol('Brighten'),
      Contrast: Symbol('Contrast'),
      RGBA: Symbol('RGBA'),
    },
  },
}));

import { normalizeImageAdjustments } from '../document/imageAdjustments';
import { getRenderableImageAdjustments } from './imageAdjustments';

describe('image adjustments helpers', () => {
  it('normalizes missing and invalid values to editor defaults', () => {
    expect(
      normalizeImageAdjustments({
        brightness: Number.NaN,
        contrast: 999,
        tintColor: '',
        tintStrength: -20,
      }),
    ).toEqual({
      brightness: 100,
      contrast: 100,
      tintColor: '#ffffff',
      tintStrength: 0,
    });
  });

  it('maps editor-facing values into render-time filter settings', () => {
    const renderable = getRenderableImageAdjustments({
      brightness: 0,
      contrast: 100,
      tintColor: '#336699',
      tintStrength: 25,
    });

    expect(renderable.brightness).toBe(-1);
    expect(renderable.contrast).toBe(100);
    expect(renderable.tintRed).toBe(51);
    expect(renderable.tintGreen).toBe(102);
    expect(renderable.tintBlue).toBe(153);
    expect(renderable.tintAlpha).toBe(0.25);
    expect(renderable.isActive).toBe(true);
    expect(renderable.filters).toHaveLength(3);
  });

  it('disables filters for neutral settings', () => {
    const renderable = getRenderableImageAdjustments({
      brightness: 100,
      contrast: 50,
      tintColor: '#ffffff',
      tintStrength: 0,
    });

    expect(renderable.isActive).toBe(false);
    expect(renderable.filters).toEqual([]);
  });
});
