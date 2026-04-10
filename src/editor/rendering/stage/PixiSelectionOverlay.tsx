import { useCallback, useMemo } from 'react';
import { Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

import type {
  CanvasItem,
  GeneratorCanvasItem,
  LineCanvasItem,
} from '../../document/documentTypes';
import {
  localToStage,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import type { RenderableCanvasItem } from '../renderAdapter';
import { getRenderBox } from '../transformGeometry';

// ── Colours ──────────────────────────────────────────────────────────────────
const SELECTION_STROKE = 0x7dd3fc;
const HANDLE_FILL = 0xe0f2fe;
const HANDLE_FILL_ALPHA = 0.95;
const HANDLE_STROKE = 0x0f172a;

// ── Base overlay dimensions (divided by zoom at draw time) ───────────────────
const BASE_HANDLE_RADIUS = 8;
const BASE_HANDLE_STROKE_WIDTH = 2;
const BASE_SELECTION_STROKE_WIDTH = 2;
const BASE_ROTATE_HANDLE_OFFSET = 50;

function getZoomScaledDimensions(zoom: number) {
  const nz = zoom > 0 ? zoom : 1;
  return {
    nz,
    selectionStroke: BASE_SELECTION_STROKE_WIDTH / nz,
    handleRadius: BASE_HANDLE_RADIUS / nz,
    handleStroke: BASE_HANDLE_STROKE_WIDTH / nz,
    rotateOffset: BASE_ROTATE_HANDLE_OFFSET / nz,
  };
}

// ── Handle cursor map ────────────────────────────────────────────────────────
const HANDLE_CURSORS: Record<string, string> = {
  'top-left': 'nwse-resize',
  'top-center': 'ns-resize',
  'top-right': 'nesw-resize',
  'middle-left': 'ew-resize',
  'middle-right': 'ew-resize',
  'bottom-left': 'nesw-resize',
  'bottom-center': 'ns-resize',
  'bottom-right': 'nwse-resize',
  rotater: 'crosshair',
  start: 'move',
  end: 'move',
};

// ── Generic interactive handle ───────────────────────────────────────────────

function InteractiveHandle({
  name,
  x,
  y,
  radius,
  strokeWidth,
  onMouseDown,
}: {
  name: string;
  x: number;
  y: number;
  radius: number;
  strokeWidth: number;
  onMouseDown: (e: FederatedPointerEvent) => void;
}) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, radius);
      g.fill({ color: HANDLE_FILL, alpha: HANDLE_FILL_ALPHA });
      g.stroke({ color: HANDLE_STROKE, width: strokeWidth });
    },
    [radius, strokeWidth],
  );

  const hitArea = useMemo(
    () => new Rectangle(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3),
    [radius],
  );

  return (
    <pixiGraphics
      x={x}
      y={y}
      draw={draw}
      eventMode="static"
      hitArea={hitArea}
      cursor={HANDLE_CURSORS[name] ?? 'pointer'}
      onMouseDown={onMouseDown}
    />
  );
}

