import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ColorMatrixFilter, FillGradient, Graphics, Polygon, Rectangle, Texture } from 'pixi.js';
import type { FederatedPointerEvent, Filter } from 'pixi.js';
import { DropShadowFilter } from 'pixi-filters';

import { ClampingBlurFilter } from './clampingBlurFilter';
import { clampRasterResolution, getMaxTextureSize } from './rasterCaps';

import type {
  CanvasItem,
  CanvasTool,
  EllipseCanvasItem,
  GeneratorCanvasItem,
  ImageCanvasItem,
  LineCanvasItem,
  NgonCanvasItem,
  RectangleCanvasItem,
  TextCanvasItem,
} from '../../document/documentTypes';
import { getRenderableCombinedFontStyle } from '../../fonts/fontStyles';
import { getRenderableImageAdjustments } from '../imageAdjustments';
import { computeGradientEndpoints } from '../geometry/gradientGeometry';
import { computeNgonPoints } from '../geometry/ngonGeometry';
import { brightnessContrastMatrix, tintMatrix } from '../geometry/colorAdjustmentMatrix';
import { getImageNodePresentation } from '../imagePresentation';
import type { Point } from '../interactionGeometry';
import type { RenderableCanvasItem } from '../renderAdapter';
import { measureWordWrappedTextHeight } from '../textMeasurement';
import { useGeneratorCanvas } from '../../generators/useGeneratorCanvas';
import { getRenderBox } from '../transformGeometry';
import { useImageElement } from '../useImageElement';

// Stable reference so `pivot` prop doesn't trigger reconciliation every render.
const ZERO_PIVOT = { x: 0, y: 0 } as const;

// ---------------------------------------------------------------------------
// Line hit-area helper — builds a narrow polygon along the line
// ---------------------------------------------------------------------------

function buildLineHitPolygon(
  x1: number, y1: number, x2: number, y2: number, strokeWidth: number,
): Polygon {
  const pad = Math.max(strokeWidth / 2 + 8, 12);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = (-dy / len) * pad;
  const py = (dx / len) * pad;
  // Four corners of a thick line
  return new Polygon([
    x1 + px, y1 + py,
    x2 + px, y2 + py,
    x2 - px, y2 - py,
    x1 - px, y1 - py,
  ]);
}

// ---------------------------------------------------------------------------
// Gradient helper
// ---------------------------------------------------------------------------

type GradientCapable = RectangleCanvasItem | EllipseCanvasItem | NgonCanvasItem | TextCanvasItem;

function buildPixiGradient(
  item: GradientCapable,
  width: number,
  height: number,
): FillGradient | null {
  const endpoints = computeGradientEndpoints(item, width, height);
  if (!endpoints) return null;
  const grad = new FillGradient({
    type: 'linear',
    start: { x: endpoints.x0, y: endpoints.y0 },
    end: { x: endpoints.x1, y: endpoints.y1 },
    colorStops: [
      { offset: 0, color: item.fill },
      { offset: 1, color: item.secondaryFill },
    ],
    textureSpace: 'global',
  });
  return grad;
}

// ---------------------------------------------------------------------------
// Text style builder
// ---------------------------------------------------------------------------

