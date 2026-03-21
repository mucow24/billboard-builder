import { memo, useCallback } from 'react';
import { Circle, Line } from 'react-konva';
import type Konva from 'konva';

import type { CanvasTool, LineCanvasItem } from '../../document/documentTypes';
import { getLineHandleRects, type Point } from '../interactionGeometry';

import {
  HANDLE_FILL,
  HANDLE_STROKE,
  SHADOW_MIN_ALPHA_STROKE,
} from './renderConstants';

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
  startPanDrag?: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

const NOOP_REGISTER_SHAPE_REF = () => {};

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
  registerShapeRef = NOOP_REGISTER_SHAPE_REF,
  startPanDrag,
  toCanvasPointer,
}: LineItemViewProps) {
  const lineHandleRects = getLineHandleRects(item);
  const interactionEnabled = activeTool === 'select';
  const handleShapeRef = useCallback(
    (node: Konva.Node | null) => {
      registerShapeRef(item.id, node);
    },
    [item.id, registerShapeRef],
  );

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
          listening={interactionEnabled}
          onMouseDown={(event) => {
            if (!interactionEnabled || item.locked) {
              return;
            }
            const pointer = event.target.getStage()?.getPointerPosition();
            if (!pointer) {
              return;
            }
            if (event.evt.button === 1) {
              if (!startPanDrag) {
                return;
              }
              event.cancelBubble = true;
              startPanDrag(pointer);
              return;
            }
            event.cancelBubble = true;
            onItemPointerDown(
              item,
              selectableNodeId,
              toCanvasPointer(pointer),
              event.evt.shiftKey,
              event.evt,
            );
          }}
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
            strokeWidth={Math.max(item.strokeWidth, 18)}
            hitStrokeWidth={Math.max(item.strokeWidth + 18, 24)}
            onMouseDown={(event) => {
              if (item.locked) {
                return;
              }
              const pointer = event.target.getStage()?.getPointerPosition();
              if (!pointer) {
                return;
              }
              if (event.evt.button === 1) {
                if (!startPanDrag) {
                  return;
                }
                event.cancelBubble = true;
                startPanDrag(pointer);
                return;
              }
              event.cancelBubble = true;
              onItemPointerDown(
                item,
                selectableNodeId,
                toCanvasPointer(pointer),
                event.evt.shiftKey,
                event.evt,
              );
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
                    radius={8}
                    fill={HANDLE_FILL}
                    stroke={HANDLE_STROKE}
                    strokeWidth={2}
                    onMouseDown={(event) => {
                      if (item.locked) {
                        return;
                      }
                      const pointer = event.target.getStage()?.getPointerPosition();
                      if (!pointer) {
                        return;
                      }
                      if (event.evt.button === 1) {
                        if (!startPanDrag) {
                          return;
                        }
                        event.cancelBubble = true;
                        startPanDrag(pointer);
                        return;
                      }
                      event.cancelBubble = true;
                      onBeginLineHandle(item, handle, toCanvasPointer(pointer));
                    }}
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
