import { Group, Rect } from 'react-konva';

import type { CanvasItem, CanvasTool, LineCanvasItem } from '../../document/documentTypes';
import type { Point, ResizeHandle } from '../interactionGeometry';
import {
  getOverflowClipRects,
  getOverflowRenderableItems,
} from '../overflowRendering';
import type { RenderableCanvasItem } from '../renderAdapter';

import { BACKDROP_SIZE, CANVAS_SURFACE_FILL } from './renderConstants';
import { CanvasItemLayer } from './CanvasItemLayer';

const OVERFLOW_PREVIEW_CONTENT_OPACITY = 0.15;
const OVERFLOW_PREVIEW_VEIL_OPACITY = 0.5;

interface CanvasOverflowPreviewLayerProps {
  activeTool: CanvasTool;
  canvasHeight: number;
  canvasWidth: number;
  onBeginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
  ) => void;
  onBeginResize: (
    item: Exclude<CanvasItem, LineCanvasItem>,
    handle: ResizeHandle,
    pointer: Point,
  ) => void;
  onBeginRotate: (
    item: Exclude<CanvasItem, LineCanvasItem>,
    pointer: Point,
  ) => void;
  onItemDoubleClick: (item: CanvasItem) => void;
  onItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  renderedItems: RenderableCanvasItem[];
  startPanDrag: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

export function CanvasOverflowPreviewLayer({
  activeTool,
  canvasHeight,
  canvasWidth,
  onBeginLineHandle,
  onBeginResize,
  onBeginRotate,
  onItemDoubleClick,
  onItemPointerDown,
  renderedItems,
  startPanDrag,
  toCanvasPointer,
}: CanvasOverflowPreviewLayerProps) {
  const canvasBox = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  const workspaceBox = {
    x: -BACKDROP_SIZE / 2,
    y: -BACKDROP_SIZE / 2,
    width: BACKDROP_SIZE,
    height: BACKDROP_SIZE,
  };
  const overflowItems = getOverflowRenderableItems(renderedItems, canvasBox);
  const overflowClipRects = getOverflowClipRects(canvasBox, workspaceBox);

  if (overflowItems.length === 0 || overflowClipRects.length === 0) {
    return null;
  }

  return (
    <Group name="overflow-preview-layer export-exclude">
      {overflowClipRects.map((clipRect) => (
        <Group
          key={`overflow-preview-clip-${clipRect.x}-${clipRect.y}-${clipRect.width}-${clipRect.height}`}
          name="overflow-preview-clip export-exclude"
          clipX={clipRect.x}
          clipY={clipRect.y}
          clipWidth={clipRect.width}
          clipHeight={clipRect.height}
        >
          <Group opacity={OVERFLOW_PREVIEW_CONTENT_OPACITY}>
            <CanvasItemLayer
              activeTool={activeTool}
              items={overflowItems}
              onBeginLineHandle={onBeginLineHandle}
              onBeginResize={onBeginResize}
              onBeginRotate={onBeginRotate}
              onItemDoubleClick={onItemDoubleClick}
              onItemPointerDown={onItemPointerDown}
              startPanDrag={startPanDrag}
              toCanvasPointer={toCanvasPointer}
            />
          </Group>
          <Rect
            name="overflow-preview-veil export-exclude"
            x={clipRect.x}
            y={clipRect.y}
            width={clipRect.width}
            height={clipRect.height}
            fill={CANVAS_SURFACE_FILL}
            opacity={OVERFLOW_PREVIEW_VEIL_OPACITY}
            globalCompositeOperation="source-atop"
            listening={false}
          />
        </Group>
      ))}
    </Group>
  );
}
