import { Circle, Group, Line, Rect } from 'react-konva';
import type Konva from 'konva';

import type { ImageCanvasItem } from '../../document/documentTypes';
import {
  getSelectionOutlinePoints,
  getShapeHandlePoints,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';

import { ShapeItemView } from './ShapeItemView';

interface ImageCropOverlayProps {
  beginCropFullResize: (handle: ResizeHandle, pointer: Point) => void;
  beginCropFullRotate: (pointer: Point) => void;
  beginCropPan: (pointer: Point) => void;
  beginCropResize: (handle: ResizeHandle) => void;
  fullImageItem: ImageCanvasItem;
  previewItem: ImageCanvasItem;
  registerShapeRef: (itemId: string, node: Konva.Node | null) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

const BLACK_HANDLE_SIZE = 12;
const BLUE_HANDLE_RADIUS = 8;

export function ImageCropOverlay({
  beginCropFullResize,
  beginCropFullRotate,
  beginCropPan,
  beginCropResize,
  fullImageItem,
  previewItem,
  registerShapeRef,
  toCanvasPointer,
}: ImageCropOverlayProps) {
  const cropOutlinePoints = getSelectionOutlinePoints(previewItem);
  const cropHandlePoints = getShapeHandlePoints(previewItem);
  const fullOutlinePoints = getSelectionOutlinePoints(fullImageItem);
  const fullHandlePoints = getShapeHandlePoints(fullImageItem);

  return (
    <>
      <ShapeItemView
        activeTool="pan"
        isSelected={false}
        item={{
          ...fullImageItem,
          opacity: Math.min(1, fullImageItem.opacity * 0.35),
        }}
        onBeginResize={() => {}}
        onBeginRotate={() => {}}
        onItemPointerDown={() => {}}
        renderHandles={false}
        renderSelection={false}
        toCanvasPointer={toCanvasPointer}
      />
      <ShapeItemView
        activeTool="pan"
        isSelected={false}
        item={previewItem}
        onBeginResize={() => {}}
        onBeginRotate={() => {}}
        onItemPointerDown={() => {}}
        registerShapeRef={registerShapeRef}
        renderHandles={false}
        renderSelection={false}
        toCanvasPointer={toCanvasPointer}
      />
      <Group
        x={fullImageItem.x}
        y={fullImageItem.y}
        rotation={fullImageItem.rotation}
        onMouseDown={(event) => {
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer || event.evt.button !== 0) {
            return;
          }
          event.cancelBubble = true;
          beginCropPan(toCanvasPointer(pointer));
        }}
      >
        <Rect
          x={0}
          y={0}
          width={fullImageItem.width}
          height={fullImageItem.height}
          fill="rgba(0,0,0,0.001)"
        />
      </Group>
      <Line
        points={[...fullOutlinePoints, fullOutlinePoints[0], fullOutlinePoints[1]]}
        stroke="#3b82f6"
        strokeWidth={2}
        dash={[8, 4]}
      />
      {RESIZE_HANDLE_NAMES.map((handle) => {
        const point = fullHandlePoints[handle];
        return (
          <Circle
            key={`crop-full-${handle}`}
            x={point.x}
            y={point.y}
            radius={BLUE_HANDLE_RADIUS}
            fill="#ffffff"
            stroke="#3b82f6"
            strokeWidth={2}
            onMouseDown={(event) => {
              const pointer = event.target.getStage()?.getPointerPosition();
              if (!pointer || event.evt.button !== 0) {
                return;
              }
              event.cancelBubble = true;
              beginCropFullResize(handle, toCanvasPointer(pointer));
            }}
          />
        );
      })}
      <Circle
        x={fullHandlePoints.rotater.x}
        y={fullHandlePoints.rotater.y}
        radius={BLUE_HANDLE_RADIUS}
        fill="#ffffff"
        stroke="#3b82f6"
        strokeWidth={2}
        onMouseDown={(event) => {
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer || event.evt.button !== 0) {
            return;
          }
          event.cancelBubble = true;
          beginCropFullRotate(toCanvasPointer(pointer));
        }}
      />
      <Line
        points={[...cropOutlinePoints, cropOutlinePoints[0], cropOutlinePoints[1]]}
        stroke="#111111"
        strokeWidth={2}
      />
      {RESIZE_HANDLE_NAMES.map((handle) => {
        const point = cropHandlePoints[handle];
        return (
          <Rect
            key={`crop-handle-${handle}`}
            x={point.x - BLACK_HANDLE_SIZE / 2}
            y={point.y - BLACK_HANDLE_SIZE / 2}
            width={BLACK_HANDLE_SIZE}
            height={BLACK_HANDLE_SIZE}
            fill="#ffffff"
            stroke="#111111"
            strokeWidth={2}
            onMouseDown={(event) => {
              if (event.evt.button !== 0) {
                return;
              }
              event.cancelBubble = true;
              beginCropResize(handle);
            }}
          />
        );
      })}
    </>
  );
}
