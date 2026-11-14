import { renderHook } from '@testing-library/react';
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { MockFilter, createdFilters } = vi.hoisted(() => {
  const createdFilters: Array<{ progress: number; hole: unknown; destroyed: boolean }> = [];
  class MockFilter {
    progress = 0;
    hole: unknown = null;
    destroyed = false;
    constructor() {
      createdFilters.push(this);
    }
    setHole(hole: unknown) {
      this.hole = hole;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { MockFilter, createdFilters };
});

vi.mock('pixi.js', () => ({
  Container: class {
    filters: unknown[] | null = null;
    filterArea: unknown = null;
    destroyed = false;
  },
  Rectangle: class {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  },
}));

vi.mock('./focusVeilFilter', () => ({ FocusVeilFilter: MockFilter }));

import { Container } from 'pixi.js';

import { FOCUS_VEIL_FADE_MS, useFocusVeil } from './useFocusVeil';

type Layer = Container & { filters: InstanceType<typeof MockFilter>[] | null; filterArea: unknown };

const SIZE = { width: 800, height: 600 };
const HOLE = { left: 100, top: 50, right: 400, bottom: 350 };

function setup(initialActive: boolean, options: { strict?: boolean } = {}) {
  const layer = new Container() as Layer;
  const layerRef = { current: layer as Container };
  const hook = renderHook(
    ({ active, canvasRect }: { active: boolean; canvasRect: typeof HOLE }) =>
      useFocusVeil({ active, canvasRect, layerRef, rendererReady: true, size: SIZE }),
    {
      initialProps: { active: initialActive, canvasRect: HOLE },
      wrapper: options.strict ? ({ children }) => <StrictMode>{children}</StrictMode> : undefined,
    },
  );
  return { hook, layer };
}

function finishFade() {
  vi.advanceTimersByTime(FOCUS_VEIL_FADE_MS + 50);
}

describe('useFocusVeil', () => {
  beforeEach(() => {
    createdFilters.length = 0;
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('attaches nothing while inactive', () => {
    const { layer } = setup(false);
    finishFade();
    expect(layer.filters).toBeNull();
    expect(createdFilters).toHaveLength(0);
  });

  it('fades the filter in over the whole stage, with the canvas as the hole', () => {
    const { layer } = setup(true);
    vi.advanceTimersByTime(FOCUS_VEIL_FADE_MS / 2);
    expect(layer.filters).toHaveLength(1);
    const filter = layer.filters![0];
    expect(filter.progress).toBeGreaterThan(0);
    expect(filter.progress).toBeLessThan(1);

    finishFade();
    expect(filter.progress).toBe(1);
    expect(filter.hole).toEqual(HOLE);
    expect(layer.filterArea).toMatchObject({ x: 0, y: 0, width: SIZE.width, height: SIZE.height });
  });

  it('detaches the filter once faded out, and reuses the same filter next time', () => {
    const { hook, layer } = setup(true);
    finishFade();
    const filter = layer.filters![0];

    hook.rerender({ active: false, canvasRect: HOLE });
    expect(layer.filters).toEqual([filter]);
    finishFade();
    expect(layer.filters).toBeNull();

    hook.rerender({ active: true, canvasRect: HOLE });
    finishFade();
    expect(layer.filters).toEqual([filter]);
    expect(createdFilters).toHaveLength(1);
  });

  it('moves the hole in the same commit as the canvas moves', () => {
    const { hook, layer } = setup(true);
    finishFade();
    const moved = { left: 140, top: 60, right: 440, bottom: 360 };

    hook.rerender({ active: true, canvasRect: moved });
    expect(layer.filters![0].hole).toEqual(moved);
  });

  it('detaches and destroys the filter on unmount', () => {
    const { hook, layer } = setup(true);
    finishFade();
    const filter = layer.filters![0];

    hook.unmount();
    expect(layer.filters).toBeNull();
    expect(filter.destroyed).toBe(true);
  });

  it('never leaves a destroyed filter attached when effects re-run (StrictMode, Fast Refresh)', () => {
    const { layer } = setup(true, { strict: true });
    finishFade();
    expect(layer.filters).toHaveLength(1);
    expect(layer.filters![0].destroyed).toBe(false);
    expect(layer.filters![0].progress).toBe(1);
  });
});
