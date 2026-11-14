import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGeneratorItem } from '../document/documentDefaults';
import type { GeneratorCanvasItem } from '../document/documentTypes';

import { useGeneratorCanvas } from './useGeneratorCanvas';

interface HookProps {
  item: GeneratorCanvasItem;
  width: number;
  height: number;
  pixelScale: number;
}

function renderGeneratorCanvas(initialProps: HookProps) {
  return renderHook(
    ({ item, width, height, pixelScale }: HookProps) =>
      useGeneratorCanvas(item, width, height, pixelScale),
    { initialProps },
  );
}

describe('useGeneratorCanvas', () => {
  beforeEach(() => {
    // jsdom has no 2D context; the generators only need the calls to exist.
    const context = new Proxy(
      {},
      {
        get: (target: Record<string | symbol, unknown>, key) =>
          key in target ? target[key] : () => context,
        set: (target: Record<string | symbol, unknown>, key, value) => {
          target[key] = value;
          return true;
        },
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => context) as unknown as HTMLCanvasElement['getContext'],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rasterizes at the canvas size times the pixel scale', () => {
    const item = createGeneratorItem('scanlines', 800, 600);
    const { result } = renderGeneratorCanvas({ item, width: 800, height: 600, pixelScale: 2 });

    expect(result.current?.width).toBe(1600);
    expect(result.current?.height).toBe(1200);
  });

  it('returns a new canvas at the new size when the canvas is resized', () => {
    const item = createGeneratorItem('scanlines', 800, 600);
    const { result, rerender } = renderGeneratorCanvas({ item, width: 800, height: 600, pixelScale: 1 });
    const before = result.current;

    rerender({ item: { ...item, width: 1200, height: 400 }, width: 1200, height: 400, pixelScale: 1 });

    // A texture built on the old canvas must not be resized in place: the
    // sprite showing it would keep its old scale.
    expect(result.current).not.toBe(before);
    expect(result.current?.width).toBe(1200);
    expect(result.current?.height).toBe(400);
    expect(before?.width).toBe(800);
    expect(before?.height).toBe(600);
  });

  it('returns a new canvas when the pixel scale changes', () => {
    const item = createGeneratorItem('scanlines', 800, 600);
    const { result, rerender } = renderGeneratorCanvas({ item, width: 800, height: 600, pixelScale: 1 });
    const before = result.current;

    rerender({ item, width: 800, height: 600, pixelScale: 2 });

    expect(result.current).not.toBe(before);
    expect(result.current?.width).toBe(1600);
  });

  it('reuses the canvas when only the pattern changes', () => {
    const item = createGeneratorItem('scanlines', 800, 600);
    const { result, rerender } = renderGeneratorCanvas({ item, width: 800, height: 600, pixelScale: 1 });
    const before = result.current;

    rerender({
      item: { ...item, seed: item.seed + 1, generatorParams: { ...item.generatorParams } },
      width: 800,
      height: 600,
      pixelScale: 1,
    });

    expect(result.current).toBe(before);
  });
});
