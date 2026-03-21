import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetImageElementCacheForTests, useImageElement } from './useImageElement';

class MockImage {
  static instances: MockImage[] = [];

  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  private currentSrc = '';

  constructor() {
    MockImage.instances.push(this);
  }

  set src(value: string) {
    this.currentSrc = value;
  }

  get src() {
    return this.currentSrc;
  }

  triggerLoad() {
    this.onload?.();
  }

  triggerError() {
    this.onerror?.();
  }
}

describe('useImageElement', () => {
  beforeEach(() => {
    MockImage.instances = [];
    resetImageElementCacheForTests();
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the loaded image element for a successful source', async () => {
    const { result } = renderHook(() => useImageElement('/poster.png'));

    expect(result.current).toBeNull();

    act(() => {
      MockImage.instances[0].triggerLoad();
    });

    await vi.waitFor(() => {
      expect(result.current).toBeInstanceOf(MockImage);
    });
  });

  it('resets to null while the hook swaps to a new uncached image source', async () => {
    const { result, rerender } = renderHook(
      ({ src }) => useImageElement(src),
      { initialProps: { src: '/first.png' } }
    );

    act(() => {
      MockImage.instances[0].triggerLoad();
    });
    await vi.waitFor(() => {
      expect(result.current).toBe(MockImage.instances[0]);
    });

    act(() => {
      rerender({ src: '/second.png' });
    });
    expect(result.current).toBeNull();

    act(() => {
      MockImage.instances[1].triggerLoad();
    });
    await vi.waitFor(() => {
      expect(result.current).toBe(MockImage.instances[1]);
    });
  });

  it('reuses a cached image synchronously when the same source remounts', async () => {
    const firstMount = renderHook(() => useImageElement('/poster.png'));

    act(() => {
      MockImage.instances[0].triggerLoad();
    });

    await vi.waitFor(() => {
      expect(firstMount.result.current).toBe(MockImage.instances[0]);
    });

    firstMount.unmount();

    const secondMount = renderHook(() => useImageElement('/poster.png'));

    expect(secondMount.result.current).toBe(MockImage.instances[0]);
    expect(MockImage.instances).toHaveLength(1);
  });

  it('keeps returning null after an image load failure', async () => {
    const { result } = renderHook(() => useImageElement('/broken.png'));

    act(() => {
      MockImage.instances[0].triggerError();
    });

    await vi.waitFor(() => {
      expect(result.current).toBeNull();
    });
  });

  it('ignores late image events after the hook unmounts', () => {
    const { unmount } = renderHook(() => useImageElement('/poster.png'));

    const lateImage = MockImage.instances[0];
    unmount();

    expect(() => {
      lateImage.triggerLoad();
      lateImage.triggerError();
    }).not.toThrow();
  });
});
