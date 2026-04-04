import { memo, useCallback, useRef } from 'react';
import { Circle, Ellipse, Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';

import type { CanvasTool, GeneratorCanvasItem, LineCanvasItem, CanvasItem } from '../../document/documentTypes';
import { getRenderableCombinedFontStyle } from '../../fonts/fontStyles';
import {
  getSelectionOutlinePoints,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import { ImageItemNode } from '../ImageItemNode';
import { useBlurEffect } from '../useBlurEffect';
import { useImageElement } from '../useImageElement';
import { NOOP } from '../noop';
import { getRenderBox } from '../transformGeometry';
import { createItemPointerDownHandler } from './itemPointerHandlers';

import {
  HANDLE_FILL,
  HANDLE_STROKE,
  SELECTION_STROKE,
  SHADOW_MIN_ALPHA_STROKE,
} from './renderConstants';
import {
  getCanvasOverlayMetrics,
  getShapeOverlayHandlePoints,
} from './overlayGeometry';
import { buildGradientFillProps } from './gradientFill';

type ShapeItem = Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>;

function computeNgonPoints(width: number, height: number, sides: number): number[] {
  const offset = sides % 2 === 0 ? -Math.PI / 2 - Math.PI / sides : -Math.PI / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides + offset;
    xs.push(Math.cos(angle));
    ys.push(Math.sin(angle));
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rawW = maxX - minX;
  const rawH = maxY - minY;
  const points: number[] = [];
  for (let i = 0; i < sides; i++) {
    points.push(((xs[i] - minX) / rawW) * width);
    points.push(((ys[i] - minY) / rawH) * height);
  }
  return points;
}

interface ShapeItemViewProps {
  activeTool: CanvasTool;
  isSelected: boolean;
  item: ShapeItem;
  selectableNodeId?: string;
  onItemDoubleClick?: (item: ShapeItem) => void;
  onBeginResize: (
    item: ShapeItem,
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  onBeginRotate: (
    item: ShapeItem,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
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
  registerShapeRef?: (itemId: string, node: Konva.Node | null) => void;
  startPanDrag?: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
  zoom?: number;
}

export const ShapeItemView = memo(function ShapeItemView({
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
  registerShapeRef = NOOP,
  startPanDrag,
  toCanvasPointer,
  zoom = 1,
}: ShapeItemViewProps) {
  const imageElement = useImageElement(item.kind === 'image' ? item.src : '');
  const renderBox = getRenderBox(item);
  const interactionEnabled = activeTool === 'select';
  const gradientFillProps =
    item.kind === 'text' || item.kind === 'rectangle' || item.kind === 'ellipse' || item.kind === 'ngon'
      ? buildGradientFillProps(item, {
          width: renderBox.width,
          height: renderBox.height,
        })
      : null;
  const contentGroupRef = useRef<Konva.Group | null>(null);
  const handleShapeRef = useCallback(
    (node: Konva.Group | null) => {
      contentGroupRef.current = node;
      registerShapeRef(item.id, node);
    },
    [item.id, registerShapeRef],
  );
  useBlurEffect(contentGroupRef, item.kind === 'image' ? 0 : item.blurRadius, item);

  return (
    <>
      {renderContent ? (
        <Group
          ref={handleShapeRef}
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
          onMouseDown={createItemPointerDownHandler({
            isInteractive: () => interactionEnabled && !item.locked,
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
              fillPriority={gradientFillProps ? 'linear-gradient' : 'color'}
              {...gradientFillProps}
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
              fillPriority={gradientFillProps ? 'linear-gradient' : 'color'}
              {...gradientFillProps}
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
              fillPriority={gradientFillProps ? 'linear-gradient' : 'color'}
              {...gradientFillProps}
              listening={false}
            />
          ) : null}
          {item.kind === 'ngon' ? (
            <Line
              shadowColor={item.shadow.color}
              shadowBlur={item.shadow.blur}
              shadowOffsetX={item.shadow.offsetX}
              shadowOffsetY={item.shadow.offsetY}
              shadowOpacity={item.shadow.opacity}
              points={computeNgonPoints(renderBox.width, renderBox.height, item.sides)}
              closed={true}
              fill={item.fill}
              stroke={item.stroke}
              strokeWidth={item.strokeWidth}
              fillPriority={gradientFillProps ? 'linear-gradient' : 'color'}
              {...gradientFillProps}
              listening={false}
            />
          ) : null}
          {item.kind === 'image' ? (
            <ImageItemNode item={item} image={imageElement} renderBox={renderBox} blurRadius={item.blurRadius} />
          ) : null}
        </Group>
      ) : null}
      {renderSelection && isSelected && interactionEnabled ? (() => {
        const handlePoints = getShapeOverlayHandlePoints(item, zoom);
        const outlinePoints = getSelectionOutlinePoints(item);
        const overlayMetrics = getCanvasOverlayMetrics(zoom);
        return (
          <>
            <Group
              x={renderBox.x}
              y={renderBox.y}
              rotation={item.rotation}
              onMouseDown={createItemPointerDownHandler({
                isInteractive: () => !item.locked,
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
              strokeWidth={overlayMetrics.selectionStrokeWidth}
              dash={overlayMetrics.selectionDash}
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
                  strokeWidth={overlayMetrics.selectionStrokeWidth}
                  listening={false}
                />
                {RESIZE_HANDLE_NAMES.map((handle) => {
                  const point = handlePoints[handle];
                  return (
                    <Circle
                      key={`${item.id}-${handle}`}
                      x={point.x}
                      y={point.y}
                      radius={overlayMetrics.handleRadius}
                      fill={HANDLE_FILL}
                      stroke={HANDLE_STROKE}
                      strokeWidth={overlayMetrics.handleStrokeWidth}
                      onMouseDown={createItemPointerDownHandler({
                        isInteractive: () => !item.locked,
                        startPanDrag,
                        toCanvasPointer,
                        onAction: (pointer) => onBeginResize(item, handle, pointer, 'overlay'),
                      })}
                    />
                  );
                })}
                <Circle
                  x={handlePoints.rotater.x}
                  y={handlePoints.rotater.y}
                  radius={overlayMetrics.handleRadius}
                  fill={HANDLE_FILL}
                  stroke={HANDLE_STROKE}
                  strokeWidth={overlayMetrics.handleStrokeWidth}
                  onMouseDown={createItemPointerDownHandler({
                    isInteractive: () => !item.locked,
                    startPanDrag,
                    toCanvasPointer,
                    onAction: (pointer) => onBeginRotate(item, pointer, 'overlay'),
                  })}
                />
              </>
            ) : null}
          </>
        );
      })() : null}
    </>
  );
});

ShapeItemView.displayName = 'ShapeItemView';
