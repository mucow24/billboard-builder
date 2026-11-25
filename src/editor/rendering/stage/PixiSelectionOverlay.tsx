import { useCallback, useMemo } from 'react';
import { Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

import type {
  CanvasItem,
  GeneratorCanvasItem,
  PolygonCanvasItem,
} from '../../document/documentTypes';
import { polygonEdgeCount, polygonEdgeMidpoint } from '../../document/polygonVertices';
import {
  localToStage,
  RESIZE_HANDLE_NAMES,
  type Point,
  type ResizeHandle,
} from '../interactionGeometry';
import type { PointerGestureSource } from '../interactionSession';
import type { RenderableCanvasItem } from '../renderAdapter';
import { getRenderBox } from '../transformGeometry';
import type { HoverOutline } from './hoverOutline';
import {
  BASE_POLYGON_SELECTION_OUTSET,
  getHandleFreeCore,
  handleTakesPress,
  hasTransformBox,
  showsEdgeAddHandle,
  type HandleFreeCore,
} from './overlayGeometry';

// ── Colours ──────────────────────────────────────────────────────────────────
const SELECTION_STROKE = 0x7dd3fc;
const HANDLE_FILL = 0xe0f2fe;
const HANDLE_FILL_ALPHA = 0.95;
const HANDLE_STROKE = 0x0f172a;
// Amber against the selection's sky blue: the two are told apart at a glance,
// also where a hovered item touches or overlaps the selected one.
const HOVER_STROKE = 0xfbbf24;

// ── Base overlay dimensions (divided by zoom at draw time) ───────────────────
const BASE_HANDLE_RADIUS = 8;
// A handle takes presses in a square reaching this many radii from its centre.
const HANDLE_REACH_IN_RADII = 1.5;
const BASE_HANDLE_STROKE_WIDTH = 2;
const BASE_SELECTION_STROKE_WIDTH = 2;
const BASE_ROTATE_HANDLE_OFFSET = 50;
// Thinner than the selection's: hovering only points something out.
const BASE_HOVER_STROKE_WIDTH = 1.5;
// Edge "+" insert discs are slightly smaller than vertex handles so the two
// read differently at a glance.
const BASE_EDGE_ADD_RADIUS = 6;

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
  'polygon-vertex': 'move',
  'polygon-edge-add': 'crosshair',
};

// ── Generic interactive handle ───────────────────────────────────────────────