function buildTextStyleProps(item: TextCanvasItem) {
  const effectiveStyle = getRenderableCombinedFontStyle(item);
  const fontWeight = effectiveStyle.includes('bold') ? ('bold' as const) : ('normal' as const);
  const fontStyle = effectiveStyle.includes('italic') ? ('italic' as const) : ('normal' as const);

  const renderBox = getRenderBox(item);
  const contentWidth = Math.max(1, renderBox.width - item.padding.left - item.padding.right);

  const fill = item.gradientEnabled
    ? buildPixiGradient(item, renderBox.width, renderBox.height) ?? item.fill
    : item.fill;

  // Convert app shadow model (offsetX/Y) → PixiJS dropShadow (angle+distance).
  const s = item.shadow;
  const hasShadow = s && (s.blur > 0 || s.offsetX !== 0 || s.offsetY !== 0) && s.opacity > 0;
  const dropShadow = hasShadow
    ? {
        alpha: s.opacity,
        angle: Math.atan2(s.offsetY, s.offsetX),
        blur: s.blur,
        color: s.color,
        distance: Math.sqrt(s.offsetX * s.offsetX + s.offsetY * s.offsetY),
      }
    : undefined;

  // Vertical alignment offset.
  const contentHeight = renderBox.height - item.padding.top - item.padding.bottom;
  const measuredHeight =
    measureWordWrappedTextHeight(item, renderBox.width) - item.padding.top - item.padding.bottom;
  let textY = item.padding.top;
  if (item.verticalAlign === 'middle') {
    textY += Math.max(0, (contentHeight - measuredHeight) / 2);
  } else if (item.verticalAlign === 'bottom') {
    textY += Math.max(0, contentHeight - measuredHeight);
  }

  return {
    style: {
      fontFamily: item.fontFamily,
      fontSize: item.fontSize,
      fontWeight,
      fontStyle,
      fill,
      letterSpacing: item.letterSpacing,
      lineHeight: item.fontSize * item.lineHeight,
      wordWrap: true,
      wordWrapWidth: contentWidth,
      align: item.align as 'left' | 'center' | 'right',
      whiteSpace: 'pre' as const,
      ...(dropShadow ? { dropShadow } : {}),
    },
    textX: item.padding.left,
    textY,
  };
}

// ---------------------------------------------------------------------------
// Individual item drawers
// ---------------------------------------------------------------------------

function applyFillAndStroke(
  g: Graphics,
  item: GradientCapable & { stroke: string; strokeWidth: number },
  width: number,
  height: number,
) {
  const grad = buildPixiGradient(item, width, height);
  g.fill(grad ?? item.fill);
  if (item.strokeWidth > 0 && item.stroke && item.stroke !== 'transparent') {
    g.stroke({ color: item.stroke, width: item.strokeWidth });
  }
}

function drawRectangle(g: Graphics, item: RectangleCanvasItem) {
  g.clear();
  if (item.cornerRadius > 0) {
    g.roundRect(0, 0, item.width, item.height, item.cornerRadius);
  } else {
    g.rect(0, 0, item.width, item.height);
  }
  applyFillAndStroke(g, item, item.width, item.height);
}

function drawEllipse(g: Graphics, item: EllipseCanvasItem) {
  g.clear();
  const rx = item.width / 2;
  const ry = item.height / 2;
  g.ellipse(rx, ry, rx, ry);
  applyFillAndStroke(g, item, item.width, item.height);
}

function drawNgon(g: Graphics, item: NgonCanvasItem) {
  g.clear();
  const pts = computeNgonPoints(item.width, item.height, item.sides);
  if (pts.length === 0) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    g.lineTo(pts[i].x, pts[i].y);
  }
  g.closePath();
  applyFillAndStroke(g, item, item.width, item.height);
}

function drawLine(g: Graphics, item: LineCanvasItem) {
  g.clear();
  const { startX, startY, endX, endY, stroke, strokeWidth } = item;
  g.moveTo(startX, startY);
  g.lineTo(endX, endY);
  if (strokeWidth > 0 && stroke && stroke !== 'transparent') {
    g.stroke({ color: stroke, width: strokeWidth });
  }
}

// ---------------------------------------------------------------------------
// Image adjustment filters (brightness, contrast, tint)
// ---------------------------------------------------------------------------

