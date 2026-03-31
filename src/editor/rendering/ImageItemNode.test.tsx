import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('konva', () => ({
  default: {
    Filters: {
      Brighten: Symbol('Brighten'),
      Contrast: Symbol('Contrast'),
      RGBA: Symbol('RGBA'),
      Blur: Symbol('Blur'),
    },
  },
}));

import { createImageItem } from '../document/documentDefaults';
import { ImageItemNode } from './ImageItemNode';

const {
  mockKonvaImageNode,
  mockBatchDraw,
} = vi.hoisted(() => {
  const mockBatchDraw = vi.fn();
  const mockKonvaImageNode = {
    filters: vi.fn(),
    brightness: vi.fn(),
    contrast: vi.fn(),
    red: vi.fn(),
    green: vi.fn(),
    blue: vi.fn(),
    alpha: vi.fn(),
    blurRadius: vi.fn(),
    cache: vi.fn(),
    clearCache: vi.fn(),
    getLayer: vi.fn(() => ({ batchDraw: mockBatchDraw })),
  };
  return { mockKonvaImageNode, mockBatchDraw };
});

vi.mock('react-konva', () => ({
  Group: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    ({ children, clipX, clipY, clipWidth, clipHeight }, forwardedRef) => {
      void forwardedRef;
      return (
      React.createElement(
        'div',
        {
          'data-konva-node': 'Group',
          'data-clip-x': clipX,
          'data-clip-y': clipY,
          'data-clip-width': clipWidth,
          'data-clip-height': clipHeight,
        },
        children as React.ReactNode,
      )
      );
    },
  ),
  Image: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    (
      {
        children,
        crop,
        rotation,
        shadowColor,
        shadowBlur,
        shadowOffsetX,
        shadowOffsetY,
        shadowOpacity,
        scaleX,
        width,
        height,
        x,
        y,
      },
      forwardedRef,
    ) => {
      React.useImperativeHandle(forwardedRef, () => mockKonvaImageNode as never);
      return React.createElement(
        'div',
        {
          'data-konva-node': 'Image',
          'data-crop': JSON.stringify(crop),
          'data-rotation': rotation,
          'data-shadow-color': shadowColor,
          'data-shadow-blur': shadowBlur,
          'data-shadow-offset-x': shadowOffsetX,
          'data-shadow-offset-y': shadowOffsetY,
          'data-shadow-opacity': shadowOpacity,
          'data-scale-x': scaleX,
          'data-width': width,
          'data-height': height,
          'data-x': x,
          'data-y': y,
        },
        children as React.ReactNode,
      );
    },
  ),
}));