function InteractiveHandle({
  name,
  x,
  y,
  radius,
  strokeWidth,
  fillColor = HANDLE_FILL,
  plusGlyph = false,
  freeCore = null,
  onMouseDown,
}: {
  name: string;
  x: number;
  y: number;
  radius: number;
  strokeWidth: number;
  fillColor?: number;
  // Draws a small "+" over the disc — the polygon edge-split affordance.
  plusGlyph?: boolean;
  // The middle of the selection box, where presses stay with the item. On a
  // box small on screen the handles would otherwise cover all of it, and the
  // item could be neither dragged nor double-clicked.
  freeCore?: HandleFreeCore | null;
  onMouseDown: (e: FederatedPointerEvent) => void;
}) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, radius);
      g.fill({ color: fillColor, alpha: HANDLE_FILL_ALPHA });
      g.stroke({ color: HANDLE_STROKE, width: strokeWidth });
      if (plusGlyph) {
        g.moveTo(-radius / 2, 0);
        g.lineTo(radius / 2, 0);
        g.moveTo(0, -radius / 2);
        g.lineTo(0, radius / 2);
        g.stroke({ color: HANDLE_STROKE, width: strokeWidth });
      }
    },
    [radius, strokeWidth, fillColor, plusGlyph],
  );

  const hitArea = useMemo(() => {
    const reach = radius * HANDLE_REACH_IN_RADII;
    if (!freeCore) return new Rectangle(-reach, -reach, reach * 2, reach * 2);
    const handleCenter = { x, y };
    return {
      contains: (localX: number, localY: number) =>
        handleTakesPress({ x: localX, y: localY }, handleCenter, reach, freeCore),
    };
  }, [radius, freeCore, x, y]);

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
  /**
   * Draw outlines only, no handles: the selection contains a locked item or
   * group, or a marquee is still selecting it.
   */
  hideTransformHandles?: boolean;
  groupOverlayFrame: {
    bounds: { x: number; y: number; width: number; height: number };
    rotation: number;
  } | null;
  zoom: number;
  beginResize: (
    item: Exclude<CanvasItem, GeneratorCanvasItem>,
    handle: ResizeHandle,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginRotate: (
    item: Exclude<CanvasItem, GeneratorCanvasItem>,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginGroupResize: (handle: ResizeHandle, pointer: Point, source?: PointerGestureSource) => void;
  beginGroupRotate: (pointer: Point, source?: PointerGestureSource) => void;
  beginPolygonVertexHandle: (
    item: PolygonCanvasItem,
    vertexIndex: number,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  beginPolygonEdgeInsert: (
    item: PolygonCanvasItem,
    edgeIndex: number,
    pointer: Point,
    source?: PointerGestureSource,
  ) => void;
  selectedPolygonVertexIndex: number | null;
  toCanvasPointer: (pointer: Point) => Point;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PixiSelectionOverlay({
  selectedRenderedItem,
  renderedSelectedItems,
  showGroupSelection,
  hideTransformHandles = false,
  groupOverlayFrame,
  zoom,
  beginResize,
  beginRotate,
  beginGroupResize,
  beginGroupRotate,
  beginPolygonVertexHandle,
  beginPolygonEdgeInsert,
  selectedPolygonVertexIndex,
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
            outlineOnly={hideTransformHandles}
            beginGroupResize={beginGroupResize}
            beginGroupRotate={beginGroupRotate}
            toCanvasPointer={toCanvasPointer}
          />
        ) : null}
      </pixiContainer>
    );
  }

  if (!selectedRenderedItem) return null;

  // A locked item can be selected (from Layers, or by alt-clicking it) but not
  // transformed, and an item a marquee is still selecting has nothing to grab
  // until release: either way it gets its outline only.
  if (hideTransformHandles) {
    return (
      <pixiContainer label="outline-only-selection-overlay">
        <ItemOutlineOnly item={selectedRenderedItem} zoom={zoom} />
      </pixiContainer>
    );
  }

  if (selectedRenderedItem.kind === 'polygon') {
    // Show both: the standard transform box (resize + rotate handles, pushed
    // outward so it clears the vertices) drawn first, then the on-shape
    // vertex/edge handles on top. A straight line skips the box and shows
    // only its two endpoint handles and the "+" between them.
    return (
      <>
        {hasTransformBox(selectedRenderedItem) ? (
          <ShapeSelectionOverlay
            item={selectedRenderedItem}
            zoom={zoom}
            outset={BASE_POLYGON_SELECTION_OUTSET}
            beginResize={beginResize}
            beginRotate={beginRotate}
            toCanvasPointer={toCanvasPointer}
          />
        ) : null}
        <PolygonSelectionHandles
          item={selectedRenderedItem as RenderableCanvasItem & { kind: 'polygon' }}
          zoom={zoom}
          beginPolygonVertexHandle={beginPolygonVertexHandle}
          beginPolygonEdgeInsert={beginPolygonEdgeInsert}
          selectedVertexIndex={selectedPolygonVertexIndex}
          toCanvasPointer={toCanvasPointer}
        />
      </>
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
  color = SELECTION_STROKE,
  baseStrokeWidth = BASE_SELECTION_STROKE_WIDTH,
}: {
  item: RenderableCanvasItem;
  zoom: number;
  color?: number;
  // Width on screen, divided by zoom at draw time.
  baseStrokeWidth?: number;
}) {
  const strokeWidth = baseStrokeWidth / getZoomScaledDimensions(zoom).nz;
  const renderBox = useMemo(() => getRenderBox(item), [item]);

  const drawOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      if (item.kind === 'polygon') {
        const polygon = item as RenderableCanvasItem & { kind: 'polygon' };
        drawPolygonChain(g, polygon);
      } else {
        g.rect(0, 0, renderBox.width, renderBox.height);
      }
      g.stroke({ color, width: strokeWidth });
    },
    [item, renderBox.width, renderBox.height, color, strokeWidth],
  );

  if (item.kind === 'polygon') {
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

// ── Hover outline (what a click at the pointer would select) ─────────────────

export function PixiHoverOutline({ outline, zoom }: { outline: HoverOutline; zoom: number }) {
  const strokeWidth = BASE_HOVER_STROKE_WIDTH / getZoomScaledDimensions(zoom).nz;
  // Keyed on the numbers: the outline is resolved anew on every stage render.
  const { x, y, width, height } =
    outline.kind === 'bounds' ? outline.bounds : { x: 0, y: 0, width: 0, height: 0 };

  const drawBounds = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(x, y, width, height);
      g.stroke({ color: HOVER_STROKE, width: strokeWidth });
    },
    [x, y, width, height, strokeWidth],
  );

  return (
    <pixiContainer label="hover-outline" eventMode="none">
      {outline.kind === 'item' ? (
        <ItemOutlineOnly
          item={outline.item}
          zoom={zoom}
          color={HOVER_STROKE}
          baseStrokeWidth={BASE_HOVER_STROKE_WIDTH}
        />
      ) : (
        <pixiGraphics draw={drawBounds} eventMode="none" />
      )}
    </pixiContainer>
  );
}

