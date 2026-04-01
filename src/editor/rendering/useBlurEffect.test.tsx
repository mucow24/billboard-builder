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