function buildImageAdjustmentFilters(
  adjustments: ImageCanvasItem['adjustments'],
): Filter[] | undefined {
  const adj = getRenderableImageAdjustments(adjustments);
  if (!adj.isActive) return undefined;

  const filters: Filter[] = [];

  // Matrix math lives in ../geometry/colorAdjustmentMatrix so the SVG exporter
  // emits the identical adjustment via <feColorMatrix>.
  const brightnessContrast = brightnessContrastMatrix(adj.brightness, adj.contrast);
  if (brightnessContrast) {
    const cm = new ColorMatrixFilter();
    cm.matrix = brightnessContrast as typeof cm.matrix;
    filters.push(cm);
  }

  const tint = tintMatrix(adj.tintRed, adj.tintGreen, adj.tintBlue, adj.tintAlpha);
  if (tint) {
    const cm = new ColorMatrixFilter();
    cm.matrix = tint as typeof cm.matrix;
    filters.push(cm);
  }

  return filters.length > 0 ? filters : undefined;
}

// ---------------------------------------------------------------------------
// Image content component (uses hooks for async image loading + masking)
// ---------------------------------------------------------------------------

export function PixiImageContent({ item, zoom = 1 }: { item: ImageCanvasItem; zoom?: number }) {
  const imageElement = useImageElement(item.src);
  const [maskNode, setMaskNode] = useState<Graphics | null>(null);

  const renderBox = useMemo(
    () => getRenderBox(item),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the specific fields getRenderBox reads
    [item.x, item.y, item.width, item.height, item.scaleX, item.scaleY],
  );

  const presentation = useMemo(
    () => getImageNodePresentation(item.sourceTransform, item.mirrorHorizontal),
    [item.sourceTransform, item.mirrorHorizontal],
  );

  const texture = useMemo(
    () => (imageElement ? Texture.from(imageElement) : Texture.EMPTY),
    [imageElement],
  );

  const adjustmentFilters = useMemo(() => {
    const filters = buildImageAdjustmentFilters(item.adjustments);
    if (!filters) return undefined;
    // Match filter resolution to displayed size so color-corrected pixels
    // stay sharp on zoom-in. Cap at 2× so the FBO doesn't exceed the GPU's
    // max texture size on large items at extreme zoom (clipping shows up as
    // rectangular edges on filtered output).
    const filterResolution = Math.min(2, Math.max(1, zoom)) * (window.devicePixelRatio || 1);
    for (const f of filters) f.resolution = filterResolution;
    return filters;
  }, [item.adjustments, zoom]);

  const drawClipMask = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, renderBox.width, renderBox.height);
      g.fill(0xffffff);
    },
    [renderBox.width, renderBox.height],
  );

  if (!imageElement) {
    // Placeholder while loading.
    const drawPlaceholder = (g: Graphics) => {
      g.clear();
      g.rect(0, 0, renderBox.width, renderBox.height);
      g.fill({ color: 0x334455, alpha: 0.3 });
      g.stroke({ color: 0x5588aa, alpha: 0.5, width: 1 });
    };
    return <pixiGraphics draw={drawPlaceholder} eventMode="none" />;
  }

  return (
    <>
      <pixiGraphics ref={setMaskNode} draw={drawClipMask} eventMode="none" />
      <pixiSprite
        texture={texture}
        x={presentation.x}
        y={presentation.y}
        width={presentation.width * presentation.scaleX}
        height={presentation.height}
        rotation={(presentation.rotation * Math.PI) / 180}
        filters={adjustmentFilters}
        mask={maskNode}
        eventMode="none"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Generator content component (renders full-canvas pattern via Canvas2D texture)
// ---------------------------------------------------------------------------

// Quantize the zoom-driven pixel scale to powers of two so we don't
// re-rasterize the generator on every zoom tick. Caps at 4× to bound
// memory (a 2048² canvas at 4× is 8192² — ~256 MB at RGBA8).
function quantizeGeneratorPixelScale(zoom: number): number {
  if (zoom <= 1) return 1;
  if (zoom <= 2) return 2;
  return 4;
}

function PixiGeneratorContent({
  item,
  canvasWidth,
  canvasHeight,
  zoom,
}: {
  item: GeneratorCanvasItem;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
}) {
  const pixelScale = quantizeGeneratorPixelScale(zoom);
  const generatorCanvas = useGeneratorCanvas(item, canvasWidth, canvasHeight, pixelScale);

  const texture = useMemo(
    () => (generatorCanvas ? Texture.from(generatorCanvas) : Texture.EMPTY),
    [generatorCanvas],
  );

  // The canvas element is reused — tell PixiJS to re-upload pixels when params change.
  useEffect(() => {
    if (texture !== Texture.EMPTY) {
      texture.source.update();
    }
  }, [texture, item.generatorParams, item.seed, canvasWidth, canvasHeight, pixelScale]);

  if (!generatorCanvas) return null;

  return (
    <pixiSprite
      texture={texture}
      width={canvasWidth}
      height={canvasHeight}
      eventMode="none"
    />
  );
}

// ---------------------------------------------------------------------------
// PixiItemLayer component
// ---------------------------------------------------------------------------

interface PixiItemLayerProps {
  activeTool: CanvasTool;
  canvasWidth: number;
  canvasHeight: number;
  items: RenderableCanvasItem[];
  onItemPointerDown: (
    item: CanvasItem,
    selectionNodeId: string,
    pointer: Point,
    shiftKey: boolean,
    nativeEvent?: MouseEvent,
  ) => void;
  onItemDoubleClick: (item: CanvasItem) => void;
  spacebarHeld: boolean;
  startPanDrag: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
  zoom: number;
}

export function PixiItemLayer({
  activeTool,
  canvasWidth,
  canvasHeight,
  items,
  onItemPointerDown,
  onItemDoubleClick,
  spacebarHeld,
  startPanDrag,
  toCanvasPointer,
  zoom,
}: PixiItemLayerProps) {
  const interactive = activeTool === 'select';

  return (
    <>
      {items.map((item) => {
        if (item.hidden) return null;
        return (
          <PixiItemView
            key={item.id}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            interactive={interactive}
            item={item}
            onItemPointerDown={onItemPointerDown}
            onItemDoubleClick={onItemDoubleClick}
            spacebarHeld={spacebarHeld}
            startPanDrag={startPanDrag}
            toCanvasPointer={toCanvasPointer}
            zoom={zoom}
          />
        );
      })}
    </>
  );
}

interface PixiItemViewProps {
  canvasWidth: number;
  canvasHeight: number;
  interactive: boolean;
  item: RenderableCanvasItem;
  onItemPointerDown: PixiItemLayerProps['onItemPointerDown'];
  onItemDoubleClick: PixiItemLayerProps['onItemDoubleClick'];
  spacebarHeld: boolean;
  startPanDrag: (pointer: Point) => void;
  toCanvasPointer: (pointer: Point) => Point;
  zoom: number;
}

const PixiItemView = memo(function PixiItemView({
  canvasWidth,
  canvasHeight,
  interactive,
  item,
  onItemPointerDown,
  onItemDoubleClick,
  spacebarHeld,
  startPanDrag,
  toCanvasPointer,
  zoom,
}: PixiItemViewProps) {
  const draw = useCallback(
    (g: Graphics) => {
      switch (item.kind) {
        case 'rectangle':
          drawRectangle(g, item);
          break;
        case 'ellipse':
          drawEllipse(g, item);
          break;
        case 'ngon':
          drawNgon(g, item);
          break;
        case 'line':
          drawLine(g, item);
          break;
        case 'text':
        case 'image':
          // Handled by dedicated components below, not via Graphics draw.
          break;
        case 'generator':
          // Handled by dedicated component below, not via Graphics draw.
          break;
      }
    },
    [item], // Intentionally keyed on whole item — shape drawers read many variant-specific fields.
    // Redrawing Graphics is cheap (a single clear+path+fill); the perf-critical memos are
    // itemFilters (expensive filter construction) and hitArea (triggers PixiJS prop diffs).
  );

  // PixiJS federated events don't include dblclick, so detect manually.
  const lastClickRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: FederatedPointerEvent) => {
      if (!interactive || item.locked) return;
      const viewportPointer = { x: e.global.x, y: e.global.y };
      const nativeEvent = e.nativeEvent as MouseEvent;

      // Pan gesture: middle-click or spacebar held
      if (nativeEvent.button === 1 || spacebarHeld) {
        e.stopPropagation();
        startPanDrag(viewportPointer);
        return;
      }

      // Double-click detection
      const now = Date.now();
      if (now - lastClickRef.current < 400) {
        lastClickRef.current = 0;
        e.stopPropagation();
        onItemDoubleClick(item);
        return;
      }
      lastClickRef.current = now;

      e.stopPropagation();
      onItemPointerDown(
        item,
        item.selectableNodeId,
        toCanvasPointer(viewportPointer),
        nativeEvent.shiftKey,
        nativeEvent,
      );
    },
    [interactive, item, onItemDoubleClick, onItemPointerDown, spacebarHeld, startPanDrag, toCanvasPointer],
  );

  const eventMode = interactive && !item.locked ? 'static' as const : 'none' as const;

  const renderBox = useMemo(
    () => getRenderBox(item),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the specific fields getRenderBox reads
    [item.kind, item.x, item.y, item.width, item.height, item.scaleX, item.scaleY],
  );

  // Build combined filters: blur + shadow (text handles its own shadow via dropShadow style).
  // DropShadowFilter is a post-processing effect that operates in screen space,
  // so offset and blur must be scaled by the current zoom to match item-space values.
  const itemFilters = useMemo(() => {
    const filters: Filter[] = [];
    const dpr = window.devicePixelRatio || 1;
    const maxTextureSize = getMaxTextureSize();
    const itemMaxDim = Math.max(renderBox.width, renderBox.height, 1);
    if (item.blurRadius > 0) {
      const strength = item.blurRadius * zoom;
      // ClampingBlurFilter is a Gaussian BlurFilter with shaders that clamp
      // sample UVs to the input texture's active frame (uInputClamp).
      // Pixi's stock BlurFilter samples raw UVs; TexturePool reuses power-
      // of-two textures whose pixels between the frame and po2 boundary
      // keep stale data from previous use, and the blur kernel pulls those
      // bright values into the result. Clamping eliminates that read.
      const blurFilter = new ClampingBlurFilter({
        strength,
        clipToViewport: false,
      });
      // With clamping in place, padding determines where the visible blur
      // halo ends. Pixi's auto-padding (strength*2) cuts the Gaussian tail
      // off mid-falloff; the optimized 4-pass kernel reaches ~5× strength,
      // so pad to 6× for a smooth fadeout.
      blurFilter.padding = strength * 6;
      const blurRegionPx = (itemMaxDim + blurFilter.padding * 2) * zoom;
      blurFilter.resolution = clampRasterResolution(dpr, blurRegionPx, maxTextureSize);
      filters.push(blurFilter);
    }
    if (item.kind !== 'text') {
      const s = item.shadow;
      const hasShadow = s && (s.blur > 0 || s.offsetX !== 0 || s.offsetY !== 0) && s.opacity > 0;
      if (hasShadow) {
        const shadowBlur = (s.blur / 2) * zoom;
        const shadowOffsetX = s.offsetX * zoom;
        const shadowOffsetY = s.offsetY * zoom;
        const shadowFilter = new DropShadowFilter({
          color: s.color,
          alpha: s.opacity,
          blur: shadowBlur,
          offset: { x: shadowOffsetX, y: shadowOffsetY },
          quality: 8,
        });
        shadowFilter.clipToViewport = false;
        // DropShadowFilter wraps a Kawase blur whose reach scales with
        // blur × quality. Auto-padding (offset + blur*2 + quality*4) clips
        // the tail; extend it the same way as BlurFilter.
        shadowFilter.padding =
          Math.max(Math.abs(shadowOffsetX), Math.abs(shadowOffsetY)) +
          shadowBlur * 6 +
          32;
        const shadowRegionPx = (itemMaxDim + shadowFilter.padding * 2) * zoom;
        shadowFilter.resolution = clampRasterResolution(dpr, shadowRegionPx, maxTextureSize);
        filters.push(shadowFilter);
      }
    }
    return filters.length > 0 ? filters : undefined;
  }, [item.blurRadius, item.shadow, item.kind, renderBox.width, renderBox.height, zoom]);

  const shapeHitArea = useMemo(
    () => new Rectangle(0, 0, renderBox.width, renderBox.height),
    [renderBox.width, renderBox.height],
  );

  const genHitArea = useMemo(
    () => new Rectangle(0, 0, canvasWidth, canvasHeight),
    [canvasWidth, canvasHeight],
  );

  // Memoize line hit polygon unconditionally to satisfy hook ordering rules.
  // For lines, renderBox is derived from the same startX/Y, endX/Y fields used here,
  // so renderBox changes iff the line endpoints change. strokeWidth is on LineCanvasItem
  // only, but we can safely read it when kind === 'line'.
  const lineHitArea = useMemo(() => {
    if (item.kind !== 'line') return null;
    return buildLineHitPolygon(item.startX, item.startY, item.endX, item.endY, item.strokeWidth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.kind, renderBox.x, renderBox.y, renderBox.width, renderBox.height]);

  // Lines use absolute coordinates (startX/startY → endX/endY), no transform.
  if (item.kind === 'line') {
    return (
      <pixiGraphics
        label={item.id}
        draw={draw}
        alpha={item.opacity}
        filters={itemFilters}
        eventMode={eventMode}
        hitArea={lineHitArea!}
        onMouseDown={handleMouseDown}
      />
    );
  }

  // Generators render a full-canvas pattern at origin (different layout from other items).
  if (item.kind === 'generator') {
    return (
      <pixiContainer
        label={item.id}
        x={0}
        y={0}
        alpha={item.opacity}
        filters={itemFilters}
        eventMode={eventMode}
        hitArea={genHitArea}
        onMouseDown={handleMouseDown}
      >
        <PixiGeneratorContent
          item={item as GeneratorCanvasItem}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          zoom={zoom}
        />
      </pixiContainer>
    );
  }

  // All other items share the same container layout (position, rotation, hitArea).
  let children: React.ReactNode;
  if (item.kind === 'text') {
    const { style: textStyle, textX, textY } = buildTextStyleProps(item);
    // Pixi rasterizes Text to a texture at `resolution * devicePixelRatio`.
    // When zoom > 1 the texture is magnified and turns blurry, so scale
    // resolution with zoom to keep glyphs sharp on zoom-in. Clamp so the
    // resulting texture stays under the GPU's MAX_TEXTURE_SIZE — past the
    // cap, glyphs go soft instead of disappearing into a black rect.
    const requestedResolution = Math.max(1, zoom) * (window.devicePixelRatio || 1);
    const textResolution = clampRasterResolution(
      requestedResolution,
      Math.max(item.width, item.height, 1),
      getMaxTextureSize(),
    );
    children = (
      <pixiText
        text={item.text}
        style={textStyle}
        x={textX}
        y={textY}
        resolution={textResolution}
        eventMode="none"
      />
    );
  } else if (item.kind === 'image') {
    children = <PixiImageContent item={item as ImageCanvasItem} zoom={zoom} />;
  } else {
    children = <pixiGraphics draw={draw} eventMode="none" />;
  }

  return (
    <pixiContainer
      label={item.id}
      x={renderBox.x}
      y={renderBox.y}
      rotation={(item.rotation * Math.PI) / 180}
      alpha={item.opacity}
      filters={itemFilters}
      pivot={ZERO_PIVOT}
      eventMode={eventMode}
      hitArea={shapeHitArea}
      onMouseDown={handleMouseDown}
    >
      {children}
    </pixiContainer>
  );
});
