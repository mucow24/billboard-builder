import { memo, useCallback, useRef } from 'react';
import { Circle, Line } from 'react-konva';
import type Konva from 'konva';

import type { CanvasTool, LineCanvasItem } from '../../document/documentTypes';
import { getLineHandleRects, type Point } from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import { useBlurEffect } from '../useBlurEffect';

import {
  HANDLE_FILL,
  HANDLE_STROKE,
  SHADOW_MIN_ALPHA_STROKE,
} from './renderConstants';
import { NOOP } from '../noop';
import { getCanvasOverlayMetrics } from './overlayGeometry';
import { createItemPointerDownHandler } from './itemPointerHandlers';

interface LineItemViewProps {
  activeTool: CanvasTool;
  isSelected: boolean;
  item: LineCanvasItem;
  selectableNodeId?: string;
  onItemDoubleClick?: (item: LineCanvasItem) => void;
  onBeginLineHandle: (
    item: LineCanvasItem,
    handle: 'start' | 'end',
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  onItemPointerDown: (
    item: LineCanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  renderContent?: boolean;
  renderHandles?: boolean;
  renderSelection?: boolean;
  registerShapeRef?: (itemId: string, node: Konva.Node | null) => void;
  spacebarHeld?: boolean;
  startPanDrag?: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
  zoom?: number;
}

export const LineItemView = memo(function LineItemView({
  activeTool,
  isSelected,
  item,
  selectableNodeId = item.id,
  onItemDoubleClick,
  onBeginLineHandle,
  onItemPointerDown,
  renderContent = true,
  renderHandles = true,
  renderSelection = true,
  registerShapeRef = NOOP,
  spacebarHeld = false,
  startPanDrag,
  toCanvasPointer,
  zoom = 1,
}: LineItemViewProps) {
  const lineHandleRects = getLineHandleRects(item);
  const interactionEnabled = activeTool === 'select';
  const overlayMetrics = getCanvasOverlayMetrics(zoom);
  const lineNodeRef = useRef<Konva.Line | null>(null);
  const handleShapeRef = useCallback(
    (node: Konva.Line | null) => {
      lineNodeRef.current = node;
      registerShapeRef(item.id, node);
    },
    [item.id, registerShapeRef],
  );
  useBlurEffect(lineNodeRef, item.blurRadius, item);

  return (
    <>
      {renderContent ? (
        <Line
          ref={handleShapeRef}
          id={`render-item-${item.id}`}
          name="render-item render-item-line"
          itemId={item.id}
          itemKind={item.kind}
          shadowColor={item.shadow.color}
          shadowBlur={item.shadow.blur}
          shadowOffsetX={item.shadow.offsetX}
          shadowOffsetY={item.shadow.offsetY}
          shadowOpacity={item.shadow.opacity}
          points={[item.startX, item.startY, item.endX, item.endY]}
          stroke={item.stroke}
          strokeWidth={item.strokeWidth}
          opacity={item.opacity}
          visible={!item.hidden}
          hitStrokeWidth={Math.max(item.strokeWidth + 12, 20)}
          listening={interactionEnabled && !item.locked}
          onMouseDown={createItemPointerDownHandler({
            isInteractive: () => interactionEnabled && !item.locked,
            panModifierHeld: spacebarHeld,
            startPanDrag,
            toCanvasPointer,
            onAction: (pointer, shiftKey, nativeEvent) =>
              onItemPointerDown(item, selectableNodeId, pointer, shiftKey, nativeEvent),
          })}
          onTap={() => {
            if (interactionEnabled) {
              onItemPointerDown(item, selectableNodeId, { x: item.x, y: item.y }, false);
            }
          }}
          onDblClick={() => {
            if (!interactionEnabled || item.locked) {
              return;
            }
            onItemDoubleClick?.(item);
          }}
        />
      ) : null}
      {renderSelection && isSelected && interactionEnabled ? (
        <>
          <Line
            points={[item.startX, item.startY, item.endX, item.endY]}
            stroke={SHADOW_MIN_ALPHA_STROKE}
            strokeWidth={Math.max(item.strokeWidth, overlayMetrics.lineSelectionStrokeWidth)}
            hitStrokeWidth={Math.max(
              item.strokeWidth + overlayMetrics.lineSelectionStrokeWidth,
              overlayMetrics.lineSelectionHitStrokeWidth,
            )}
            onMouseDown={createItemPointerDownHandler({
              isInteractive: () => !item.locked,
              panModifierHeld: spacebarHeld,
              startPanDrag,
              toCanvasPointer,
              onAction: (pointer, shiftKey, nativeEvent) =>
                onItemPointerDown(item, selectableNodeId, pointer, shiftKey, nativeEvent),
            })}
            onDblClick={() => {
              if (!interactionEnabled || item.locked) {
                return;
              }
              onItemDoubleClick?.(item);
            }}
          />
          {renderHandles
            ? (['start', 'end'] as const).map((handle) => {
                const rect = lineHandleRects[handle];
                return (
                  <Circle
                    key={`${item.id}-${handle}`}
                    x={rect.x + rect.width / 2}
                    y={rect.y + rect.height / 2}
                    radius={overlayMetrics.handleRadius}
                    fill={HANDLE_FILL}
                    stroke={HANDLE_STROKE}
                    strokeWidth={overlayMetrics.handleStrokeWidth}
                    onMouseDown={createItemPointerDownHandler({
                      isInteractive: () => !item.locked,
                      panModifierHeld: spacebarHeld,
                      startPanDrag,
                      toCanvasPointer,
                      onAction: (pointer) => onBeginLineHandle(item, handle, pointer, 'overlay'),
                    })}
                  />
                );
              })
            : null}
        </>
      ) : null}
    </>
  );
});

LineItemView.displayName = 'LineItemView';
