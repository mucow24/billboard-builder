import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createLineItem } from '../../document/documentDefaults';

const { makeKonvaNode } = vi.hoisted(() => ({
  makeKonvaNode(name: string) {
    return React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
      ({ children, ...props }, ref) => {
        let nodeRef: HTMLDivElement | null = null;
        const entries = Object.entries(props).flatMap<[string, unknown]>(([key, value]) => {
          if (value === undefined) {
            return [];
          }
          if (typeof value === 'function') {
            if (/^onMouseDown$/.test(key)) {
              return [[
                key,
                (event: MouseEvent) => {
                  value({
                    cancelBubble: false,
                    evt: event,
                    target: Object.assign(nodeRef ?? event.target ?? {}, {
                      getStage: () => ({
                        getPointerPosition: () => ({ x: 240, y: 160 }),
                      }),
                    }),
                  });
                },
              ]];
            }
            return [];
          }
          return [[`data-prop-${key.toLowerCase()}`, String(value)]];
        });
        const setRef = (node: HTMLDivElement | null) => {
          nodeRef = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        };
        return React.createElement(
          'div',
          { ref: setRef, 'data-konva-node': name, ...Object.fromEntries(entries) },
          children as React.ReactNode,
        );
      },
    );
  },
}));

vi.mock('react-konva', () => ({
  Circle: makeKonvaNode('Circle'),
  Line: makeKonvaNode('Line'),
}));

import { LineItemView } from './LineItemView';

describe('LineItemView', () => {
  it('renders the line content and forwards body and handle interactions', () => {
    const line = createLineItem({ id: 'line', startX: 20, startY: 30, endX: 120, endY: 80 });
    const onItemPointerDown = vi.fn();
    const onBeginLineHandle = vi.fn();

    const { container } = render(
      <LineItemView
        activeTool="select"
        isSelected
        item={line}
        onBeginLineHandle={onBeginLineHandle}
        onItemPointerDown={onItemPointerDown}
        shapeRef={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
      />,
    );

    const lineNode = container.querySelector('[data-konva-node="Line"][data-prop-itemid="line"]');
    const handleNode = container.querySelector('[data-konva-node="Circle"]');

    expect(lineNode).not.toBeNull();
    expect(handleNode).not.toBeNull();

    fireEvent.mouseDown(lineNode!, { button: 0 });
    fireEvent.mouseDown(handleNode!, { button: 0 });

    expect(onItemPointerDown).toHaveBeenCalledWith(line, { x: 240, y: 160 }, false);
    expect(onBeginLineHandle).toHaveBeenCalledWith(line, 'start', { x: 240, y: 160 });
  });

  it('skips the render-item node when content rendering is disabled', () => {
    const line = createLineItem({ id: 'line' });
    const { container } = render(
      <LineItemView
        activeTool="select"
        isSelected
        item={line}
        onBeginLineHandle={vi.fn()}
        onItemPointerDown={vi.fn()}
        renderContent={false}
        shapeRef={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
      />,
    );

    expect(container.querySelector('[data-prop-itemid="line"]')).toBeNull();
  });
});
