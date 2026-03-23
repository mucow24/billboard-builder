import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createRectangleItem } from '../../document/documentDefaults';

const { makeKonvaNode } = vi.hoisted(() => ({
  makeKonvaNode(name: string) {
    return React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
      ({ children, ...props }, ref) => {
        const entries = Object.entries(props).flatMap<[string, unknown]>(([key, value]) => {
          if (value === undefined || typeof value === 'function') {
            return [];
          }
          return [[`data-prop-${key.toLowerCase()}`, String(value)]];
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

vi.mock('../useImageElement', () => ({
  useImageElement: () => null,
}));

vi.mock('../ImageItemNode', () => ({
  ImageItemNode: () => null,
}));

import { ShapeItemView } from './ShapeItemView';

describe('ShapeItemView', () => {
  it('keeps selection affordance sizing stable by scaling overlay geometry against zoom', () => {
    const rectangle = createRectangleItem({
      id: 'shape',
      x: 20,
      y: 30,
      width: 80,
      height: 40,
      rotation: 0,
    });

    const { container } = render(
      <ShapeItemView
        activeTool="select"
        isSelected
        item={rectangle}
        onBeginResize={vi.fn()}
        onBeginRotate={vi.fn()}
        onItemPointerDown={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
        zoom={2}
      />,
    );

    const outlineNode = container.querySelector('[data-konva-node="Line"][data-prop-dash="4,2"]');
    const rotaterNode = container.querySelector('[data-konva-node="Circle"][data-prop-y="5"]');

    expect(outlineNode).not.toBeNull();
    expect(outlineNode).toHaveAttribute('data-prop-strokewidth', '1');
    expect(rotaterNode).not.toBeNull();
    expect(rotaterNode).toHaveAttribute('data-prop-radius', '4');
    expect(rotaterNode).toHaveAttribute('data-prop-strokewidth', '1');
  });
});