// ── Props ────────────────────────────────────────────────────────────────────
export interface PixiSelectionOverlayProps {
  selectedRenderedItem: RenderableCanvasItem | null;
  renderedSelectedItems: RenderableCanvasItem[];
  showGroupSelection: boolean;
  groupOverlayFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  zoom: number;
  beginResize: (
    item: Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginGroupResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginGroupRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginLineHandle: (
    item: Extract<CanvasItem, { kind: 'line' }>,
    handle: 'start' | 'end',
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  toCanvasPointer: (pointer: Point) => Point;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PixiSelectionOverlay({
  selectedRenderedItem,
  renderedSelectedItems,
  showGroupSelection,
  groupOverlayFrame,
  zoom,
  beginResize,
  beginRotate,
  beginGroupResize,
  beginGroupRotate,
  beginLineHandle,
  toCanvasPointer,
}: PixiSelectionOverlayProps) {
  const isMultiSelect = renderedSelectedItems.length > 1;

  if (isMultiSelect && showGroupSelection) {
    return (
      <pixiContainer label="multi-selection-overlay">
        {/* Outline-only for each selected item */}
        {renderedSelectedItems.map((item) => (
          <ItemOutlineOnly key={item.id} item={item} zoom={zoom} />
        ))}
        {/* Group bounding box with handles */}
        {groupOverlayFrame ? (
          <GroupSelectionOverlay
            frame={groupOverlayFrame}
            zoom={zoom}
            beginGroupResize={beginGroupResize}
            beginGroupRotate={beginGroupRotate}
            toCanvasPointer={toCanvasPointer}
          />
        ) : null}
      </pixiContainer>
    );
  }

  if (!selectedRenderedItem) return null;

  if (selectedRenderedItem.kind === 'line') {
    return (
      <LineSelectionHandles
        item={selectedRenderedItem as RenderableCanvasItem & { kind: 'line' }}
        zoom={zoom}
        beginLineHandle={beginLineHandle}
        toCanvasPointer={toCanvasPointer}
      />
    );
  }

  return (
    <ShapeSelectionOverlay
      item={selectedRenderedItem}
      zoom={zoom}
      beginResize={beginResize}
      beginRotate={beginRotate}
      toCanvasPointer={toCanvasPointer}
    />
  );
}

// ── Outline-only (used for each item in multi-select) ────────────────────────

function ItemOutlineOnly({
  item,
  zoom,
}: {
  item: RenderableCanvasItem;
  zoom: number;
}) {
  const { selectionStroke } = getZoomScaledDimensions(zoom);
  const renderBox = useMemo(() => getRenderBox(item), [item]);

  const drawOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      if (item.kind === 'line') {
        const li = item as RenderableCanvasItem & { kind: 'line' };
        g.moveTo(li.startX, li.startY);
        g.lineTo(li.endX, li.endY);
        g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
      } else {
        g.rect(0, 0, renderBox.width, renderBox.height);
        g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
      }
    },
    [item, renderBox.width, renderBox.height, selectionStroke],
  );

  if (item.kind === 'line') {
    return <pixiGraphics draw={drawOutline} eventMode="none" />;
  }

  return (
    <pixiContainer
      x={renderBox.x}
      y={renderBox.y}
      rotation={(item.rotation * Math.PI) / 180}
    >
      <pixiGraphics draw={drawOutline} eventMode="none" />
    </pixiContainer>
  );
}

// ── Group Selection (bounding box + handles) ─────────────────────────────────

function GroupSelectionOverlay({
  frame,
  zoom,
  beginGroupResize,
  beginGroupRotate,
  toCanvasPointer,
}: {
  frame: NonNullable<PixiSelectionOverlayProps['groupOverlayFrame']>;
  zoom: number;
  beginGroupResize: PixiSelectionOverlayProps['beginGroupResize'];
  beginGroupRotate: PixiSelectionOverlayProps['beginGroupRotate'];
  toCanvasPointer: (pointer: Point) => Point;
}) {
  const { selectionStroke, handleRadius, handleStroke, rotateOffset } = getZoomScaledDimensions(zoom);

  const { bounds, rotation } = frame;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const hw = bounds.width / 2;
  const hh = bounds.height / 2;

  // Handle positions in local (center-based) coords → stage coords.
  const handlePoints = useMemo(() => {
    const origin = { x: cx, y: cy };

    const localPoints: Record<ResizeHandle | 'rotater', Point> = {
      'top-left': { x: -hw, y: -hh },
      'top-center': { x: 0, y: -hh },
      'top-right': { x: hw, y: -hh },
      'middle-left': { x: -hw, y: 0 },
      'middle-right': { x: hw, y: 0 },
      'bottom-left': { x: -hw, y: hh },
      'bottom-center': { x: 0, y: hh },
      'bottom-right': { x: hw, y: hh },
      rotater: { x: 0, y: -hh - rotateOffset },
    };

    return Object.fromEntries(
      Object.entries(localPoints).map(([name, pt]) => [
        name,
        localToStage(pt, origin, rotation),
      ]),
    ) as Record<ResizeHandle | 'rotater', Point>;
  }, [cx, cy, hw, hh, rotation, rotateOffset]);

  // Draw bounding rect (in center-based local space, inside rotated container).
  const drawGroupOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(-hw, -hh, bounds.width, bounds.height);
      g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
    },
    [hw, hh, bounds.width, bounds.height, selectionStroke],
  );

  // Rotation connecting line (stage space).
  const drawRotationLine = useCallback(
    (g: Graphics) => {
      g.clear();
      const tc = handlePoints['top-center'];
      const ro = handlePoints.rotater;
      g.moveTo(tc.x, tc.y);
      g.lineTo(ro.x, ro.y);
      g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
    },
    [handlePoints, selectionStroke],
  );

  const handleEntries = useMemo(
    () => [
      ...RESIZE_HANDLE_NAMES.map(
        (name) => [name, handlePoints[name]] as [ResizeHandle, Point],
      ),
      ['rotater', handlePoints.rotater] as ['rotater', Point],
    ],
    [handlePoints],
  );

  const groupHandleMouseDownMap = useMemo(
    () => Object.fromEntries(
      [...RESIZE_HANDLE_NAMES, 'rotater' as const].map((name) => [
        name,
        (e: FederatedPointerEvent) => {
          e.stopPropagation();
          const canvasPointer = toCanvasPointer({ x: e.global.x, y: e.global.y });
          if (name === 'rotater') {
            beginGroupRotate(canvasPointer);
          } else {
            beginGroupResize(name, canvasPointer);
          }
        },
      ]),
    ) as Record<ResizeHandle | 'rotater', (e: FederatedPointerEvent) => void>,
    [beginGroupResize, beginGroupRotate, toCanvasPointer],
  );

  return (
    <pixiContainer label="group-selection-overlay">
      {/* Group bounding rect */}
      <pixiContainer
        x={cx}
        y={cy}
        rotation={(rotation * Math.PI) / 180}
      >
        <pixiGraphics draw={drawGroupOutline} eventMode="none" />
      </pixiContainer>

      {/* Rotation line */}
      <pixiGraphics draw={drawRotationLine} eventMode="none" />

      {/* Handles */}
      {handleEntries.map(([name, point]) => (
        <InteractiveHandle
          key={name}
          name={name}
          x={point.x}
          y={point.y}
          radius={handleRadius}
          strokeWidth={handleStroke}
          onMouseDown={groupHandleMouseDownMap[name]}
        />
      ))}
    </pixiContainer>
  );
}

