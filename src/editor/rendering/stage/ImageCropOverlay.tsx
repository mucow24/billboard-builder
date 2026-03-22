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
import type { PointerGestureSource } from '../interactionSession';

import { ShapeItemView } from './ShapeItemView';

interface ImageCropOverlayProps {
  beginCropFullResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginCropFullRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropPan: (pointer: Point, source?: PointerGestureSource) => void;
  beginCropResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  commitCropSession: () => boolean;
  fullImageItem: ImageCanvasItem;
  previewItem: ImageCanvasItem;
  registerShapeRef: (itemId: string, node: Konva.Node | null) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

const BLACK_HANDLE_HIT_SIZE = 24;
const BLUE_HANDLE_RADIUS = 8;
const CROP_OUTLINE_UNDERLAY_WIDTH = 10;
const CROP_OUTLINE_WIDTH = 6;
const CROP_HANDLE_UNDERLAY_WIDTH = 13;
const CROP_HANDLE_WIDTH = 8;
const CROP_CORNER_LENGTH = 24;
const CROP_SIDE_HANDLE_LENGTH = 28;

function getCropHandleVisualPoints(
  item: ImageCanvasItem,
  handle: ResizeHandle,
) {
  const { width, height } = item;
  switch (handle) {
    case 'top-left':
      return [0, CROP_CORNER_LENGTH, 0, 0, CROP_CORNER_LENGTH, 0];
    case 'top-center':
      return [width / 2 - CROP_SIDE_HANDLE_LENGTH / 2, 0, width / 2 + CROP_SIDE_HANDLE_LENGTH / 2, 0];
    case 'top-right':
      return [width - CROP_CORNER_LENGTH, 0, width, 0, width, CROP_CORNER_LENGTH];
    case 'middle-left':
      return [0, height / 2 - CROP_SIDE_HANDLE_LENGTH / 2, 0, height / 2 + CROP_SIDE_HANDLE_LENGTH / 2];
    case 'middle-right':
      return [
        width,
        height / 2 - CROP_SIDE_HANDLE_LENGTH / 2,
        width,
        height / 2 + CROP_SIDE_HANDLE_LENGTH / 2,
      ];
    case 'bottom-left':
      return [0, height - CROP_CORNER_LENGTH, 0, height, CROP_CORNER_LENGTH, height];
    case 'bottom-center':
      return [
        width / 2 - CROP_SIDE_HANDLE_LENGTH / 2,
        height,
        width / 2 + CROP_SIDE_HANDLE_LENGTH / 2,
        height,
      ];
    case 'bottom-right':
      return [
        width - CROP_CORNER_LENGTH,
        height,
        width,
        height,
        width,
        height - CROP_CORNER_LENGTH,
      ];
  }
}

export function ImageCropOverlay({
  beginCropFullResize,
  beginCropFullRotate,
  beginCropPan,
  beginCropResize,
  commitCropSession,
  fullImageItem,
  previewItem,
  registerShapeRef,
  toCanvasPointer,
}: ImageCropOverlayProps) {
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
          beginCropPan(toCanvasPointer(pointer), 'overlay');
        }}
        onDblClick={(event) => {
          event.cancelBubble = true;
          commitCropSession();
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
              beginCropFullResize(handle, toCanvasPointer(pointer), 'overlay');
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
          beginCropFullRotate(toCanvasPointer(pointer), 'overlay');
        }}
      />
      <Group
        x={previewItem.x}
        y={previewItem.y}
        rotation={previewItem.rotation}
        listening={false}
      >
        <Line
          name="crop-selection-outline-underlay"
          points={[0, 0, previewItem.width, 0, previewItem.width, previewItem.height, 0, previewItem.height, 0, 0]}
          stroke="#ffffff"
          strokeWidth={CROP_OUTLINE_UNDERLAY_WIDTH}
          lineCap="square"
          lineJoin="miter"
        />
        <Line
          name="crop-selection-outline"
          points={[0, 0, previewItem.width, 0, previewItem.width, previewItem.height, 0, previewItem.height, 0, 0]}
          stroke="#111111"
          strokeWidth={CROP_OUTLINE_WIDTH}
          lineCap="square"
          lineJoin="miter"
        />
        {RESIZE_HANDLE_NAMES.map((handle) => {
          const points = getCropHandleVisualPoints(previewItem, handle);
          return (
            <Line
              key={`crop-handle-underlay-${handle}`}
              name={`crop-handle-visual-underlay ${handle}`}
              points={points}
              stroke="#ffffff"
              strokeWidth={CROP_HANDLE_UNDERLAY_WIDTH}
              lineCap="square"
              lineJoin="miter"
            />
          );
        })}
        {RESIZE_HANDLE_NAMES.map((handle) => {
          const points = getCropHandleVisualPoints(previewItem, handle);
          return (
            <Line
              key={`crop-handle-visual-${handle}`}
              name={`crop-handle-visual ${handle}`}
              points={points}
              stroke="#111111"
              strokeWidth={CROP_HANDLE_WIDTH}
              lineCap="square"
              lineJoin="miter"
            />
          );
        })}
      </Group>
      {RESIZE_HANDLE_NAMES.map((handle) => {
        const point = cropHandlePoints[handle];
        return (
          <Rect
            key={`crop-handle-${handle}`}
            name={`crop-handle-hit ${handle}`}
            x={point.x - BLACK_HANDLE_HIT_SIZE / 2}
            y={point.y - BLACK_HANDLE_HIT_SIZE / 2}
            width={BLACK_HANDLE_HIT_SIZE}
            height={BLACK_HANDLE_HIT_SIZE}
            fill="rgba(0,0,0,0.001)"
            onMouseDown={(event) => {
              const pointer = event.target.getStage()?.getPointerPosition();
              if (!pointer || event.evt.button !== 0) {
                return;
              }
              event.cancelBubble = true;
              beginCropResize(handle, toCanvasPointer(pointer), 'overlay');
            }}
          />
        );
      })}
    </>
  );
}
