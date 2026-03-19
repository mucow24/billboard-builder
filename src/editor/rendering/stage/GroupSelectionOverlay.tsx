import { Circle, Group, Line, Rect } from 'react-konva';

import type { CanvasItem, CanvasTool } from '../../document/documentTypes';
import type { RenderableCanvasItem } from '../renderAdapter';
import {
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';

import { LineItemView } from './LineItemView';
import {
  HANDLE_FILL,
  HANDLE_STROKE,
  SELECTION_STROKE,
} from './renderConstants';
import { ShapeItemView } from './ShapeItemView';

interface GroupSelectionOverlayProps {
  activeTool: CanvasTool;
  beginGroupResize: (handle: ResizeHandle, pointer: Point) => void;
  beginGroupRotate: (pointer: Point) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
  ) => void;
  beginResize: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    handle: ResizeHandle,
    pointer: Point,
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, Extract<CanvasItem, { kind: 'line' }>>,
    pointer: Point,
  ) => void;
  groupOverlayFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
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
}

export function GroupSelectionOverlay({
  activeTool,
  beginGroupResize,
  beginGroupRotate,
  beginLineHandle,
  beginResize,
  beginRotate,
  groupOverlayFrame,
  handleItemPointerDown,
  renderedSelectedItems,
  startPanDrag,
  toCanvasPointer,
}: GroupSelectionOverlayProps) {
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
            onBeginLineHandle={beginLineHandle}
            onItemPointerDown={handleItemPointerDown}
            renderContent={false}
            renderHandles={false}
            shapeRef={() => {}}
            toCanvasPointer={toCanvasPointer}
          />
        ) : (
          <ShapeItemView
            key={`${selectedRenderedItem.id}-selection-outline`}
            activeTool={activeTool}
            isSelected
            item={selectedRenderedItem}
            selectableNodeId={selectedRenderedItem.selectableNodeId}
            onBeginResize={beginResize}
            onBeginRotate={beginRotate}
            onItemPointerDown={handleItemPointerDown}
            renderContent={false}
            renderHandles={false}
            shapeRef={() => {}}
            toCanvasPointer={toCanvasPointer}
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
            strokeWidth={2}
            dash={[8, 4]}
            fillEnabled={false}
            listening={false}
          />
          <Line
            points={[
              0,
              -groupOverlayFrame.bounds.height / 2,
              0,
              -(groupOverlayFrame.bounds.height / 2) - 50,
            ]}
            stroke={SELECTION_STROKE}
            strokeWidth={2}
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
                radius={8}
                fill={HANDLE_FILL}
                stroke={HANDLE_STROKE}
                strokeWidth={2}
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
                  beginGroupResize(handle, toCanvasPointer(pointer));
                }}
              />
            );
          })}
          <Circle
            x={0}
            y={-(groupOverlayFrame.bounds.height / 2) - 50}
            radius={8}
            fill={HANDLE_FILL}
            stroke={HANDLE_STROKE}
            strokeWidth={2}
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
              beginGroupRotate(toCanvasPointer(pointer));
            }}
          />
        </Group>
      ) : null}
    </>
  );
}