// ── Shape Selection (outline + resize handles + rotate handle) ───────────────

function ShapeSelectionOverlay({
  item,
  zoom,
  beginResize,
  beginRotate,
  toCanvasPointer,
}: {
  item: RenderableCanvasItem;
  zoom: number;
  beginResize: PixiSelectionOverlayProps['beginResize'];
  beginRotate: PixiSelectionOverlayProps['beginRotate'];
  toCanvasPointer: (pointer: Point) => Point;
}) {
  const { selectionStroke, handleRadius, handleStroke, rotateOffset } = getZoomScaledDimensions(zoom);

  const renderBox = useMemo(() => getRenderBox(item), [item]);

  // Compute handle positions in stage (canvas) space.
  const handlePoints = useMemo(() => {
    const origin = { x: renderBox.x, y: renderBox.y };
    const w = renderBox.width;
    const h = renderBox.height;

    const localPoints: Record<ResizeHandle | 'rotater', Point> = {
      'top-left': { x: 0, y: 0 },
      'top-center': { x: w / 2, y: 0 },
      'top-right': { x: w, y: 0 },
      'middle-left': { x: 0, y: h / 2 },
      'middle-right': { x: w, y: h / 2 },
      'bottom-left': { x: 0, y: h },
      'bottom-center': { x: w / 2, y: h },
      'bottom-right': { x: w, y: h },
      rotater: { x: w / 2, y: -rotateOffset },
    };

    return Object.fromEntries(
      Object.entries(localPoints).map(([name, pt]) => [
        name,
        localToStage(pt, origin, item.rotation),
      ]),
    ) as Record<ResizeHandle | 'rotater', Point>;
  }, [renderBox, item.rotation, rotateOffset]);

  // Draw selection outline rectangle (inside a rotated container).
  const drawOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, renderBox.width, renderBox.height);
      g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
    },
    [renderBox.width, renderBox.height, selectionStroke],
  );

  // Draw rotation connecting line (in stage space).
  const drawRotationLine = useCallback(
    (g: Graphics) => {
      g.clear();
      const tc = handlePoints['top-center'];
      const ro = handlePoints.rotater;
      g.moveTo(tc.x, tc.y);
      g.lineTo(ro.x, ro.y);
      g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
    },
    [handlePoints, selectionStroke],
  );

  const handleEntries = useMemo(
    () => [
      ...RESIZE_HANDLE_NAMES.map(
        (name) => [name, handlePoints[name]] as [ResizeHandle, Point],
      ),
      ['rotater', handlePoints.rotater] as ['rotater', Point],
    ],
    [handlePoints],
  );

  const shapeHandleMouseDownMap = useMemo(
    () => Object.fromEntries(
      [...RESIZE_HANDLE_NAMES, 'rotater' as const].map((name) => [
        name,
        (e: FederatedPointerEvent) => {
          e.stopPropagation();
          const canvasPointer = toCanvasPointer({ x: e.global.x, y: e.global.y });
          if (name === 'rotater') {
            beginRotate(
              item as Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
              canvasPointer,
            );
          } else {
            beginResize(
              item as Exclude<CanvasItem, LineCanvasItem | GeneratorCanvasItem>,
              name,
              canvasPointer,
            );
          }
        },
      ]),
    ) as Record<ResizeHandle | 'rotater', (e: FederatedPointerEvent) => void>,
    [item, beginResize, beginRotate, toCanvasPointer],
  );

  return (
    <pixiContainer label="selection-overlay">
      {/* Outline: drawn in item-local space inside a rotated container */}
      <pixiContainer
        x={renderBox.x}
        y={renderBox.y}
        rotation={(item.rotation * Math.PI) / 180}
      >
        <pixiGraphics draw={drawOutline} eventMode="none" />
      </pixiContainer>

      {/* Rotation line (stage space) */}
      <pixiGraphics draw={drawRotationLine} eventMode="none" />

      {/* Handles (stage space) */}
      {handleEntries.map(([name, point]) => (
        <InteractiveHandle
          key={name}
          name={name}
          x={point.x}
          y={point.y}
          radius={handleRadius}
          strokeWidth={handleStroke}
          onMouseDown={shapeHandleMouseDownMap[name]}
        />
      ))}
    </pixiContainer>
  );
}

