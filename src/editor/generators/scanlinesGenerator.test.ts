import { describe, expect, it, vi } from 'vitest';

import { rgba } from './colorUtils';
import { scanlinesGeneratorSpec } from './scanlinesGenerator';

function createMockContext() {
  return {
    fillRect: vi.fn(),
    fillStyle: '',
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D & { fillRect: ReturnType<typeof vi.fn>; fillStyle: string };
}

describe('scanlinesGeneratorSpec', () => {
  it('defaults to solid black lines, with opacity apart from an opaque color', () => {
    expect(scanlinesGeneratorSpec.createDefaultParams()).toEqual({
      generatorType: 'scanlines',
      scanlineColor: '#000000',
      opacity: 1,
      scanlineHeight: 5,
      scanlineSpacing: 5,
    });
  });

  it('draws default scanlines with 5px height and a 5px gap', () => {
    const ctx = createMockContext();

    scanlinesGeneratorSpec.draw(
      ctx,
      8,
      16,
      scanlinesGeneratorSpec.createDefaultParams(),
      0,
    );

    expect(ctx.fillStyle).toBe(rgba('#000000', 1));
    expect(ctx.fillStyle).toBe('rgba(0, 0, 0, 1)');
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 8, 5);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 10, 8, 5);
  });

  it('draws taller scanlines with the configured gap', () => {
    const ctx = createMockContext();

    scanlinesGeneratorSpec.draw(
      ctx,
      12,
      20,
      {
        generatorType: 'scanlines',
        scanlineColor: '#000000',
        opacity: 0.09,
        scanlineHeight: 3,
        scanlineSpacing: 4,
      },
      0,
    );

    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 12, 3);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 7, 12, 3);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(3, 0, 14, 12, 3);
  });

  it('supports zero spacing and applies the opacity setting to the color', () => {
    const ctx = createMockContext();

    scanlinesGeneratorSpec.draw(
      ctx,
      10,
      7,
      {
        generatorType: 'scanlines',
        scanlineColor: '#112233',
        opacity: 0.5,
        scanlineHeight: 2,
        scanlineSpacing: 0,
      },
      0,
    );

    expect(ctx.fillStyle).toBe('rgba(17, 34, 51, 0.5)');
    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 10, 2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 2, 10, 2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(3, 0, 4, 10, 2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(4, 0, 6, 10, 2);
  });
});
