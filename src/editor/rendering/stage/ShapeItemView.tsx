import { Circle, Ellipse, Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';

import type { CanvasTool, LineCanvasItem, CanvasItem } from '../../document/documentTypes';
import { getRenderableCombinedFontStyle } from '../../fonts/fontStyles';
import {
  getSelectionOutlinePoints,
  getShapeHandlePoints,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';
import { ImageItemNode } from '../ImageItemNode';
import { useImageElement } from '../useImageElement';
import { getRenderBox } from '../transformGeometry';

import {
  HANDLE_FILL,
  HANDLE_STROKE,
  SELECTION_STROKE,
  SHADOW_MIN_ALPHA_STROKE,
} from './renderConstants';

type ShapeItem = Exclude<CanvasItem, LineCanvasItem>;

interface ShapeItemViewProps {
  activeTool: CanvasTool;
  isSelected: boolean;
  item: ShapeItem;
  selectableNodeId?: string;
  onItemDoubleClick?: (item: ShapeItem) => void;
  onBeginResize: (item: ShapeItem, handle: ResizeHandle, pointer: Point) => void;
  onBeginRotate: (item: ShapeItem, pointer: Point) => void;
  onItemPointerDown: (
    item: ShapeItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  renderContent?: boolean;
  renderHandles?: boolean;
  renderSelection?: boolean;
  shapeRef: (node: Konva.Node | null) => void;
  startPanDrag?: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

export function ShapeItemView({
  activeTool,
  isSelected,
  item,
  selectableNodeId = item.id,
  onItemDoubleClick,
  onBeginResize,
  onBeginRotate,
  onItemPointerDown,
  renderContent = true,
  renderHandles = true,
  renderSelection = true,
  shapeRef,
  startPanDrag,
  toCanvasPointer,
}: ShapeItemViewProps) {
  const imageElement = useImageElement(item.kind === 'image' ? item.src : '');
  const renderBox = getRenderBox(item);
  const handlePoints = getShapeHandlePoints(item);
  const outlinePoints = getSelectionOutlinePoints(item);
  const interactionEnabled = activeTool === 'select';

  return (
    <>
      {renderContent ? (
        <Group
          ref={shapeRef}
          id={`render-item-${item.id}`}
          name={`render-item render-item-${item.kind}`}
          itemId={item.id}
          itemKind={item.kind}
          renderWidth={renderBox.width}
          renderHeight={renderBox.height}
          x={renderBox.x}
          y={renderBox.y}
          rotation={item.rotation}
          opacity={item.opacity}
          visible={!item.hidden}
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
        >
          <Rect
            x={0}
            y={0}
            width={renderBox.width}
            height={renderBox.height}
            fill="rgba(0,0,0,0)"
            strokeEnabled={false}
            listening={interactionEnabled}
          />
          {item.kind === 'text' ? (
            <Text
              shadowColor={item.shadow.color}
              shadowBlur={item.shadow.blur}
              shadowOffsetX={item.shadow.offsetX}
              shadowOffsetY={item.shadow.offsetY}
              shadowOpacity={item.shadow.opacity}
              x={item.padding.left}
              y={item.padding.top}
              fill={item.fill}
              fontFamily={item.fontFamily}
              fontSize={item.fontSize}
              fontStyle={getRenderableCombinedFontStyle(item)}
              align={item.align}
              verticalAlign={item.verticalAlign}
              lineHeight={item.lineHeight}
              letterSpacing={item.letterSpacing}
              text={item.text}
              width={Math.max(1, renderBox.width - item.padding.left - item.padding.right)}
              height={Math.max(1, renderBox.height - item.padding.top - item.padding.bottom)}
              perfectDrawEnabled={false}
              listening={false}
            />
          ) : null}
          {item.kind === 'rectangle' ? (
            <Rect
              shadowColor={item.shadow.color}
              shadowBlur={item.shadow.blur}
              shadowOffsetX={item.shadow.offsetX}
              shadowOffsetY={item.shadow.offsetY}
              shadowOpacity={item.shadow.opacity}
              x={0}
              y={0}
              fill={item.fill}
              stroke={item.stroke}
              strokeWidth={item.strokeWidth}
              cornerRadius={item.cornerRadius}
              width={renderBox.width}
              height={renderBox.height}
              listening={false}
            />
          ) : null}
          {item.kind === 'ellipse' ? (
            <Ellipse
              shadowColor={item.shadow.color}
              shadowBlur={item.shadow.blur}
              shadowOffsetX={item.shadow.offsetX}
              shadowOffsetY={item.shadow.offsetY}
              shadowOpacity={item.shadow.opacity}
              x={renderBox.width / 2}
              y={renderBox.height / 2}
              fill={item.fill}
              stroke={item.stroke}
              strokeWidth={item.strokeWidth}
              radiusX={renderBox.width / 2}
              radiusY={renderBox.height / 2}
              listening={false}
            />
          ) : null}
          {item.kind === 'image' ? (
            <ImageItemNode item={item} image={imageElement} renderBox={renderBox} />
          ) : null}
        </Group>
      ) : null}
      {renderSelection && isSelected && interactionEnabled ? (
        <>
          <Group
            x={renderBox.x}
            y={renderBox.y}
            rotation={item.rotation}
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
          >
            <Rect
              x={0}
              y={0}
              width={renderBox.width}
              height={renderBox.height}
              fill={SHADOW_MIN_ALPHA_STROKE}
              strokeEnabled={false}
            />
          </Group>
          <Line
            points={[...outlinePoints, outlinePoints[0], outlinePoints[1]]}
            stroke={SELECTION_STROKE}
            strokeWidth={2}
            dash={[8, 4]}
            listening={false}
          />
          {renderHandles ? (
            <>
              <Line
                points={[
                  handlePoints['top-center'].x,
                  handlePoints['top-center'].y,
                  handlePoints.rotater.x,
                  handlePoints.rotater.y,
                ]}
                stroke={SELECTION_STROKE}
                strokeWidth={2}
                listening={false}
              />
              {RESIZE_HANDLE_NAMES.map((handle) => {
                const point = handlePoints[handle];
                return (
                  <Circle
                    key={`${item.id}-${handle}`}
                    x={point.x}
                    y={point.y}
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
                      onBeginResize(item, handle, toCanvasPointer(pointer));
                    }}
                  />
                );
              })}
              <Circle
                x={handlePoints.rotater.x}
                y={handlePoints.rotater.y}
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
                  onBeginRotate(item, toCanvasPointer(pointer));
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
