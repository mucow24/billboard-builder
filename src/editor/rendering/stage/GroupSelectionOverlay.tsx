import { Circle, Group, Line, Rect } from 'react-konva';

import type { CanvasItem, CanvasTool } from '../../document/documentTypes';
import type { RenderableCanvasItem } from '../renderAdapter';
import {
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';

import { LineItemView } from './LineItemView';
import {
  HANDLE_FILL,
  HANDLE_STROKE,
  SELECTION_STROKE,
} from './renderConstants';
import { getCanvasOverlayMetrics } from './overlayGeometry';
import { ShapeItemView } from './ShapeItemView';

interface GroupSelectionOverlayProps {
  activeTool: CanvasTool;
  beginGroupResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginGroupRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginResize: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  groupOverlayFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  handleItemDoubleClick?: (item: CanvasItem) => void;
  handleItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  renderedSelectedItems: RenderableCanvasItem[];
  startPanDrag: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
  zoom: number;
}

export function GroupSelectionOverlay({
  activeTool,
  beginGroupResize,
  beginGroupRotate,
  beginLineHandle,
  beginResize,
  beginRotate,
  groupOverlayFrame,
  handleItemDoubleClick,
  handleItemPointerDown,
  renderedSelectedItems,
  startPanDrag,
  toCanvasPointer,
  zoom,
}: GroupSelectionOverlayProps) {
  const overlayMetrics = getCanvasOverlayMetrics(zoom);

  return (
    <>
      {renderedSelectedItems.map((selectedRenderedItem) =>
        selectedRenderedItem.kind === 'line' ? (
          <LineItemView
            key={`${selectedRenderedItem.id}-selection-outline`}
            activeTool={activeTool}
            isSelected
            item={selectedRenderedItem}
            selectableNodeId={selectedRenderedItem.selectableNodeId}
            onItemDoubleClick={handleItemDoubleClick as (item: Extract<CanvasItem, { kind: 'line' }>) => void}
            onBeginLineHandle={beginLineHandle}
            onItemPointerDown={handleItemPointerDown}
            renderContent={false}
            renderHandles={false}
            toCanvasPointer={toCanvasPointer}
            zoom={zoom}
          />
        ) : (
          <ShapeItemView
            key={`${selectedRenderedItem.id}-selection-outline`}
            activeTool={activeTool}
            isSelected
            item={selectedRenderedItem}
            selectableNodeId={selectedRenderedItem.selectableNodeId}
            onItemDoubleClick={handleItemDoubleClick as (item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>) => void}
            onBeginResize={beginResize}
            onBeginRotate={beginRotate}
            onItemPointerDown={handleItemPointerDown}
            renderContent={false}
            renderHandles={false}
            toCanvasPointer={toCanvasPointer}
            zoom={zoom}
          />
        ),
      )}
      {groupOverlayFrame ? (
        <Group
          x={groupOverlayFrame.bounds.x + groupOverlayFrame.bounds.width / 2}
          y={groupOverlayFrame.bounds.y + groupOverlayFrame.bounds.height / 2}
          rotation={groupOverlayFrame.rotation}
        >
          <Rect
            x={-groupOverlayFrame.bounds.width / 2}
            y={-groupOverlayFrame.bounds.height / 2}
            width={groupOverlayFrame.bounds.width}
            height={groupOverlayFrame.bounds.height}
            stroke={SELECTION_STROKE}
            strokeWidth={overlayMetrics.selectionStrokeWidth}
            dash={overlayMetrics.selectionDash}
            fillEnabled={false}
            listening={false}
          />
          <Line
            points={[
              0,
              -groupOverlayFrame.bounds.height / 2,
              0,
              -(groupOverlayFrame.bounds.height / 2) - overlayMetrics.rotateHandleOffset,
            ]}
            stroke={SELECTION_STROKE}
            strokeWidth={overlayMetrics.selectionStrokeWidth}
            listening={false}
          />
          {RESIZE_HANDLE_NAMES.map((handle) => {
            const width = groupOverlayFrame.bounds.width;
            const height = groupOverlayFrame.bounds.height;
            const x = handle.includes('left')
              ? -width / 2
              : handle.includes('right')
                ? width / 2
                : 0;
            const y = handle.includes('top')
              ? -height / 2
              : handle.includes('bottom')
                ? height / 2
                : 0;
            return (
              <Circle
                key={`group-${handle}`}
                x={x}
                y={y}
                radius={overlayMetrics.handleRadius}
                fill={HANDLE_FILL}
                stroke={HANDLE_STROKE}
                strokeWidth={overlayMetrics.handleStrokeWidth}
                onMouseDown={(event) => {
                  const pointer = event.target.getStage()?.getPointerPosition();
                  if (!pointer) {
                    return;
                  }
                  if (event.evt.button === 1) {
                    event.cancelBubble = true;
                    startPanDrag(pointer);
                    return;
                  }
                  event.cancelBubble = true;
                  beginGroupResize(handle, toCanvasPointer(pointer), 'overlay');
                }}
              />
            );
          })}
          <Circle
            x={0}
            y={-(groupOverlayFrame.bounds.height / 2) - overlayMetrics.rotateHandleOffset}
            radius={overlayMetrics.handleRadius}
            fill={HANDLE_FILL}
            stroke={HANDLE_STROKE}
            strokeWidth={overlayMetrics.handleStrokeWidth}
            onMouseDown={(event) => {
              const pointer = event.target.getStage()?.getPointerPosition();
              if (!pointer) {
                return;
              }
              if (event.evt.button === 1) {
                event.cancelBubble = true;
                startPanDrag(pointer);
                return;
              }
              event.cancelBubble = true;
              beginGroupRotate(toCanvasPointer(pointer), 'overlay');
            }}
          />
        </Group>
      ) : null}
    </>
  );
}
