import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createRectangleItem } from '../../document/documentDefaults';
import type { RenderableCanvasItem } from '../renderAdapter';

const { makeKonvaNode, overflowLayerRenderCount } = vi.hoisted(() => ({
  makeKonvaNode(name: string) {
    return React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
      ({ children, ...props }, ref) =>
        React.createElement(
          'div',
          {
            ref,
            'data-konva-node': name,
            ...Object.fromEntries(
              Object.entries(props).flatMap<[string, unknown]>(([key, value]) => {
                if (value === undefined || typeof value === 'function') {
                  return [];
                }
                return [[`data-prop-${key.toLowerCase()}`, typeof value === 'object' ? JSON.stringify(value) : String(value)]];
              }),
            ),
          },
          children as React.ReactNode,
        ),
    );
  },
  overflowLayerRenderCount: {
    current: 0,
  },
}));

vi.mock('react-konva', () => ({
  Group: makeKonvaNode('Group'),
  Rect: makeKonvaNode('Rect'),
}));

vi.mock('./CanvasItemLayer', () => {
  return {
    CanvasItemLayer: React.memo(function CanvasItemLayerMock({
      items,
    }: {
      items: RenderableCanvasItem[];
    }) {
      overflowLayerRenderCount.current += 1;
      return <div data-testid="overflow-item-count">{items.length}</div>;
    }),
  };
});

import { CanvasOverflowPreviewLayer } from './CanvasOverflowPreviewLayer';

function toRenderable(item: ReturnType<typeof createRectangleItem>): RenderableCanvasItem {
  return {
    ...item,
    groupPath: [],
    selectableNodeId: item.id,
  };
}

describe('CanvasOverflowPreviewLayer', () => {
  it('reuses the overflow item subset when rendered items stay stable', () => {
    overflowLayerRenderCount.current = 0;
    const overflowItem = toRenderable(
      createRectangleItem({
        id: 'overflow-item',
        x: -120,
        y: 140,
        width: 160,
        height: 120,
      }),
    );
    const sharedProps = {
      activeTool: 'select' as const,
      canvasHeight: 1024,
      canvasWidth: 1024,
      onBeginLineHandle: vi.fn(),
      onBeginResize: vi.fn(),
      onBeginRotate: vi.fn(),
      onItemDoubleClick: vi.fn(),
      onItemPointerDown: vi.fn(),
      renderedItems: [overflowItem],
      startPanDrag: vi.fn(),
      toCanvasPointer: (pointer: { x: number; y: number }) => pointer,
    };

    const { rerender } = render(<CanvasOverflowPreviewLayer {...sharedProps} />);
    const initialRenderCount = overflowLayerRenderCount.current;

    expect(initialRenderCount).toBeGreaterThan(0);

    rerender(<CanvasOverflowPreviewLayer {...sharedProps} />);

    expect(overflowLayerRenderCount.current).toBe(initialRenderCount);
  });
});
