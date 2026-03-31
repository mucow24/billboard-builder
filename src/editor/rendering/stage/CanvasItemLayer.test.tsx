import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLineItem, createTextItem } from '../../document/documentDefaults';
import type { RenderableCanvasItem } from '../renderAdapter';

const { makeKonvaNode } = vi.hoisted(() => ({
  makeKonvaNode(name: string) {
    return React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
      ({ children, ...props }, ref) => {
        const entries = Object.entries(props).flatMap<[string, unknown]>(([key, value]) => {
          if (value === undefined || typeof value === 'function') {
            return [];
          }
          return [[`data-prop-${key.toLowerCase()}`, typeof value === 'object' ? JSON.stringify(value) : String(value)]];
        });

        return React.createElement(
          'div',
          { ref, 'data-konva-node': name, ...Object.fromEntries(entries) },
          children as React.ReactNode,
        );
      },
    );
  },
}));

vi.mock('react-konva', () => ({
  Circle: makeKonvaNode('Circle'),
  Ellipse: makeKonvaNode('Ellipse'),
  Group: makeKonvaNode('Group'),
  Line: makeKonvaNode('Line'),
  Rect: makeKonvaNode('Rect'),
  Text: makeKonvaNode('Text'),
}));

vi.mock('../useBlurEffect', () => ({
  useBlurEffect: () => {},
}));

vi.mock('../useImageElement', () => ({
  useImageElement: () => null,
}));

vi.mock('../ImageItemNode', () => ({
  ImageItemNode: () => <div data-testid="image-item-node" />,
}));

import * as fontStyles from '../../fonts/fontStyles';
import * as interactionGeometry from '../interactionGeometry';
import { CanvasItemLayer } from './CanvasItemLayer';

function toRenderable<T extends ReturnType<typeof createTextItem> | ReturnType<typeof createLineItem>>(item: T): RenderableCanvasItem {
  return {
    ...item,
    groupPath: [],
    selectableNodeId: item.id,
  };
}

describe('CanvasItemLayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not rerender unchanged item views when item references stay stable', () => {
    const textItem = toRenderable(
      createTextItem({
        id: 'text-item',
        text: 'Hello',
      }),
    );
    const lineItem = toRenderable(
      createLineItem({
        id: 'line-item',
        startX: 20,
        startY: 30,
        endX: 120,
        endY: 80,
      }),
    );
    const getRenderableCombinedFontStyleSpy = vi.spyOn(fontStyles, 'getRenderableCombinedFontStyle');
    const getLineHandleRectsSpy = vi.spyOn(interactionGeometry, 'getLineHandleRects');
    const sharedProps = {
      activeTool: 'select' as const,
      onBeginLineHandle: vi.fn(),
      onBeginResize: vi.fn(),
      onBeginRotate: vi.fn(),
      onItemDoubleClick: vi.fn(),
      onItemPointerDown: vi.fn(),
      registerShapeRef: vi.fn(),
      canvasWidth: 1024,
      canvasHeight: 1024,
      toCanvasPointer: (pointer: { x: number; y: number }) => pointer,
    };

    const { rerender } = render(
      <CanvasItemLayer
        {...sharedProps}
        items={[textItem, lineItem]}
      />,
    );

    expect(getRenderableCombinedFontStyleSpy).toHaveBeenCalledTimes(1);
    expect(getLineHandleRectsSpy).toHaveBeenCalledTimes(1);

    rerender(
      <CanvasItemLayer
        {...sharedProps}
        items={[textItem, lineItem]}
      />,
    );

    expect(getRenderableCombinedFontStyleSpy).toHaveBeenCalledTimes(1);
    expect(getLineHandleRectsSpy).toHaveBeenCalledTimes(1);
  });

  it('rerenders only the changed item view when one item reference changes', () => {
    const textItem = toRenderable(createTextItem({ id: 'text-item', text: 'Hello' }));
    const updatedTextItem = toRenderable(createTextItem({ id: 'text-item', text: 'Updated' }));
    const lineItem = toRenderable(createLineItem({ id: 'line-item', startX: 20, startY: 30, endX: 120, endY: 80 }));
    const getRenderableCombinedFontStyleSpy = vi.spyOn(fontStyles, 'getRenderableCombinedFontStyle');
    const getLineHandleRectsSpy = vi.spyOn(interactionGeometry, 'getLineHandleRects');
    const sharedProps = {
      activeTool: 'select' as const,
      onBeginLineHandle: vi.fn(),
      onBeginResize: vi.fn(),
      onBeginRotate: vi.fn(),
      onItemDoubleClick: vi.fn(),
      onItemPointerDown: vi.fn(),
      registerShapeRef: vi.fn(),
      canvasWidth: 1024,
      canvasHeight: 1024,
      toCanvasPointer: (pointer: { x: number; y: number }) => pointer,
    };

    const { rerender } = render(
      <CanvasItemLayer
        {...sharedProps}
        items={[textItem, lineItem]}
      />,
    );

    expect(getRenderableCombinedFontStyleSpy).toHaveBeenCalledTimes(1);
    expect(getLineHandleRectsSpy).toHaveBeenCalledTimes(1);

    rerender(
      <CanvasItemLayer
        {...sharedProps}
        items={[updatedTextItem, lineItem]}
      />,
    );

    expect(getRenderableCombinedFontStyleSpy).toHaveBeenCalledTimes(2);
    expect(getLineHandleRectsSpy).toHaveBeenCalledTimes(1);
  });
});
