import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  Ellipse,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from 'react-konva';
import type Konva from 'konva';
import { getRenderableCombinedFontStyle } from '../fonts/fontStyles';

import {
  getLineHandleRects,
  getSelectionOutlinePoints,
  getShapeHandlePoints,
  getShapeHandleRects,
  localToStage,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from './interactionGeometry';
import { getGroupResizeFrame, getRenderBox, getSelectionFrameForRotation } from './transformGeometry';
import { useCanvasInteractionSession } from './useCanvasInteractionSession';
import { ImageItemNode } from './ImageItemNode';
import { useImageElement } from './useImageElement';
import type {
  CanvasItem,
  CanvasTool,
  GuideLine,
  LineCanvasItem,
  ProjectDocumentV1,
} from '../document/documentTypes';

interface CanvasStageProps {
  activeTool: CanvasTool;
  document: ProjectDocumentV1;
  selectedItemIds: string[];
  guides: GuideLine[];
  onGuidesChange: (guides: GuideLine[]) => void;
  onSelectItem: (itemId?: string) => void;
  onToggleSelectItem?: (itemId: string) => void;
  onToggleSelectItems?: (itemIds: string[]) => void;
  onUpdateItem: (itemId: string, changes: Partial<CanvasItem>) => void;
  onUpdateItems?: (changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>) => void;
  onAddItem: (item: CanvasItem) => void;
  onSetActiveTool: (tool: CanvasTool) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

type ShapeItem = Exclude<CanvasItem, LineCanvasItem>;

declare global {
  interface Window {
    __BB_TEST__?: {
      captureRenderSnapshot?: () => unknown;
    };
  }
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.2;
const BACKDROP_SIZE = 6000;
const HUD_ZOOM_STEP = 0.1;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function buildHandleDebug(clientRect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    rightMiddle: {
      x: clientRect.x + clientRect.width,
      y: clientRect.y + clientRect.height / 2,
    },
    rotater: {
      x: clientRect.x + clientRect.width / 2,
      y: clientRect.y - 50,
    },
  };
}

function toCanvasPointer(pointer: Point, zoom: number, pan: Point): Point {
  return {
    x: (pointer.x - pan.x) / zoom,
    y: (pointer.y - pan.y) / zoom,
  };
}

function toViewportPoint(point: Point, zoom: number, pan: Point): Point {
  return {
    x: pan.x + point.x * zoom,
    y: pan.y + point.y * zoom,
  };
}

function toViewportRect(
  rect: { x: number; y: number; width: number; height: number },
  zoom: number,
  pan: Point
) {
  return {
    left: pan.x + rect.x * zoom,
    top: pan.y + rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

function toOverlayStyle(rect: { left: number; top: number; width: number; height: number }) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${Math.max(1, rect.width)}px`,
    height: `${Math.max(1, rect.height)}px`,
  };
}

function parseRotationDegrees(transform: string | null): number {
  if (!transform) {
    return 0;
  }
  const match = /rotate\((-?\d+(?:\.\d+)?)deg\)/.exec(transform);
  return match ? Number(match[1]) : 0;
}

function readViewportHookRect(node: HTMLElement | null) {
  if (!node) {
    return null;
  }
  const width = Number.parseFloat(node.style.width || '0');
  const height = Number.parseFloat(node.style.height || '0');
  const left = Number.parseFloat(node.style.left || '0');
  const top = Number.parseFloat(node.style.top || '0');
  return {
    left,
    top,
    width,
    height,
    center: {
      x: left + width / 2,
      y: top + height / 2,
    },
    rotation: parseRotationDegrees(node.style.transform || null),
  };
}

function readViewportHookPoint(node: HTMLElement | null) {
  if (!node) {
    return null;
  }
  const bounds = node.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

function buildCheckerboardTiles(width: number, height: number, cellSize = 20) {
  const tiles: Array<{ x: number; y: number }> = [];
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((row + column) % 2 !== 0) {
        continue;
      }
      tiles.push({
        x: column * cellSize,
        y: row * cellSize,
      });
    }
  }

  return { cellSize, tiles };
}


const SHADOW_MIN_ALPHA_STROKE = 'rgba(0,0,0,0.001)';
const SELECTION_STROKE = '#7dd3fc';
const HANDLE_FILL = 'rgba(224, 242, 254, 0.95)';
const HANDLE_STROKE = '#0f172a';
const CANVAS_SURFACE_FILL = '#0b1220';

function ShapeItemView({
  activeTool,
  isSelected,
  item,
  onBeginResize,
  onBeginRotate,
  onItemPointerDown,
  renderContent = true,
  renderSelection = true,
  renderHandles = true,
  shapeRef,
  toCanvasPointer,
}: {
  activeTool: CanvasTool;
  isSelected: boolean;
  item: ShapeItem;
  onBeginResize: (item: ShapeItem, handle: ResizeHandle, pointer: Point) => void;
  onBeginRotate: (item: ShapeItem, pointer: Point) => void;
  onItemPointerDown: (item: ShapeItem, pointer: Point, shiftKey: boolean) => void;
  renderContent?: boolean;
  renderSelection?: boolean;
  renderHandles?: boolean;
  shapeRef: (node: Konva.Node | null) => void;
  toCanvasPointer: (pointer: Point) => Point;
}) {
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
                      if (item.locked || event.evt.button === 1) {
                        return;
                      }
                      const pointer = event.target.getStage()?.getPointerPosition();
                      if (!pointer) {
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

function LineItemView({
  activeTool,
  isSelected,
  item,
  onBeginLineHandle,
  onItemPointerDown,
  renderContent = true,
  renderSelection = true,
  renderHandles = true,
  shapeRef,
  toCanvasPointer,
}: {
  activeTool: CanvasTool;
  isSelected: boolean;
  item: LineCanvasItem;
  onBeginLineHandle: (item: LineCanvasItem, handle: 'start' | 'end', pointer: Point) => void;
  onItemPointerDown: (item: LineCanvasItem, pointer: Point, shiftKey: boolean) => void;
  renderContent?: boolean;
  renderSelection?: boolean;
  renderHandles?: boolean;
  shapeRef: (node: Konva.Node | null) => void;
  toCanvasPointer: (pointer: Point) => Point;
}) {
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
          {renderHandles ? (['start', 'end'] as const).map((handle) => {
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
          }) : null}
        </>
      ) : null}
    </>
  );
}

export function CanvasStage({
  activeTool,
  document,
  selectedItemIds,
  guides,
  onGuidesChange,
  onSelectItem,
  onToggleSelectItem,
  onToggleSelectItems,
  onUpdateItem,
  onUpdateItems,
  onAddItem,
  onSetActiveTool,
  stageRef,
}: CanvasStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isShiftPanActive, setIsShiftPanActive] = useState(false);
  const [isAltZoomActive, setIsAltZoomActive] = useState(false);
  const [lastTestHookEvent, setLastTestHookEvent] = useState<string | null>(null);
  const panDragRef = useRef<{ startPointer: Point; startPan: Point } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);

  const fitCanvasToViewport = useCallback(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const nextZoom = clampZoom(
      Math.min(
        viewportSize.width / Math.max(document.canvas.width, 1),
        viewportSize.height / Math.max(document.canvas.height, 1),
      ) * 0.9,
    );
    setZoom(nextZoom);
    setPan({
      x: (viewportSize.width - document.canvas.width * nextZoom) / 2,
      y: (viewportSize.height - document.canvas.height * nextZoom) / 2,
    });
  }, [document.canvas.height, document.canvas.width, viewportSize.height, viewportSize.width]);

  const centerPoint = useMemo(
    () => ({ x: viewportSize.width / 2, y: viewportSize.height / 2 }),
    [viewportSize.height, viewportSize.width],
  );

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setViewportSize({
        width: Math.max(320, Math.round(width)),
        height: Math.max(320, Math.round(height)),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fitCanvasToViewport();
  }, [fitCanvasToViewport]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Shift') {
        setIsShiftPanActive(true);
      }
      if (event.key === 'Alt') {
        setIsAltZoomActive(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === 'Shift') {
        setIsShiftPanActive(false);
      }
      if (event.key === 'Alt') {
        setIsAltZoomActive(false);
      }
    }

    function handleWindowBlur() {
      setIsShiftPanActive(false);
      setIsAltZoomActive(false);
      panDragRef.current = null;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);


  const getViewportPointerFromClient = useCallback((clientX: number, clientY: number) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }
    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
  }, []);

  useEffect(() => {
    function stopPanDrag() {
      if (!panDragRef.current) {
        return;
      }
      panDragRef.current = null;
      window.document.body.style.cursor = '';
    }

    function handleWindowMouseMove(event: MouseEvent) {
      const current = panDragRef.current;
      if (!current) {
        return;
      }
      const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
      if (!pointer) {
        stopPanDrag();
        return;
      }
      event.preventDefault();
      window.document.body.style.cursor = 'grabbing';
      setPan({
        x: current.startPan.x + (pointer.x - current.startPointer.x),
        y: current.startPan.y + (pointer.y - current.startPointer.y),
      });
    }

    function handleWindowMouseUp() {
      stopPanDrag();
    }

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.document.body.style.cursor = '';
    };
  }, [getViewportPointerFromClient]);
  const viewport = useMemo(
    () => ({ zoom, panX: pan.x, panY: pan.y }),
    [pan.x, pan.y, zoom],
  );

  const checkerboard = useMemo(
    () => buildCheckerboardTiles(document.canvas.width, document.canvas.height),
    [document.canvas.height, document.canvas.width],
  );

  const {
    beginGroupDrag,
    beginGroupResize,
    beginGroupRotate,
    beginLineHandle,
    beginResize,
    beginRotate,
    handleItemPointerDown,
    handleStageMouseDown,
    handleStageMouseUp,
    nodeClientRect,
    registerShapeRef,
    renderedGroupBounds,
    renderedSelectionFrame,
    renderedItems,
    renderedSelectedItems = [],
    selectedDocumentItem,
    selectedNode,
    selectedRenderedItem,
    selectedItemId,
    session,
  } = useCanvasInteractionSession({
    activeTool,
    document,
    selectedItemIds,
    onGuidesChange,
    onSelectItem,
    onToggleSelectItem,
    onToggleSelectItems,
    onUpdateItem,
    onUpdateItems,
    onAddItem,
    onSetActiveTool,
    stageRef,
    viewport,
  });
  const previewItem = session && 'previewItem' in session ? session.previewItem : null;
  const groupRotateSession = session?.kind === 'group-rotate' ? session : null;
  const groupDragSession = session?.kind === 'group-drag' ? session : null;
  const groupResizeSession = session?.kind === 'group-resize' ? session : null;
  const baseGroupFrame = renderedSelectionFrame ?? (renderedGroupBounds ? { bounds: renderedGroupBounds, rotation: 0 } : null);
  const groupOverlayFrame = groupRotateSession
    ? getSelectionFrameForRotation(
        groupRotateSession.previewItems,
        groupRotateSession.frameRotation +
          (((Math.atan2(
            groupRotateSession.currentPointer.y - (groupRotateSession.bounds.y + groupRotateSession.bounds.height / 2),
            groupRotateSession.currentPointer.x - (groupRotateSession.bounds.x + groupRotateSession.bounds.width / 2)
          ) -
            Math.atan2(
              groupRotateSession.pointerStart.y - (groupRotateSession.bounds.y + groupRotateSession.bounds.height / 2),
              groupRotateSession.pointerStart.x - (groupRotateSession.bounds.x + groupRotateSession.bounds.width / 2)
            )) *
            180) /
            Math.PI)
      )
    : groupDragSession
      ? getSelectionFrameForRotation(
          groupDragSession.previewItems,
          groupDragSession.frameRotation
        )
    : groupResizeSession
      ? getGroupResizeFrame(
          groupResizeSession.bounds,
          groupResizeSession.handle,
          groupResizeSession.currentPointer,
          groupResizeSession.frameRotation
        )
    : baseGroupFrame;

  function zoomAround(point: Point, nextZoom: number) {
    const clampedZoom = clampZoom(nextZoom);
    setPan((currentPan) => ({
      x: point.x - ((point.x - currentPan.x) / zoom) * clampedZoom,
      y: point.y - ((point.y - currentPan.y) / zoom) * clampedZoom,
    }));
    setZoom(clampedZoom);
  }

  function setZoomFromHud(nextZoom: number) {
    zoomAround(centerPoint, nextZoom);
  }

  function isPanGesture(event: MouseEvent) {
    return activeTool === 'pan' || event.button === 1 || (event.shiftKey && !session);
  }

  const stageCursor = panDragRef.current
    ? 'grabbing'
    : activeTool === 'pan' || (isShiftPanActive && !session)
      ? 'grab'
      : activeTool === 'zoom'
        ? (isAltZoomActive ? 'zoom-out' : 'zoom-in')
        : activeTool === 'select'
          ? 'default'
          : 'crosshair';

  const selectedShapeHandleRects =
    renderedSelectedItems.length <= 1 &&
    selectedRenderedItem &&
    selectedRenderedItem.kind !== 'line'
      ? getShapeHandleRects(selectedRenderedItem)
      : null;
  const selectedLineHandleRects =
    renderedSelectedItems.length <= 1 &&
    selectedRenderedItem?.kind === 'line'
      ? getLineHandleRects(selectedRenderedItem)
      : null;
  const marqueeViewportRect =
    session?.kind === 'marquee'
      ? toViewportRect(
          {
            x: Math.min(session.pointerStart.x, session.currentPointer.x),
            y: Math.min(session.pointerStart.y, session.currentPointer.y),
            width: Math.max(1, Math.abs(session.currentPointer.x - session.pointerStart.x)),
            height: Math.max(1, Math.abs(session.currentPointer.y - session.pointerStart.y)),
          },
          zoom,
          pan
        )
      : null;
  const groupOverlayViewportRect = groupOverlayFrame
    ? toViewportRect(groupOverlayFrame.bounds, zoom, pan)
    : null;
  const showGroupInteractionHooks = renderedSelectedItems.length > 1;
  const selectedItemViewportRect =
    renderedSelectedItems.length <= 1 && selectedRenderedItem
      ? toViewportRect(getRenderBox(selectedRenderedItem), zoom, pan)
      : null;
  const groupHandleViewportPoints = groupOverlayFrame
    ? Object.fromEntries(
        RESIZE_HANDLE_NAMES.map((handle) => {
          const width = groupOverlayFrame.bounds.width;
          const height = groupOverlayFrame.bounds.height;
          const localPoint = {
            x: handle.includes('left') ? -width / 2 : handle.includes('right') ? width / 2 : 0,
            y: handle.includes('top') ? -height / 2 : handle.includes('bottom') ? height / 2 : 0,
          };
          const center = {
            x: groupOverlayFrame.bounds.x + width / 2,
            y: groupOverlayFrame.bounds.y + height / 2,
          };
          return [
            handle,
            toViewportPoint(localToStage(localPoint, center, groupOverlayFrame.rotation), zoom, pan),
          ] as const;
        })
      )
    : null;
  const groupRotaterViewportPoint = groupOverlayFrame
    ? toViewportPoint(
        localToStage(
          { x: 0, y: -(groupOverlayFrame.bounds.height / 2) - 50 },
          {
            x: groupOverlayFrame.bounds.x + groupOverlayFrame.bounds.width / 2,
            y: groupOverlayFrame.bounds.y + groupOverlayFrame.bounds.height / 2,
          },
          groupOverlayFrame.rotation
        ),
        zoom,
        pan
      )
    : null;
  const debugInfo = {
    stageSize: viewportSize,
    canvasSize: {
      width: document.canvas.width,
      height: document.canvas.height,
    },
    viewport,
    sessionKind: session?.kind ?? null,
    sessionHandle:
      session?.kind === 'resize' ||
      session?.kind === 'rotate' ||
      session?.kind === 'line-handle' ||
      session?.kind === 'group-resize' ||
      session?.kind === 'group-rotate'
        ? session.handle
        : null,
    activeAnchor:
      session?.kind === 'resize' ||
      session?.kind === 'rotate' ||
      session?.kind === 'group-resize' ||
      session?.kind === 'group-rotate'
        ? session.handle
        : null,
    documentItem: selectedDocumentItem
      ? {
          ...getRenderBox(selectedDocumentItem),
          rotation: selectedDocumentItem.rotation,
          kind: selectedDocumentItem.kind,
          id: selectedDocumentItem.id,
        }
      : null,
    previewItem: previewItem
      ? {
          ...getRenderBox(previewItem),
          rotation: previewItem.rotation,
          kind: previewItem.kind,
          id: previewItem.id,
        }
      : null,
    node: selectedNode
      ? {
          x: selectedNode.x(),
          y: selectedNode.y(),
          rotation: selectedNode.rotation(),
          scaleX: selectedNode.scaleX(),
          scaleY: selectedNode.scaleY(),
        }
      : null,
    nodeClientRect,
    anchorClientRects:
      selectedRenderedItem && selectedRenderedItem.kind !== 'line'
        ? getShapeHandleRects(selectedRenderedItem)
        : null,
    handles: nodeClientRect ? buildHandleDebug(nodeClientRect) : null,
    lineHandleRects:
      selectedRenderedItem?.kind === 'line' ? getLineHandleRects(selectedRenderedItem) : null,
    selectedItemViewportRect,
    marqueeViewportRect,
    groupOverlayViewportRect,
    groupHandleViewportPoints,
    groupRotaterViewportPoint,
    selectedItems: renderedSelectedItems.map((item) => item.kind === 'line'
      ? {
          ...getRenderBox(item),
          kind: item.kind,
          id: item.id,
          rotation: 0,
          startX: item.startX,
          startY: item.startY,
          endX: item.endX,
          endY: item.endY,
        }
      : {
          ...getRenderBox(item),
          kind: item.kind,
          id: item.id,
          rotation: item.rotation,
        }),
    groupFrame: groupOverlayFrame
      ? {
          ...groupOverlayFrame.bounds,
          rotation: groupOverlayFrame.rotation,
        }
      : null,
    lastTestHookEvent,
  };

  useEffect(() => {
    function captureRenderSnapshot() {
      const stage = stageRef.current;
      const root = viewportRef.current;
      if (!stage || !root) {
        return null;
      }

      const selectedItems = renderedItems
        .filter((item) => selectedItemIds.includes(item.id))
        .map((item) => {
          const node = stage.findOne(`#render-item-${item.id}`);
          if (!node) {
            return null;
          }

          if (item.kind === 'line') {
            const points = (node as Konva.Line).points();
            return {
              id: item.id,
              kind: item.kind,
              outlinePoints: [
                { x: points[0], y: points[1] },
                { x: points[2], y: points[3] },
              ],
              geometry: {
                x: Math.min(points[0], points[2]),
                y: Math.min(points[1], points[3]),
                width: Math.max(1, Math.abs(points[2] - points[0])),
                height: Math.max(1, Math.abs(points[3] - points[1])),
                rotation: 0,
              },
            };
          }

          const renderWidth = Number(node.getAttr('renderWidth') ?? 0);
          const renderHeight = Number(node.getAttr('renderHeight') ?? 0);
          const origin = {
            x: node.x(),
            y: node.y(),
          };
          const rotation = node.rotation();
          const outlinePoints = [
            localToStage({ x: 0, y: 0 }, origin, rotation),
            localToStage({ x: renderWidth, y: 0 }, origin, rotation),
            localToStage({ x: renderWidth, y: renderHeight }, origin, rotation),
            localToStage({ x: 0, y: renderHeight }, origin, rotation),
          ];
          return {
            id: item.id,
            kind: item.kind,
            outlinePoints,
            geometry: {
              x: origin.x,
              y: origin.y,
              width: renderWidth,
              height: renderHeight,
              rotation,
            },
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const overlay = readViewportHookRect(root.querySelector<HTMLElement>('[data-testid="canvas-group-overlay"]'));
      const handles = Object.fromEntries(
        RESIZE_HANDLE_NAMES.flatMap((handle) => {
          const point = readViewportHookPoint(
            root.querySelector<HTMLElement>(`[data-testid="canvas-group-handle-${handle}"]`)
          );
          return point ? [[handle, point] as const] : [];
        })
      );
      const rotater = readViewportHookPoint(root.querySelector<HTMLElement>('[data-testid="canvas-group-rotater"]'));

      const canvasOverlay = overlay
        ? {
            x: (overlay.left - pan.x) / zoom,
            y: (overlay.top - pan.y) / zoom,
            width: overlay.width / zoom,
            height: overlay.height / zoom,
            center: {
              x: (overlay.center.x - pan.x) / zoom,
              y: (overlay.center.y - pan.y) / zoom,
            },
            rotation: overlay.rotation,
            viewportRect: overlay,
          }
        : null;

      return {
        sessionKind: session?.kind ?? null,
        sessionHandle:
          session?.kind === 'resize' ||
          session?.kind === 'rotate' ||
          session?.kind === 'line-handle' ||
          session?.kind === 'group-resize' ||
          session?.kind === 'group-rotate'
            ? session.handle
            : null,
        viewport: {
          zoom,
          panX: pan.x,
          panY: pan.y,
        },
        selectedItemIds: [...selectedItemIds],
        selectedItems,
        groupOverlay: canvasOverlay,
        groupHandles: handles,
        groupRotater: rotater,
      };
    }

    window.__BB_TEST__ = {
      ...window.__BB_TEST__,
      captureRenderSnapshot,
    };

    return () => {
      if (!window.__BB_TEST__) {
        return;
      }
      delete window.__BB_TEST__.captureRenderSnapshot;
      if (Object.keys(window.__BB_TEST__).length === 0) {
        delete window.__BB_TEST__;
      }
    };
  }, [pan.x, pan.y, renderedItems, selectedItemIds, session, stageRef, zoom]);

  return (
    <div className="canvas-stage-screen" ref={viewportRef} data-testid="canvas-stage-root">
      <div className="canvas-hud">
        <div className="canvas-hud-pill" data-testid="canvas-size">
          {document.canvas.width} x {document.canvas.height}
        </div>
        <div className="canvas-hud-pill" data-testid="guide-count">Guides: {guides.length}</div>
        <div className="canvas-hud-controls" aria-label="Viewport controls">
          <button
            type="button"
            className="canvas-hud-button"
            aria-label="Zoom out"
            onClick={() => setZoomFromHud(zoom - HUD_ZOOM_STEP)}
          >
            −
          </button>
          <span className="canvas-hud-pill canvas-hud-readout" data-testid="viewport-zoom">
            Zoom: {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="canvas-hud-button"
            aria-label="Zoom in"
            onClick={() => setZoomFromHud(zoom + HUD_ZOOM_STEP)}
          >
            +
          </button>
          <button
            type="button"
            className="canvas-hud-button"
            aria-label="Set zoom to 100%"
            onClick={() => setZoomFromHud(1)}
          >
            100%
          </button>
          <button
            type="button"
            className="canvas-hud-button"
            aria-label="Fit canvas to viewport"
            onClick={fitCanvasToViewport}
          >
            Fit
          </button>
        </div>
      </div>
      <Stage
        ref={stageRef}
        width={viewportSize.width}
        height={viewportSize.height}
        className="editor-stage editor-stage-fullscreen"
        style={{
          cursor: stageCursor,
        }}
        onWheel={(event) => {
          event.evt.preventDefault();
          const pointer = event.target.getStage()?.getPointerPosition();
          if (!pointer) {
            return;
          }
          const direction = event.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
          zoomAround(pointer, zoom * direction);
        }}
        onMouseDown={(event) => {
          const stage = event.target.getStage();
          const pointer = stage?.getPointerPosition();
          if (pointer && isPanGesture(event.evt)) {
            event.evt.preventDefault();
            panDragRef.current = {
              startPointer: pointer,
              startPan: { x: pan.x, y: pan.y },
            };
            window.document.body.style.cursor = 'grabbing';
            return;
          }
          if (activeTool === 'zoom' && pointer) {
            zoomAround(pointer, zoom * (event.evt.altKey ? 1 / ZOOM_STEP : ZOOM_STEP));
            return;
          }
          handleStageMouseDown(event);
        }}
        onMouseMove={(event) => {
          const current = panDragRef.current;
          const stage = event.target.getStage();
          const pointer = stage?.getPointerPosition();
          if (!current || !pointer) {
            return;
          }
          event.evt.preventDefault();
          setPan({
            x: current.startPan.x + (pointer.x - current.startPointer.x),
            y: current.startPan.y + (pointer.y - current.startPointer.y),
          });
        }}
        onMouseUp={(event) => {
          if (panDragRef.current) {
            panDragRef.current = null;
            window.document.body.style.cursor = '';
            return;
          }
          handleStageMouseUp(event);
        }}
        onMouseLeave={() => {
          if (panDragRef.current) {
            window.document.body.style.cursor = 'grabbing';
          }
        }}
      >
        <Layer>
          <Rect
            name="canvas-backdrop canvas-surface export-exclude"
            x={-BACKDROP_SIZE / 2}
            y={-BACKDROP_SIZE / 2}
            width={BACKDROP_SIZE}
            height={BACKDROP_SIZE}
            fill="rgba(0,0,0,0)"
          />
          <Group
            x={pan.x}
            y={pan.y}
            scaleX={zoom}
            scaleY={zoom}
            name="export-root"
            width={document.canvas.width}
            height={document.canvas.height}
          >
            <Rect
              name="export-exclude"
              x={-2}
              y={-2}
              width={document.canvas.width + 4}
              height={document.canvas.height + 4}
              cornerRadius={0}
              fill="rgba(0,0,0,0)"
              stroke="rgba(128, 176, 255, 0.18)"
              strokeWidth={1}
              shadowColor="rgba(110, 160, 255, 0.14)"
              shadowBlur={18}
              shadowOpacity={1}
              listening={false}
            />
            <Rect
              name="canvas-background canvas-surface export-exclude"
              x={0}
              y={0}
              width={document.canvas.width}
              height={document.canvas.height}
              cornerRadius={0}
              fill={CANVAS_SURFACE_FILL}
              stroke="rgba(0, 0, 0, 0.14)"
              strokeWidth={1}
              listening={false}
            />
            <Group name="export-content" clipX={0} clipY={0} clipWidth={document.canvas.width} clipHeight={document.canvas.height}>
              <Group name="checkerboard export-exclude">
                {checkerboard.tiles.map((tile) => (
                <Rect
                  key={`checker-${tile.x}-${tile.y}`}
                  x={tile.x}
                  y={tile.y}
                  width={checkerboard.cellSize}
                  height={checkerboard.cellSize}
                  fill="rgba(255,255,255,0.025)"
                  name="canvas-surface"
                  listening={false}
                />
              ))}
              </Group>
              <Rect
                x={0}
                y={0}
                width={document.canvas.width}
                height={document.canvas.height}
                fill={document.background}
                name="canvas-surface"
                listening={false}
              />
              {renderedItems.map((item) =>
                item.kind === 'line' ? (
                  <LineItemView
                    key={item.id}
                    activeTool={activeTool}
                    isSelected={item.id === selectedItemId}
                    item={item}
                    onBeginLineHandle={beginLineHandle}
                    onItemPointerDown={handleItemPointerDown}
                    renderSelection={false}
                    shapeRef={(node) => registerShapeRef(item.id, node)}
                    toCanvasPointer={(pointer) => toCanvasPointer(pointer, zoom, pan)}
                  />
                ) : (
                  <ShapeItemView
                    key={item.id}
                    activeTool={activeTool}
                    isSelected={item.id === selectedItemId}
                    item={item}
                    onBeginResize={beginResize}
                    onBeginRotate={beginRotate}
                    onItemPointerDown={handleItemPointerDown}
                    renderSelection={false}
                    shapeRef={(node) => registerShapeRef(item.id, node)}
                    toCanvasPointer={(pointer) => toCanvasPointer(pointer, zoom, pan)}
                  />
                ),
              )}
              {session?.kind === 'marquee' ? (
                <Group name="marquee-preview export-exclude">
                  <Rect
                    x={Math.min(session.pointerStart.x, session.currentPointer.x)}
                    y={Math.min(session.pointerStart.y, session.currentPointer.y)}
                    width={Math.max(1, Math.abs(session.currentPointer.x - session.pointerStart.x))}
                    height={Math.max(1, Math.abs(session.currentPointer.y - session.pointerStart.y))}
                    stroke={SELECTION_STROKE}
                    strokeWidth={1.5}
                    dash={[6, 4]}
                    fill="rgba(56, 189, 248, 0.08)"
                    listening={false}
                  />
                </Group>
              ) : null}
              {session?.kind === 'create' && session.tool === 'text' && session.previewItem && session.previewItem.kind === 'text' ? (
                <Group name="text-create-preview export-exclude">
                  <Rect
                    x={session.previewItem.x}
                    y={session.previewItem.y}
                    width={session.previewItem.width}
                    height={session.previewItem.height}
                    stroke={SELECTION_STROKE}
                    strokeWidth={1.5}
                    dash={[6, 4]}
                    fill="rgba(56, 189, 248, 0.06)"
                    listening={false}
                  />
                </Group>
              ) : null}
              <Group name="guides export-exclude">
                {guides.map((guide) =>
                  guide.orientation === 'vertical' ? (
                    <Line
                      key={`guide-v-${guide.position}`}
                      points={[guide.position, 0, guide.position, document.canvas.height]}
                      stroke={SELECTION_STROKE}
                      dash={[8, 4]}
                      listening={false}
                    />
                  ) : (
                    <Line
                      key={`guide-h-${guide.position}`}
                      points={[0, guide.position, document.canvas.width, guide.position]}
                      stroke={SELECTION_STROKE}
                      dash={[8, 4]}
                      listening={false}
                    />
                  ),
                )}
              </Group>
            </Group>
            <Group name="selection-overlay export-exclude">
              {renderedSelectedItems.length > 1 ? (
                <>
                  {renderedSelectedItems.map((selectedRenderedItem) =>
                    selectedRenderedItem.kind === 'line' ? (
                      <LineItemView
                        key={`${selectedRenderedItem.id}-selection-outline`}
                        activeTool={activeTool}
                        isSelected
                        item={selectedRenderedItem}
                        onBeginLineHandle={beginLineHandle}
                        onItemPointerDown={handleItemPointerDown}
                        renderContent={false}
                        renderHandles={false}
                        shapeRef={() => {}}
                        toCanvasPointer={(pointer) => toCanvasPointer(pointer, zoom, pan)}
                      />
                    ) : (
                      <ShapeItemView
                        key={`${selectedRenderedItem.id}-selection-outline`}
                        activeTool={activeTool}
                        isSelected
                        item={selectedRenderedItem}
                        onBeginResize={beginResize}
                        onBeginRotate={beginRotate}
                        onItemPointerDown={handleItemPointerDown}
                        renderContent={false}
                        renderHandles={false}
                        shapeRef={() => {}}
                        toCanvasPointer={(pointer) => toCanvasPointer(pointer, zoom, pan)}
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
                        fill={SHADOW_MIN_ALPHA_STROKE}
                        onMouseDown={(event) => {
                          const pointer = event.target.getStage()?.getPointerPosition();
                          if (!pointer || event.evt.button === 1) {
                            return;
                          }
                          event.cancelBubble = true;
                          beginGroupDrag(toCanvasPointer(pointer, zoom, pan));
                        }}
                      />
                      <Line
                        points={[0, -groupOverlayFrame.bounds.height / 2, 0, -(groupOverlayFrame.bounds.height / 2) - 50]}
                        stroke={SELECTION_STROKE}
                        strokeWidth={2}
                        listening={false}
                      />
                      {RESIZE_HANDLE_NAMES.map((handle) => {
                        const width = groupOverlayFrame.bounds.width;
                        const height = groupOverlayFrame.bounds.height;
                        const x = handle.includes('left') ? -width / 2 : handle.includes('right') ? width / 2 : 0;
                        const y = handle.includes('top') ? -height / 2 : handle.includes('bottom') ? height / 2 : 0;
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
                              if (!pointer || event.evt.button === 1) {
                                return;
                              }
                              event.cancelBubble = true;
                              beginGroupResize(handle, toCanvasPointer(pointer, zoom, pan));
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
                          if (!pointer || event.evt.button === 1) {
                            return;
                          }
                          event.cancelBubble = true;
                          beginGroupRotate(toCanvasPointer(pointer, zoom, pan));
                        }}
                      />
                    </Group>
                  ) : null}
                </>
              ) : selectedRenderedItem ? (
                selectedRenderedItem.kind === 'line' ? (
                <LineItemView
                  key={`${selectedRenderedItem.id}-selection`}
                  activeTool={activeTool}
                  isSelected={selectedRenderedItem.id === selectedItemId}
                  item={selectedRenderedItem}
                  onBeginLineHandle={beginLineHandle}
                  onItemPointerDown={handleItemPointerDown}
                  renderContent={false}
                  shapeRef={() => {}}
                  toCanvasPointer={(pointer) => toCanvasPointer(pointer, zoom, pan)}
                />
              ) : (
                <ShapeItemView
                  key={`${selectedRenderedItem.id}-selection`}
                  activeTool={activeTool}
                  isSelected={selectedRenderedItem.id === selectedItemId}
                  item={selectedRenderedItem}
                  onBeginResize={beginResize}
                  onBeginRotate={beginRotate}
                  onItemPointerDown={handleItemPointerDown}
                  renderContent={false}
                  shapeRef={() => {}}
                  toCanvasPointer={(pointer) => toCanvasPointer(pointer, zoom, pan)}
                />
              )
              ) : null}
            </Group>
          </Group>
        </Layer>
      </Stage>
      <div className="canvas-debug" aria-hidden="true">
        <pre data-testid="stage-debug">{JSON.stringify(debugInfo)}</pre>
        <pre data-testid="selected-item-debug">{JSON.stringify(debugInfo)}</pre>
      </div>
      <div
        aria-hidden="true"
        data-testid="canvas-test-previews"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 4,
        }}
      >
        {marqueeViewportRect ? (
          <div
            data-testid="canvas-marquee-preview"
            style={{
              position: 'absolute',
              opacity: 0,
              ...toOverlayStyle(marqueeViewportRect),
            }}
          />
        ) : null}
        {session?.kind === 'create' && session.tool === 'text' && session.previewItem && session.previewItem.kind === 'text' ? (
          <div
            data-testid="canvas-text-create-preview"
            style={{
              position: 'absolute',
              opacity: 0,
              ...toOverlayStyle(
                toViewportRect(
                  {
                    x: session.previewItem.x,
                    y: session.previewItem.y,
                    width: session.previewItem.width,
                    height: session.previewItem.height,
                  },
                  zoom,
                  pan
                )
              ),
            }}
          />
        ) : null}
      </div>
      <div
        aria-hidden="true"
        data-testid="canvas-test-hooks"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        {selectedItemViewportRect && selectedRenderedItem ? (
          <div
            data-testid="canvas-selected-item-overlay"
            onMouseDown={(event) => {
              if (event.button === 1) {
                return;
              }
              setLastTestHookEvent('selected-item-overlay');
              const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
              if (!pointer) {
                return;
              }
              handleItemPointerDown(selectedRenderedItem, toCanvasPointer(pointer, zoom, pan), false);
            }}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.001)',
              transform: `rotate(${selectedRenderedItem.rotation}deg)`,
              transformOrigin: 'center',
              ...toOverlayStyle(selectedItemViewportRect),
            }}
          />
        ) : null}
        {selectedShapeHandleRects
          ? Object.entries(selectedShapeHandleRects).map(([handle, rect]) => (
              <div
                key={`shape-handle-${handle}`}
                data-testid={`canvas-shape-handle-${handle}`}
                onMouseDown={(event) => {
                  if (!selectedRenderedItem || selectedRenderedItem.kind === 'line' || event.button === 1) {
                    return;
                  }
                  setLastTestHookEvent(`shape-handle-${handle}`);
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer) {
                    return;
                  }
                  if (handle === 'rotater') {
                    beginRotate(selectedRenderedItem, toCanvasPointer(pointer, zoom, pan));
                    return;
                  }
                  beginResize(selectedRenderedItem, handle as ResizeHandle, toCanvasPointer(pointer, zoom, pan));
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  background: 'rgba(0, 0, 0, 0.001)',
                  ...toOverlayStyle(toViewportRect(rect, zoom, pan)),
                }}
              />
            ))
          : null}
        {selectedLineHandleRects
          ? Object.entries(selectedLineHandleRects).map(([handle, rect]) => (
              <div
                key={`line-handle-${handle}`}
                data-testid={`canvas-line-handle-${handle}`}
                onMouseDown={(event) => {
                  if (!selectedRenderedItem || selectedRenderedItem.kind !== 'line' || event.button === 1) {
                    return;
                  }
                  setLastTestHookEvent(`line-handle-${handle}`);
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer) {
                    return;
                  }
                  beginLineHandle(selectedRenderedItem, handle as 'start' | 'end', toCanvasPointer(pointer, zoom, pan));
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  background: 'rgba(0, 0, 0, 0.001)',
                  ...toOverlayStyle(toViewportRect(rect, zoom, pan)),
                }}
              />
            ))
          : null}
        {showGroupInteractionHooks && groupOverlayViewportRect ? (
          <div
            data-testid="canvas-group-overlay"
            onMouseDown={(event) => {
              if (event.button === 1) {
                return;
              }
              setLastTestHookEvent('group-overlay');
              const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
              if (!pointer) {
                return;
              }
              beginGroupDrag(toCanvasPointer(pointer, zoom, pan));
            }}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.001)',
              transform: `rotate(${groupOverlayFrame?.rotation ?? 0}deg)`,
              transformOrigin: 'center',
              ...toOverlayStyle(groupOverlayViewportRect),
            }}
          />
        ) : null}
        {showGroupInteractionHooks && groupHandleViewportPoints
          ? Object.entries(groupHandleViewportPoints).map(([handle, point]) => (
              <div
                key={`group-handle-${handle}`}
                data-testid={`canvas-group-handle-${handle}`}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    return;
                  }
                  setLastTestHookEvent(`group-handle-${handle}`);
                  const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
                  if (!pointer) {
                    return;
                  }
                  beginGroupResize(handle as ResizeHandle, toCanvasPointer(pointer, zoom, pan));
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  background: 'rgba(0, 0, 0, 0.001)',
                  left: `${point.x - 8}px`,
                  top: `${point.y - 8}px`,
                  width: '16px',
                  height: '16px',
                }}
              />
            ))
          : null}
        {showGroupInteractionHooks && groupRotaterViewportPoint ? (
          <div
            data-testid="canvas-group-rotater"
            onMouseDown={(event) => {
              if (event.button === 1) {
                return;
              }
              setLastTestHookEvent('group-rotater');
              const pointer = getViewportPointerFromClient(event.clientX, event.clientY);
              if (!pointer) {
                return;
              }
              beginGroupRotate(toCanvasPointer(pointer, zoom, pan));
            }}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.001)',
              left: `${groupRotaterViewportPoint.x - 8}px`,
              top: `${groupRotaterViewportPoint.y - 8}px`,
              width: '16px',
              height: '16px',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
