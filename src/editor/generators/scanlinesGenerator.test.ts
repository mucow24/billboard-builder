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
  it('preserves the prior visual cadence in default params', () => {
    expect(scanlinesGeneratorSpec.createDefaultParams()).toEqual({
      generatorType: 'scanlines',
      scanlineColor: '#00000017',
      scanlineHeight: 1,
      scanlineSpacing: 4,
    });
  });

  it('draws default scanlines with 1px height and a 4px gap', () => {
    const ctx = createMockContext();

    scanlinesGeneratorSpec.draw(
      ctx,
      8,
      16,
      scanlinesGeneratorSpec.createDefaultParams(),
      0,
    );

    expect(ctx.fillStyle).toBe(rgba('#00000017', 1));
    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 8, 1);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 5, 8, 1);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(3, 0, 10, 8, 1);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(4, 0, 15, 8, 1);
  });

  it('draws taller scanlines with the configured gap', () => {
    const ctx = createMockContext();

    scanlinesGeneratorSpec.draw(
      ctx,
      12,
      20,
      {
        generatorType: 'scanlines',
        scanlineColor: '#00000017',
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

  it('supports zero spacing and uses the configured alpha color', () => {
    const ctx = createMockContext();

    scanlinesGeneratorSpec.draw(
      ctx,
      10,
      7,
      {
        generatorType: 'scanlines',
        scanlineColor: '#11223380',
        scanlineHeight: 2,
        scanlineSpacing: 0,
      },
      0,
    );

    expect(ctx.fillStyle).toBe(rgba('#11223380', 1));
    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 10, 2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 0, 2, 10, 2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(3, 0, 4, 10, 2);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(4, 0, 6, 10, 2);
  });
});
