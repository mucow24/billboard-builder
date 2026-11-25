import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettledZoom, ZOOM_SETTLE_MS } from './useSettledZoom';

function setup(initialZoom: number) {
  return renderHook(({ zoom }: { zoom: number }) => useSettledZoom(zoom), {
    initialProps: { zoom: initialZoom },
  });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useSettledZoom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the zoom it is first given', () => {
    const hook = setup(2);
    expect(hook.result.current).toBe(2);
  });

  it('follows a new zoom only once it has held still', () => {
    const hook = setup(1);

    hook.rerender({ zoom: 2 });
    expect(hook.result.current).toBe(1);

    wait(ZOOM_SETTLE_MS - 1);
    expect(hook.result.current).toBe(1);

    wait(1);
    expect(hook.result.current).toBe(2);
  });

  it('waits anew after every step of a gesture, and settles on the last', () => {
    const hook = setup(1);

    hook.rerender({ zoom: 1.2 });
    wait(ZOOM_SETTLE_MS - 50);
    hook.rerender({ zoom: 1.44 });
    wait(ZOOM_SETTLE_MS - 50);
    hook.rerender({ zoom: 1.728 });
    wait(ZOOM_SETTLE_MS - 1);
    // Three steps and almost three waits in: nothing has been drawn anew.
    expect(hook.result.current).toBe(1);

    wait(1);
    expect(hook.result.current).toBe(1.728);
  });

  it('stays put when the zoom comes back before it settled', () => {
    const hook = setup(1);

    hook.rerender({ zoom: 2 });
    wait(ZOOM_SETTLE_MS - 50);
    hook.rerender({ zoom: 1 });
    wait(ZOOM_SETTLE_MS * 2);

    expect(hook.result.current).toBe(1);
  });
});