// ── Line Selection (two endpoint handles) ────────────────────────────────────

function LineSelectionHandles({
  item,
  zoom,
  beginLineHandle,
  toCanvasPointer,
}: {
  item: RenderableCanvasItem & { kind: 'line' };
  zoom: number;
  beginLineHandle: PixiSelectionOverlayProps['beginLineHandle'];
  toCanvasPointer: (pointer: Point) => Point;
}) {
  const { handleRadius, handleStroke } = getZoomScaledDimensions(zoom);

  const handleStartMouseDown = useCallback(
    (e: FederatedPointerEvent) => {
      e.stopPropagation();
      beginLineHandle(
        item as Extract<CanvasItem, { kind: 'line' }>,
        'start',
        toCanvasPointer({ x: e.global.x, y: e.global.y }),
      );
    },
    [item, beginLineHandle, toCanvasPointer],
  );

  const handleEndMouseDown = useCallback(
    (e: FederatedPointerEvent) => {
      e.stopPropagation();
      beginLineHandle(
        item as Extract<CanvasItem, { kind: 'line' }>,
        'end',
        toCanvasPointer({ x: e.global.x, y: e.global.y }),
      );
    },
    [item, beginLineHandle, toCanvasPointer],
  );

  return (
    <pixiContainer label="line-selection-overlay">
      <InteractiveHandle
        name="start"
        x={item.startX}
        y={item.startY}
        radius={handleRadius}
        strokeWidth={handleStroke}
        onMouseDown={handleStartMouseDown}
      />
      <InteractiveHandle
        name="end"
        x={item.endX}
        y={item.endY}
        radius={handleRadius}
        strokeWidth={handleStroke}
        onMouseDown={handleEndMouseDown}
      />
    </pixiContainer>
  );
}
