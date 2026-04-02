import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useBlurEffect, nativeBlur } from './useBlurEffect';

const { mockNode, mockBatchDraw } = vi.hoisted(() => {
  const mockBatchDraw = vi.fn();
  const mockNode = {
    filters: vi.fn(),
    blurRadius: vi.fn(),
    cache: vi.fn(),
    clearCache: vi.fn(),
    getLayer: vi.fn(() => ({ batchDraw: mockBatchDraw })),
  };
  return { mockNode, mockBatchDraw };
});

function TestHarness({ blurRadius, item }: { blurRadius: number; item: object }) {
  const nodeRef = useRef(mockNode as never);
  useBlurEffect(nodeRef, blurRadius, item);
  return null;
}

function clearMocks() {
  Object.values(mockNode).forEach((value) => {
    if (typeof value === 'function') value.mockClear();
  });
  mockBatchDraw.mockClear();
}

function createMockImageData(width: number, height: number) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) } as unknown as ImageData;
}

function createMockCanvasCtx() {
  return {
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      createMockImageData(w, h),
    filter: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('nativeBlur', () => {
  it('reuses canvases across calls', () => {
    const spy = vi.spyOn(document, 'createElement');
    const mockCtx = createMockCanvasCtx();
    spy.mockImplementation((tag: string) => {
      const el = { width: 0, height: 0, getContext: () => mockCtx };
      return el as unknown as HTMLCanvasElement;
    });

    const ctx = { blurRadius: () => 5 };

    nativeBlur.call(ctx as never, createMockImageData(10, 10));
    nativeBlur.call(ctx as never, createMockImageData(10, 10));

    const canvasCalls = spy.mock.calls.filter(([tag]) => tag === 'canvas');
    expect(canvasCalls).toHaveLength(2); // src + dst created once, reused on second call

    spy.mockRestore();
  });

  it('handles different dimensions across calls without error', () => {
    const spy = vi.spyOn(document, 'createElement');
    const mockCtx = createMockCanvasCtx();
    spy.mockImplementation(() => {
      const el = { width: 0, height: 0, getContext: () => mockCtx };
      return el as unknown as HTMLCanvasElement;
    });

    const ctx = { blurRadius: () => 5 };

    // Calling with different sizes should not throw
    expect(() => {
      nativeBlur.call(ctx as never, createMockImageData(10, 10));
      nativeBlur.call(ctx as never, createMockImageData(20, 20));
      nativeBlur.call(ctx as never, createMockImageData(5, 30));
    }).not.toThrow();

    spy.mockRestore();
  });

  it('skips processing when blurRadius is 0', () => {
    const spy = vi.spyOn(document, 'createElement');
    const ctx = { blurRadius: () => 0 };

    nativeBlur.call(ctx as never, createMockImageData(10, 10));

    const canvasCalls = spy.mock.calls.filter(([tag]) => tag === 'canvas');
    expect(canvasCalls).toHaveLength(0);

    spy.mockRestore();
  });
});

describe('useBlurEffect', () => {
  beforeEach(clearMocks);

  it('caches the node when blurRadius > 0', () => {
    const item = { x: 10, y: 20, rotation: 0, fill: 'red', width: 100 };

    render(<TestHarness blurRadius={5} item={item} />);

    expect(mockNode.filters).toHaveBeenCalledWith([nativeBlur]);
    expect(mockNode.blurRadius).toHaveBeenCalledWith(5);
    expect(mockNode.cache).toHaveBeenCalledWith({ offset: 10 });
    expect(mockBatchDraw).toHaveBeenCalled();
  });

  it('clears cache when blurRadius is 0', () => {
    const item = { x: 10, y: 20, rotation: 0, fill: 'red' };

    render(<TestHarness blurRadius={0} item={item} />);

    expect(mockNode.filters).toHaveBeenCalledWith([]);
    expect(mockNode.clearCache).toHaveBeenCalled();
    expect(mockNode.cache).not.toHaveBeenCalled();
  });

  it('does NOT re-cache when only x/y/rotation change', () => {
    const item = { x: 10, y: 20, rotation: 0, fill: 'red', width: 100 };

    const { rerender } = render(<TestHarness blurRadius={5} item={item} />);

    expect(mockNode.cache).toHaveBeenCalledTimes(1);
    clearMocks();

    const movedItem = { ...item, x: 50, y: 80, rotation: 45 };
    rerender(<TestHarness blurRadius={5} item={movedItem} />);

    expect(mockNode.cache).not.toHaveBeenCalled();
    expect(mockNode.clearCache).not.toHaveBeenCalled();
  });

  it('re-caches when a visual property changes', () => {
    const item = { x: 10, y: 20, rotation: 0, fill: 'red', width: 100 };

    const { rerender } = render(<TestHarness blurRadius={5} item={item} />);

    expect(mockNode.cache).toHaveBeenCalledTimes(1);
    clearMocks();

    const updatedItem = { ...item, fill: 'blue' };
    rerender(<TestHarness blurRadius={5} item={updatedItem} />);

    expect(mockNode.cache).toHaveBeenCalledTimes(1);
  });

  it('re-caches when dimensions change', () => {
    const item = { x: 10, y: 20, rotation: 0, fill: 'red', width: 100 };

    const { rerender } = render(<TestHarness blurRadius={5} item={item} />);
    clearMocks();

    const resizedItem = { ...item, width: 200 };
    rerender(<TestHarness blurRadius={5} item={resizedItem} />);

    expect(mockNode.cache).toHaveBeenCalledTimes(1);
  });

  it('clears cache on unmount', () => {
    const item = { x: 10, y: 20, rotation: 0, fill: 'red' };

    const { unmount } = render(<TestHarness blurRadius={5} item={item} />);
    clearMocks();

    unmount();

    expect(mockNode.clearCache).toHaveBeenCalled();
  });
});