// ── Group Selection (bounding box + handles) ─────────────────────────────────

function GroupSelectionOverlay({
  frame,
  zoom,
  outlineOnly,
  beginGroupResize,
  beginGroupRotate,
  toCanvasPointer,
}: {
  frame: NonNullable<PixiSelectionOverlayProps['groupOverlayFrame']>;
  zoom: number;
  // No rotation line, no handles.
  outlineOnly: boolean;
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

  const freeCore = useMemo(
    () =>
      getHandleFreeCore(
        { x: cx, y: cy },
        hw * 2,
        hh * 2,
        rotation,
        handleRadius * HANDLE_REACH_IN_RADII,
      ),
    [cx, cy, hw, hh, rotation, handleRadius],
  );

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
      {outlineOnly ? null : <pixiGraphics draw={drawRotationLine} eventMode="none" />}

      {/* Handles */}
      {outlineOnly
        ? null
        : handleEntries.map(([name, point]) => (
            <InteractiveHandle
              key={name}
              name={name}
              x={point.x}
              y={point.y}
              radius={handleRadius}
              strokeWidth={handleStroke}
              freeCore={freeCore}
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
  outset = 0,
  beginResize,
  beginRotate,
  toCanvasPointer,
}: {
  item: RenderableCanvasItem;
  zoom: number;
  // Screen-space margin (divided by zoom) to push the box outward from the
  // render bounds. Non-zero only for polygons, to clear their vertex handles.
  outset?: number;
  beginResize: PixiSelectionOverlayProps['beginResize'];
  beginRotate: PixiSelectionOverlayProps['beginRotate'];
  toCanvasPointer: (pointer: Point) => Point;
}) {
  const { nz, selectionStroke, handleRadius, handleStroke, rotateOffset } = getZoomScaledDimensions(zoom);
  const outsetScaled = outset / nz;

  const renderBox = useMemo(() => getRenderBox(item), [item]);
  // The selection box, pushed outward by the outset. Handle positions and the
  // outline both derive from this box; the resize math still anchors to the
  // true render bounds (the grab-time pointerOffset absorbs the outset).
  const box = useMemo(
    () => ({
      x: renderBox.x - outsetScaled,
      y: renderBox.y - outsetScaled,
      width: renderBox.width + outsetScaled * 2,
      height: renderBox.height + outsetScaled * 2,
    }),
    [renderBox, outsetScaled],
  );

  // Compute handle positions in stage (canvas) space.
  const handlePoints = useMemo(() => {
    const origin = { x: box.x, y: box.y };
    const w = box.width;
    const h = box.height;

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
  }, [box, item.rotation, rotateOffset]);

  const freeCore = useMemo(
    () =>
      getHandleFreeCore(
        localToStage({ x: box.width / 2, y: box.height / 2 }, { x: box.x, y: box.y }, item.rotation),
        box.width,
        box.height,
        item.rotation,
        handleRadius * HANDLE_REACH_IN_RADII,
      ),
    [box, item.rotation, handleRadius],
  );

  // Draw selection outline rectangle (inside a rotated container).
  const drawOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, box.width, box.height);
      g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
    },
    [box.width, box.height, selectionStroke],
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
              item as Exclude<CanvasItem, GeneratorCanvasItem>,
              canvasPointer,
            );
          } else {
            beginResize(
              item as Exclude<CanvasItem, GeneratorCanvasItem>,
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
        x={box.x}
        y={box.y}
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
          freeCore={freeCore}
          onMouseDown={shapeHandleMouseDownMap[name]}
        />
      ))}
    </pixiContainer>
  );
}

