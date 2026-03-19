import { Group } from 'react-konva';

import type { Point } from '../interactionGeometry';
import {
  getOverflowClipRects,
  getOverflowRenderableItems,
} from '../overflowRendering';
import type { RenderableCanvasItem } from '../renderAdapter';

import { BACKDROP_SIZE } from './renderConstants';
import { CanvasItemLayer } from './CanvasItemLayer';

const OVERFLOW_PREVIEW_CONTENT_OPACITY = 0.38;

interface CanvasOverflowPreviewLayerProps {
  canvasHeight: number;
  canvasWidth: number;
  renderedItems: RenderableCanvasItem[];
}

function identityCanvasPointer(pointer: Point) {
  return pointer;
}

export function CanvasOverflowPreviewLayer({
  canvasHeight,
  canvasWidth,
  renderedItems,
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
    <Group name="overflow-preview-layer export-exclude" listening={false}>
      {overflowClipRects.map((clipRect) => (
        <Group
          key={`overflow-preview-clip-${clipRect.x}-${clipRect.y}-${clipRect.width}-${clipRect.height}`}
          name="overflow-preview-clip export-exclude"
          clipX={clipRect.x}
          clipY={clipRect.y}
          clipWidth={clipRect.width}
          clipHeight={clipRect.height}
          listening={false}
        >
          <Group opacity={OVERFLOW_PREVIEW_CONTENT_OPACITY} listening={false}>
            <CanvasItemLayer
              activeTool="pan"
              interactive={false}
              items={overflowItems}
              toCanvasPointer={identityCanvasPointer}
            />
          </Group>
        </Group>
      ))}
    </Group>
  );
}