describe('ImageItemNode', () => {
  beforeEach(() => {
    Object.values(mockKonvaImageNode).forEach((value) => {
      if (typeof value === 'function') {
        value.mockClear();
      }
    });
    mockBatchDraw.mockClear();
  });

  it('applies image adjustments through Konva filters without changing shadow props', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    item.adjustments = {
      brightness: 0,
      contrast: 100,
      tintColor: '#336699',
      tintStrength: 25,
    };
    item.shadow = {
      color: '#112233',
      blur: 4,
      offsetX: 5,
      offsetY: 6,
      opacity: 0.7,
    };
    const image = document.createElement('img');

    const { container } = render(
      <ImageItemNode item={item} image={image} renderBox={{ x: 0, y: 0, width: 40, height: 20 }} blurRadius={0} />,
    );

    const clipGroup = container.querySelector('[data-konva-node="Group"]');
    const node = container.querySelector('[data-konva-node="Image"]');
    expect(clipGroup).toHaveAttribute('data-clip-x', '0');
    expect(clipGroup).toHaveAttribute('data-clip-y', '0');
    expect(clipGroup).toHaveAttribute('data-clip-width', '40');
    expect(clipGroup).toHaveAttribute('data-clip-height', '20');
    expect(node).not.toHaveAttribute('data-crop');
    expect(node).toHaveAttribute('data-x', '0');
    expect(node).toHaveAttribute('data-y', '0');
    expect(node).toHaveAttribute('data-width', '40');
    expect(node).toHaveAttribute('data-height', '20');
    expect(node).toHaveAttribute('data-rotation', '0');
    expect(node).toHaveAttribute('data-shadow-color', '#112233');
    expect(node).toHaveAttribute('data-shadow-blur', '4');
    expect(node).toHaveAttribute('data-shadow-offset-x', '5');
    expect(node).toHaveAttribute('data-shadow-offset-y', '6');
    expect(node).toHaveAttribute('data-shadow-opacity', '0.7');

    expect(mockKonvaImageNode.brightness).toHaveBeenCalledWith(-1);
    expect(mockKonvaImageNode.contrast).toHaveBeenCalledWith(100);
    expect(mockKonvaImageNode.red).toHaveBeenCalledWith(51);
    expect(mockKonvaImageNode.green).toHaveBeenCalledWith(102);
    expect(mockKonvaImageNode.blue).toHaveBeenCalledWith(153);
    expect(mockKonvaImageNode.alpha).toHaveBeenCalledWith(0.25);
    expect(mockKonvaImageNode.cache).toHaveBeenCalled();
    expect(mockBatchDraw).toHaveBeenCalled();
  });


  it('refreshes the cached image when the render size changes', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    item.adjustments = {
      brightness: 125,
      contrast: 50,
      tintColor: '#ffffff',
      tintStrength: 0,
    };
    const image = document.createElement('img');

    const { rerender } = render(
      <ImageItemNode item={item} image={image} renderBox={{ x: 0, y: 0, width: 40, height: 20 }} blurRadius={0} />,
    );

    expect(mockKonvaImageNode.cache).toHaveBeenCalledTimes(1);
    expect(mockBatchDraw).toHaveBeenCalledTimes(1);

    Object.values(mockKonvaImageNode).forEach((value) => {
      if (typeof value === 'function') {
        value.mockClear();
      }
    });
    mockBatchDraw.mockClear();

    rerender(
      <ImageItemNode item={item} image={image} renderBox={{ x: 0, y: 0, width: 120, height: 60 }} blurRadius={0} />,
    );

    expect(mockKonvaImageNode.cache).toHaveBeenCalledTimes(1);
    expect(mockBatchDraw).toHaveBeenCalledTimes(1);
  });

  it('clears the cache for neutral settings', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });

    render(<ImageItemNode item={item} image={null} renderBox={{ x: 0, y: 0, width: 40, height: 20 }} blurRadius={0} />);

    expect(mockKonvaImageNode.filters).toHaveBeenCalledWith([]);
    expect(mockKonvaImageNode.clearCache).toHaveBeenCalled();
    expect(mockKonvaImageNode.cache).not.toHaveBeenCalled();
  });

  it('renders the full source image through the persisted source transform', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    item.sourceTransform = {
      x: -8,
      y: 3,
      width: 56,
      height: 28,
      rotation: 18,
    };

    const { container } = render(
      <ImageItemNode item={item} image={document.createElement('img')} renderBox={{ x: 0, y: 0, width: 40, height: 20 }} blurRadius={0} />,
    );

    expect(container.querySelector('[data-konva-node="Image"]')).toHaveAttribute(
      'data-x',
      '-8',
    );
    expect(container.querySelector('[data-konva-node="Image"]')).toHaveAttribute(
      'data-y',
      '3',
    );
    expect(container.querySelector('[data-konva-node="Image"]')).toHaveAttribute(
      'data-width',
      '56',
    );
    expect(container.querySelector('[data-konva-node="Image"]')).toHaveAttribute(
      'data-height',
      '28',
    );
    expect(container.querySelector('[data-konva-node="Image"]')).toHaveAttribute(
      'data-rotation',
      '18',
    );
  });

  it('mirrors the image content horizontally inside the clipped frame', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    item.mirrorHorizontal = true;
    item.sourceTransform = {
      x: -8,
      y: 3,
      width: 56,
      height: 28,
      rotation: 18,
    };

    const { container } = render(
      <ImageItemNode item={item} image={document.createElement('img')} renderBox={{ x: 0, y: 0, width: 40, height: 20 }} blurRadius={0} />,
    );

    expect(container.querySelector('[data-konva-node="Image"]')).toHaveAttribute(
      'data-x',
      '48',
    );
    expect(container.querySelector('[data-konva-node="Image"]')).toHaveAttribute(
      'data-scale-x',
      '-1',
    );
  });

  it('refreshes the Konva image when the source transform changes', () => {
    const item = createImageItem({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      originalWidth: 40,
      originalHeight: 20,
    });
    const image = document.createElement('img');

    const { rerender } = render(
      <ImageItemNode item={item} image={image} renderBox={{ x: 0, y: 0, width: 40, height: 20 }} blurRadius={0} />,
    );

    Object.values(mockKonvaImageNode).forEach((value) => {
      if (typeof value === 'function') {
        value.mockClear();
      }
    });
    mockBatchDraw.mockClear();

    rerender(
      <ImageItemNode
        item={{
          ...item,
          sourceTransform: {
            x: -4,
            y: 2,
            width: 44,
            height: 22,
            rotation: 12,
          },
        }}
        image={image}
        renderBox={{ x: 0, y: 0, width: 40, height: 20 }}
        blurRadius={0}
      />,
    );

    expect(mockBatchDraw).toHaveBeenCalledTimes(1);
    expect(mockKonvaImageNode.clearCache).toHaveBeenCalled();
  });
});
