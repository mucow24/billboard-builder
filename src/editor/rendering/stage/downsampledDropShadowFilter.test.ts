import type { FilterSystem, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeTexture {
  label: string;
  frame: { width: number; height: number };
  source: { resolution: number };
}

const { stockApply, blurApply, taken, returned } = vi.hoisted(() => ({
  stockApply: vi.fn(),
  blurApply: vi.fn(),
  taken: [] as FakeTexture[],
  returned: [] as FakeTexture[],
}));

vi.mock('pixi-filters', () => ({
  // The stock filter: its own `apply`, and the two passes ours borrows.
  DropShadowFilter: class {
    blur = 0;
    shadowOnly = false;
    _blurFilter = { apply: blurApply };
    _basePass = { label: 'copy' };
    apply(...args: unknown[]) {
      stockApply(...args);
    }
  },
}));

vi.mock('pixi.js', () => ({
  TexturePool: {
    getOptimalTexture: (width: number, height: number, resolution: number): FakeTexture => {
      const texture = { label: `pooled-${taken.length}`, frame: { width, height }, source: { resolution } };
      taken.push(texture);
      return texture;
    },
    returnTexture: (texture: FakeTexture) => {
      returned.push(texture);
    },
  },
}));

import { DownsampledDropShadowFilter, shadowBlurHalvings } from './downsampledDropShadowFilter';

function fakeTexture(label: string, width: number, height: number, resolution: number): FakeTexture {
  return { label, frame: { width, height }, source: { resolution } };
}

/** A filter manager that records every pass it is asked for. */
function setup(blur: number) {
  const filter = new DownsampledDropShadowFilter();
  filter.blur = blur;
  const passes: Array<{ filter: unknown; input: FakeTexture; output: FakeTexture; clear: boolean }> = [];
  const filterManager = {
    applyFilter: (pass: unknown, input: FakeTexture, output: FakeTexture, clear: boolean) => {
      passes.push({ filter: pass, input, output, clear });
    },
  } as unknown as FilterSystem;
  const input = fakeTexture('input', 1000, 600, 1.5);
  const output = fakeTexture('output', 1000, 600, 1.5);
  const apply = (clearMode = false) =>
    filter.apply(filterManager, input as unknown as Texture, output as unknown as Texture, clearMode);
  const copy = (filter as unknown as { _basePass: unknown })._basePass;
  return { filter, passes, input, output, apply, copy };
}

describe('shadowBlurHalvings', () => {
  it('leaves a blur alone that spans too few texels to halve', () => {
    expect(shadowBlurHalvings(1, 0)).toBe(0);
    expect(shadowBlurHalvings(1, 4)).toBe(0);
    expect(shadowBlurHalvings(1, 15.9)).toBe(0);
    expect(shadowBlurHalvings(1, Number.NaN)).toBe(0);
  });

  it('halves for as long as eight texels are left across the blur strength', () => {
    expect(shadowBlurHalvings(1, 16)).toBe(1);
    expect(shadowBlurHalvings(1, 31.9)).toBe(1);
    expect(shadowBlurHalvings(1, 32)).toBe(2);
    // 76 px at 1.5 texels per px: 114 texels, 14 left after three halvings.
    expect(shadowBlurHalvings(1.5, 76)).toBe(3);
  });

  it('counts texels, so a finer texture is halved more often', () => {
    expect(shadowBlurHalvings(2, 16)).toBe(2);
    expect(shadowBlurHalvings(0.5, 16)).toBe(0);
  });
});

describe('DownsampledDropShadowFilter', () => {
  beforeEach(() => {
    stockApply.mockClear();
    blurApply.mockClear();
    taken.length = 0;
    returned.length = 0;
  });

  it('is the stock filter for a blur too small to scale down', () => {
    const { apply, passes, input, output } = setup(4);
    apply(true);

    expect(stockApply).toHaveBeenCalledTimes(1);
    expect(stockApply.mock.calls[0].slice(1)).toEqual([input, output, true]);
    expect(passes).toEqual([]);
    expect(taken).toEqual([]);
  });

  it('is the stock filter with downsampleBlur off', () => {
    const { filter, apply, passes } = setup(76);
    filter.downsampleBlur = false;
    apply();

    expect(stockApply).toHaveBeenCalledTimes(1);
    expect(passes).toEqual([]);
    expect(taken).toEqual([]);
  });

  it('halves the silhouette, blurs the small texture, and draws the item over the shadow', () => {
    const { filter, apply, passes, input, output, copy } = setup(76);
    apply(false);

    expect(stockApply).not.toHaveBeenCalled();
    // Three halvings and the texture the shadow is tinted into.
    expect(taken.map((texture) => texture.source.resolution)).toEqual([0.75, 0.375, 0.1875, 0.1875]);
    const [half, quarter, eighth, silhouette] = taken;

    expect(passes).toEqual([
      { filter: copy, input, output: half, clear: true },
      { filter: copy, input: half, output: quarter, clear: true },
      { filter: copy, input: quarter, output: eighth, clear: true },
      // The stock filter's own shader: the shadow's colour and offset.
      { filter, input: eighth, output: silhouette, clear: true },
      // The item itself, at full resolution, over the blurred shadow.
      { filter: copy, input, output, clear: false },
    ]);
    // The blur runs from the small texture straight to the output.
    expect(blurApply).toHaveBeenCalledTimes(1);
    expect(blurApply.mock.calls[0].slice(1)).toEqual([silhouette, output, false]);

    expect(returned).toEqual(taken);
  });

  it('takes textures a whole number of texels wide and high', () => {
    const { apply } = setup(76);
    apply();

    for (const texture of taken) {
      const { resolution } = texture.source;
      expect(Number.isInteger(texture.frame.width * resolution)).toBe(true);
      expect(Number.isInteger(texture.frame.height * resolution)).toBe(true);
      // Never smaller than the area it stands for.
      expect(texture.frame.width).toBeGreaterThanOrEqual(1000);
      expect(texture.frame.height).toBeGreaterThanOrEqual(600);
    }
    // 1000 px at 0.1875 texels per px is 187.5 texels: rounded up to 188.
    expect(taken[2].frame.width * 0.1875).toBe(188);
  });

  it('draws no item over a shadow-only filter', () => {
    const { filter, apply, passes, output } = setup(76);
    filter.shadowOnly = true;
    apply();

    expect(passes.filter((pass) => pass.output === output)).toEqual([]);
    expect(blurApply).toHaveBeenCalledTimes(1);
  });
});