// ── Polygon Selection (vertex handles + edge "+" insert discs) ───────────────

// Trace the polygon's vertex chain in absolute canvas coordinates (no fill or
// stroke applied — callers style it).
function drawPolygonChain(
  g: Graphics,
  polygon: Pick<PolygonCanvasItem, 'vertices' | 'closed'>,
) {
  const vertices = polygon.vertices;
  if (vertices.length < 2) return;
  g.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    g.lineTo(vertices[i].x, vertices[i].y);
  }
  if (polygon.closed) {
    g.closePath();
  }
}

function PolygonSelectionHandles({
  item,
  zoom,
  beginPolygonVertexHandle,
  beginPolygonEdgeInsert,
  selectedVertexIndex,
  toCanvasPointer,
}: {
  item: RenderableCanvasItem & { kind: 'polygon' };
  zoom: number;
  beginPolygonVertexHandle: PixiSelectionOverlayProps['beginPolygonVertexHandle'];
  beginPolygonEdgeInsert: PixiSelectionOverlayProps['beginPolygonEdgeInsert'];
  selectedVertexIndex: number | null;
  toCanvasPointer: (pointer: Point) => Point;
}) {
  const { nz, selectionStroke, handleRadius, handleStroke } = getZoomScaledDimensions(zoom);
  const edgeAddRadius = BASE_EDGE_ADD_RADIUS / nz;

  const drawOutline = useCallback(
    (g: Graphics) => {
      g.clear();
      drawPolygonChain(g, item);
      g.stroke({ color: SELECTION_STROKE, width: selectionStroke });
    },
    [item, selectionStroke],
  );

  const vertices = item.vertices;
  const edgeCount = polygonEdgeCount(vertices.length, item.closed);
  // Density gate: hide the "+" disc on edges too short on screen to host it
  // (see showsEdgeAddHandle; a line's segments need to be longer).
  const edgeHandles = useMemo(() => {
    const handles: Array<{ edgeIndex: number; point: Point }> = [];
    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
      const a = vertices[edgeIndex];
      const b = vertices[(edgeIndex + 1) % vertices.length];
      if (!showsEdgeAddHandle(Math.hypot(b.x - a.x, b.y - a.y), zoom, item.closed)) continue;
      handles.push({ edgeIndex, point: polygonEdgeMidpoint(vertices, edgeIndex) });
    }
    return handles;
  }, [vertices, edgeCount, zoom, item.closed]);

  return (
    <pixiContainer label="polygon-selection-overlay">
      <pixiGraphics draw={drawOutline} eventMode="none" />
      {/* Edge "+" first so vertex handles paint (and hit) above them. */}
      {edgeHandles.map(({ edgeIndex, point }) => (
        <InteractiveHandle
          key={`edge-${edgeIndex}`}
          name="polygon-edge-add"
          x={point.x}
          y={point.y}
          radius={edgeAddRadius}
          strokeWidth={handleStroke}
          fillColor={SELECTION_STROKE}
          plusGlyph
          onMouseDown={(e) => {
            e.stopPropagation();
            beginPolygonEdgeInsert(item, edgeIndex, toCanvasPointer({ x: e.global.x, y: e.global.y }));
          }}
        />
      ))}
      {vertices.map((vertex, vertexIndex) => (
        <InteractiveHandle
          key={`vertex-${vertexIndex}`}
          name="polygon-vertex"
          x={vertex.x}
          y={vertex.y}
          radius={handleRadius}
          strokeWidth={handleStroke}
          fillColor={vertexIndex === selectedVertexIndex ? SELECTION_STROKE : HANDLE_FILL}
          onMouseDown={(e) => {
            e.stopPropagation();
            beginPolygonVertexHandle(item, vertexIndex, toCanvasPointer({ x: e.global.x, y: e.global.y }));
          }}
        />
      ))}
    </pixiContainer>
  );
}
