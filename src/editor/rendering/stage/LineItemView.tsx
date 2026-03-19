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
  onBeginLineHandle: (
    item: LineCanvasItem,
    handle: 'start' | 'end',
    pointer: Point,
  ) => void;
  onItemPointerDown: (
    item: LineCanvasItem,
    pointer: Point,
    shiftKey: boolean,
  ) => void;
  renderContent?: boolean;
  renderHandles?: boolean;
  renderSelection?: boolean;
  shapeRef: (node: Konva.Node | null) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

export function LineItemView({
  activeTool,
  isSelected,
  item,
  onBeginLineHandle,
  onItemPointerDown,
  renderContent = true,
  renderHandles = true,
  renderSelection = true,
  shapeRef,
  toCanvasPointer,
}: LineItemViewProps) {
  const lineHandleRects = getLineHandleRects(item);
  const interactionEnabled = activeTool === 'select';

  return (
    <>
      {renderContent ? (
        <Line
          ref={shapeRef}
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
            if (!interactionEnabled || item.locked || event.evt.button === 1) {
              return;
            }
            const pointer = event.target.getStage()?.getPointerPosition();
            if (!pointer) {
              return;
            }
            event.cancelBubble = true;
            onItemPointerDown(item, toCanvasPointer(pointer), event.evt.shiftKey);
          }}
          onTap={() => {
            if (interactionEnabled) {
              onItemPointerDown(item, { x: item.x, y: item.y }, false);
            }
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
              if (item.locked || event.evt.button === 1) {
                return;
              }
              const pointer = event.target.getStage()?.getPointerPosition();
              if (!pointer) {
                return;
              }
              event.cancelBubble = true;
              onItemPointerDown(item, toCanvasPointer(pointer), event.evt.shiftKey);
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
                      if (item.locked || event.evt.button === 1) {
                        return;
                      }
                      const pointer = event.target.getStage()?.getPointerPosition();
                      if (!pointer) {
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
}
