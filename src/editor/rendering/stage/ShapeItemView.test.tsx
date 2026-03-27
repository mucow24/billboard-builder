import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  createEllipseItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

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
  it('passes local top-to-bottom gradient props to rectangle nodes when enabled', () => {
    const rectangle = createRectangleItem({
      id: 'gradient-rect',
      width: 80,
      height: 40,
      fill: '#112233ff',
      secondaryFill: '#aabbccff',
      gradientEnabled: true,
    });

    const { container } = render(
      <ShapeItemView
        activeTool="select"
        isSelected={false}
        item={rectangle}
        onBeginResize={vi.fn()}
        onBeginRotate={vi.fn()}
        onItemPointerDown={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
      />,
    );

    const rectNode = container.querySelector('[data-konva-node="Rect"][data-prop-cornerradius="0"]');

    expect(rectNode).not.toBeNull();
    expect(rectNode).toHaveAttribute('data-prop-fillpriority', 'linear-gradient');
    expect(rectNode).toHaveAttribute('data-prop-filllineargradientstartpoint', '[object Object]');
    expect(rectNode).toHaveAttribute('data-prop-filllineargradientendpoint', '[object Object]');
    expect(rectNode).toHaveAttribute('data-prop-filllineargradientcolorstops', '0,#112233ff,1,#aabbccff');
  });

  it('anchors text gradients to the full item frame while text content stays padded', () => {
    const text = createTextItem({
      id: 'gradient-text',
      width: 160,
      height: 90,
      fill: '#224466ff',
      secondaryFill: '#88aaccee',
      gradientEnabled: true,
      padding: {
        top: 12,
        right: 10,
        bottom: 8,
        left: 6,
      },
      text: 'Gradient text',
    });

    const { container } = render(
      <ShapeItemView
        activeTool="select"
        isSelected={false}
        item={text}
        onBeginResize={vi.fn()}
        onBeginRotate={vi.fn()}
        onItemPointerDown={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
      />,
    );

    const textNode = container.querySelector('[data-konva-node="Text"]');

    expect(textNode).not.toBeNull();
    expect(textNode).toHaveAttribute('data-prop-x', '6');
    expect(textNode).toHaveAttribute('data-prop-y', '12');
    expect(textNode).toHaveAttribute('data-prop-width', '144');
    expect(textNode).toHaveAttribute('data-prop-height', '70');
    expect(textNode).toHaveAttribute('data-prop-fillpriority', 'linear-gradient');
    expect(textNode).toHaveAttribute('data-prop-filllineargradientstartpoint', '[object Object]');
    expect(textNode).toHaveAttribute('data-prop-filllineargradientendpoint', '[object Object]');
    expect(textNode).toHaveAttribute('data-prop-filllineargradientcolorstops', '0,#224466ff,1,#88aaccee');
  });

  it('keeps ellipse fills solid when gradients are disabled', () => {
    const ellipse = createEllipseItem({
      id: 'solid-ellipse',
      width: 120,
      height: 70,
      fill: '#445566ff',
      secondaryFill: '#ddeeffff',
      gradientEnabled: false,
    });

    const { container } = render(
      <ShapeItemView
        activeTool="select"
        isSelected={false}
        item={ellipse}
        onBeginResize={vi.fn()}
        onBeginRotate={vi.fn()}
        onItemPointerDown={vi.fn()}
        toCanvasPointer={(pointer) => pointer}
      />,
    );

    const ellipseNode = container.querySelector('[data-konva-node="Ellipse"]');

    expect(ellipseNode).not.toBeNull();
    expect(ellipseNode).toHaveAttribute('data-prop-fillpriority', 'color');
    expect(ellipseNode).not.toHaveAttribute('data-prop-filllineargradientstartpoint');
    expect(ellipseNode).not.toHaveAttribute('data-prop-filllineargradientendpoint');
    expect(ellipseNode).not.toHaveAttribute('data-prop-filllineargradientcolorstops');
  });

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
