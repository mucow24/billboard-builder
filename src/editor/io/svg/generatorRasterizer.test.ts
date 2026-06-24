import { describe, expect, it, vi } from 'vitest';

import { createGeneratorItem } from '../../document/documentDefaults';
import { createGeneratorRasterizer } from './generatorRasterizer';

function fakeCanvas(toDataURL = vi.fn(() => 'data:image/png;base64,STUB')) {
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL,
  };
  return { canvas, ctx, toDataURL };
}

describe('createGeneratorRasterizer', () => {
  it('replays the generator draw into a supersampled canvas and returns its data URL', () => {
    const { canvas, ctx } = fakeCanvas();
    const draw = vi.fn();
    const item = createGeneratorItem('bands', 100, 80);

    const rasterizer = createGeneratorRasterizer({
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
      getGeneratorSpec: () => ({ draw }),
      pixelRatio: 2,
    });

    const url = rasterizer.rasterizeGenerator(item, 100, 80);

    expect(url).toBe('data:image/png;base64,STUB');
    expect(canvas.width).toBe(200); // 100 * pixelRatio
    expect(canvas.height).toBe(160);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(draw).toHaveBeenCalledWith(ctx, 100, 80, item.generatorParams, item.seed);
  });

  it('returns an empty string when the generator type is unknown', () => {
    const { canvas } = fakeCanvas();
    const rasterizer = createGeneratorRasterizer({
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
      getGeneratorSpec: () => undefined,
    });
    const item = createGeneratorItem('bands', 10, 10);
    expect(rasterizer.rasterizeGenerator(item, 10, 10)).toBe('');
  });
});
