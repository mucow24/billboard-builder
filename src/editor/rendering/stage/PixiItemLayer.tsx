import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  CanvasSource,
  CanvasTextMetrics,
  ColorMatrixFilter,
  FillGradient,
  Graphics,
  Matrix,
  Rectangle,
  Texture,
} from 'pixi.js';
import type { FederatedPointerEvent, Filter } from 'pixi.js';
import { DropShadowFilter } from 'pixi-filters';

import { ClampingBlurFilter } from './clampingBlurFilter';
import { clampRasterResolution, getMaxTextureSize } from './rasterCaps';

import type {
  CanvasItem,
  CanvasTool,
  EllipseCanvasItem,
  GeneratorCanvasItem,
  GradientFillItem,
  ImageCanvasItem,
  NgonCanvasItem,
  PolygonCanvasItem,
  RectangleCanvasItem,
  TextCanvasItem,
} from '../../document/documentTypes';
import { drawnText, getTextFontRegistrationCount, textFontFamilies } from '../../fonts/emojiFallback';
import { subscribeToFontRegistrations } from '../../fonts/fontRegistrations';
import { getRenderableCombinedFontStyle } from '../../fonts/fontStyles';
import { getRenderableImageAdjustments } from '../imageAdjustments';
import { computeGradientEndpoints, computeGradientTextureMatrix } from '../geometry/gradientGeometry';
import { computeNgonPoints } from '../geometry/ngonGeometry';
import {
  buildPolygonPathSegments,
  distanceToPolygonEdges,
  pointInPolygonVertices,
} from '../geometry/polygonGeometry';
import { brightnessContrastMatrix, tintMatrix } from '../geometry/colorAdjustmentMatrix';
import { getImageNodePresentation } from '../imagePresentation';
import type { Point } from '../interactionGeometry';
import type { RenderableCanvasItem } from '../renderAdapter';
import { parseRichText } from '../../document/richText';
import type { RichTextRun } from '../../document/richText';
import { snapOffsetToTexels } from '../textBaseline';
import { alignedLineLeft, textBlockTop } from '../textLineBreaking';
import { snapPaddingToTexels } from '../textInkOverhang';
import { strokedTextPlacement, TEXT_STROKE_JOIN, textStrokeOf } from '../textStroke';
import type { TextStrokePaint } from '../textStroke';
import {
  layoutRichTextRuns,
  measureWordWrappedTextHeight,
  richTextRunItem,
} from '../textMeasurement';
import { useGeneratorCanvas } from '../../generators/useGeneratorCanvas';
import { getRenderBox } from '../transformGeometry';
import { useImageElement } from '../useImageElement';
import { useSvgImageCanvas } from '../useSvgImageCanvas';
import { computeSvgPixelScale } from './svgRasterScale';
import { measureTextBaselineShift } from './textBaselineShift';
import { getTextMeasuringContext, measureTextRasterPadding } from './textRasterPadding';
import { registerZoomScaledFilter } from './zoomScaledFilters';

// Stable reference so `pivot` prop doesn't trigger reconciliation every render.
const ZERO_PIVOT = { x: 0, y: 0 } as const;

// ---------------------------------------------------------------------------
// Gradient helper
// ---------------------------------------------------------------------------

type GradientCapable =
  | RectangleCanvasItem
  | EllipseCanvasItem
  | NgonCanvasItem
  | PolygonCanvasItem
  | TextCanvasItem;

/** Length in texels of the colour strip a gradient is sampled from (Pixi's default). */
const GRADIENT_TEXTURE_SIZE = 256;

/**
 * `origin` is where the item's box starts in the space the gradient is resolved
 * in. Shapes draw from (0, 0). A text texture starts above and to the left of
 * the text by its padding, and the text itself is placed inside the item's box,
 * so its gradient has to be moved back by both to stay on the box.
 */
function buildPixiGradient(
  item: GradientFillItem,
  width: number,
  height: number,
  origin: Point = { x: 0, y: 0 },
): FillGradient | null {
  const endpoints = computeGradientEndpoints(item, width, height);
  if (!endpoints) return null;
  const line = {
    x0: endpoints.x0 + origin.x,
    y0: endpoints.y0 + origin.y,
    x1: endpoints.x1 + origin.x,
    y1: endpoints.y1 + origin.y,
  };
  // Pixi mirrors a gradient whose line runs right-and-up or left-and-down
  // when it builds the texture that shapes are filled with. So the texture is
  // built from a plain left-to-right line, which Pixi gets right, and then
  // laid along the real line with our own matrix. Text does not use the
  // texture: it reads `start` and `end`, which are set to the real line after.
  const grad = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: item.fill },
      { offset: 1, color: item.secondaryFill },
    ],
    textureSpace: 'global',
    textureSize: GRADIENT_TEXTURE_SIZE,
  });
  grad.buildGradient();
  grad.start = { x: line.x0, y: line.y0 };
  grad.end = { x: line.x1, y: line.y1 };
  const m = computeGradientTextureMatrix(line, GRADIENT_TEXTURE_SIZE);
  grad.transform = new Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty);
  return grad;
}

// ---------------------------------------------------------------------------
// Text style builder
// ---------------------------------------------------------------------------

/** The drop shadow of a text item as Pixi's text style has it (angle and distance), or undefined without one. */
function pixiDropShadowOf(item: TextCanvasItem) {
  const s = item.shadow;
  const hasShadow = s && (s.blur > 0 || s.offsetX !== 0 || s.offsetY !== 0) && s.opacity > 0;
  return hasShadow
    ? {
        alpha: s.opacity,
        angle: Math.atan2(s.offsetY, s.offsetX),
        blur: s.blur,
        color: s.color,
        distance: Math.sqrt(s.offsetX * s.offsetX + s.offsetY * s.offsetY),
      }
    : undefined;
}

/**
 * The font of a text item as Pixi's text style has it: `item` itself, or `item`
 * in the style of one of its rich text runs.
 */
function pixiFontStyleOf(item: TextCanvasItem) {
  const effectiveStyle = getRenderableCombinedFontStyle(item);
  return {
    // The item's family, then the emoji fallback for emoji it does not have.
    // A new array each time: Pixi quotes the names in place.
    fontFamily: textFontFamilies(item.fontFamily),
    fontSize: item.fontSize,
    fontWeight: effectiveStyle.includes('bold') ? ('bold' as const) : ('normal' as const),
    fontStyle: effectiveStyle.includes('italic') ? ('italic' as const) : ('normal' as const),
    letterSpacing: item.letterSpacing,
    lineHeight: item.fontSize * item.lineHeight,
  };
}

/** A paint that shows nothing: for a text drawn for its stroke or its shadow alone. */
const NO_PAINT = '#00000000';

/** One Pixi text of a text layer: the props of a `<pixiText>` and its key. */
interface PixiTextLayer {
  key: string;
  text: string;
  style: Record<string, unknown>;
  x: number;
  y: number;
  resolution: number;
  alpha: number;
}

/**
 * The stroke of a text item as Pixi's text style has it. Opaque: the Pixi text
 * that draws it is made see-through as a whole instead (`TextStrokePaint.alpha`).
 * With `visible` false it paints nothing and still counts for the drop shadow,
 * which Pixi casts from a text's shape whatever its paints.
 */
function pixiStrokeOf(
  stroke: TextStrokePaint,
  visible = true,
): { color: string; width: number; join: typeof TEXT_STROKE_JOIN; cap: typeof TEXT_STROKE_JOIN } {
  return {
    color: visible ? stroke.color : NO_PAINT,
    width: stroke.width,
    join: TEXT_STROKE_JOIN,
    cap: TEXT_STROKE_JOIN,
  };
}

/**
 * The Pixi texts that draw a text item without tags, the lowest first.
 * `requestedResolution` is the resolution the current zoom calls for.
 *
 * Without an outline that is one text, which casts its own drop shadow. With
 * one (see `textStroke`) there are up to three:
 *
 * - the shadow, cast from the shape of fill and stroke together. Pixi draws
 *   the shadow of the stroke and the shadow of the fill one over the other, so
 *   a see-through shadow would be darker where the two overlap. It is drawn
 *   opaque, and the text made see-through as a whole.
 * - the stroke. Pixi strokes and fills a text line by line, which puts the
 *   stroke of a line on the fill of the line above wherever lines are close.
 *   In a text of its own, every stroke is under every fill.
 * - the fill: the text exactly as it is drawn without an outline.
 */
function buildTextLayers(item: TextCanvasItem, requestedResolution: number): PixiTextLayer[] {
  const renderBox = getRenderBox(item);
  const contentWidth = Math.max(1, renderBox.width - item.padding.left - item.padding.right);

  const dropShadow = pixiDropShadowOf(item);
  const stroke = textStrokeOf(item);

  // Vertical alignment offset.
  const measuredHeight =
    measureWordWrappedTextHeight(item, renderBox.width) - item.padding.top - item.padding.bottom;
  let textY = textBlockTop(item, renderBox.height, measuredHeight);

  const baseStyle = {
    ...pixiFontStyleOf(item),
    wordWrap: true,
    wordWrapWidth: contentWidth,
    align: item.align as 'left' | 'center' | 'right',
    whiteSpace: 'pre' as const,
  };
  const layoutStyle = { ...baseStyle, ...(dropShadow && !stroke ? { dropShadow } : {}) };
  const strokeStyle = stroke ? { ...baseStyle, stroke: pixiStrokeOf(stroke) } : null;
  const shadowStyle =
    stroke && dropShadow
      ? { ...baseStyle, stroke: pixiStrokeOf(stroke, false), dropShadow: { ...dropShadow, alpha: 1 } }
      : null;

  // Pixi sizes the text texture from advance widths and the font's ascent and
  // descent, and cuts off ink outside that box: the lean of an italic glyph at
  // the end of a line, a tail left of the first glyph's origin, an accent or a
  // descender beyond the font's own, a stroke under the last line, and a drop
  // shadow wherever it falls past the text (Pixi widens the texture only by the
  // length of the shadow's offset, to the right and downwards). `padding` adds
  // room on all four sides and Pixi shifts the quad back by as much, so the
  // text itself stays where it is.
  const text = drawnText(item.text);
  const inkRoom = measureTextRasterPadding(text, layoutStyle);
  const strokeRoom = strokeStyle ? measureTextRasterPadding(text, strokeStyle) : 0;
  const shadowRoom = shadowStyle ? measureTextRasterPadding(text, shadowStyle) : 0;

  // Clamp so the largest texture, the text plus that room on both sides and
  // its stroke, stays under the GPU's MAX_TEXTURE_SIZE — past the cap, glyphs
  // go soft instead of disappearing into a black rect. One resolution for all
  // of the texts: the stroke is rasterised on the texels the fill is.
  const resolution = clampRasterResolution(
    requestedResolution,
    Math.max(item.width, item.height, 1) +
      Math.max(inkRoom, strokeRoom, shadowRoom) * 2 +
      (stroke?.width ?? 0),
    getMaxTextureSize(),
  );

  // Rounded up to whole blocks of texels, so the glyphs are rasterised and
  // mipmapped exactly as they are without padding. (The rounding adds less
  // than a block a side, which the clamp's own margin covers.)
  const padding = snapPaddingToTexels(inkRoom, resolution);

  // Pixi draws the first baseline where the ink of accented capitals puts it;
  // the layer wants its capitals centred in the line box (see `textBaseline`).
  // The whole text is moved by the difference, in whole texels so that the
  // texture is still shown texel for texel.
  const textX = item.padding.left;
  textY += snapOffsetToTexels(measureTextBaselineShift(item, baseStyle), resolution);

  // The gradient runs across the item's box, which starts this far into the
  // texture: the padding, less where the text sits inside the box.
  const fill = item.gradientEnabled
    ? buildPixiGradient(item, renderBox.width, renderBox.height, {
        x: padding - textX,
        y: padding - textY,
      }) ?? item.fill
    : item.fill;

  /** A text drawn for its stroke or its shadow, moved onto the glyphs of the fill. */
  const strokedLayer = (
    key: string,
    style: Record<string, unknown>,
    room: number,
    alpha: number,
  ): PixiTextLayer => {
    const placement = strokedTextPlacement(room, stroke?.width ?? 0, resolution);
    return {
      key,
      text,
      style: { ...style, fill: NO_PAINT, padding: placement.padding },
      x: textX + placement.offset,
      y: textY + placement.offset,
      resolution,
      alpha,
    };
  };

  return [
    ...(shadowStyle ? [strokedLayer('shadow', shadowStyle, shadowRoom, dropShadow?.alpha ?? 1)] : []),
    ...(stroke && strokeStyle ? [strokedLayer('stroke', strokeStyle, strokeRoom, stroke.alpha)] : []),
    { key: 'fill', text, style: { ...layoutStyle, fill, padding }, x: textX, y: textY, resolution, alpha: 1 },
  ];
}

// ---------------------------------------------------------------------------
// Rich text: one Pixi text per fragment
// ---------------------------------------------------------------------------

/**
 * The Pixi texts that draw a text item with tags: one per fragment, a piece of
 * one run on one line (see `richTextLayout`). Null where there is no canvas to
 * measure with.
 *
 * Pixi can draw tagged text itself (`tagStyles`), but not this: its tag parser
 * has no way to show a "<" ahead of a tag, and it shifts a gradient by the
 * position of every run. A text per fragment has neither problem. Each takes
 * its position from the layout, its baseline from the item's own font so that
 * bold and regular stand on one line, and the same care for ink and texels as
 * plain text (see `buildTextLayers`).
 *
 * A drop shadow is drawn as texts of its own, all of them under all of the
 * fragments, so that no fragment's shadow falls on top of its neighbour. Such a
 * text is the fragment with a fill that shows nothing: Pixi draws the shadow of
 * a text whatever its fill.
 *
 * An outline (see `textStroke`) is drawn the same way, as texts between the
 * shadows and the fragments, so that no fragment's stroke falls on its
 * neighbour's fill. The shadows are then cast from fill and stroke together,
 * as they are for plain text (`buildTextLayers`).
 */
function buildRichTextFragments(
  item: TextCanvasItem,
  runs: RichTextRun[],
  requestedResolution: number,
) {
  const context = getTextMeasuringContext();
  if (!context) return null;

  const renderBox = getRenderBox(item);
  const contentWidth = Math.max(1, renderBox.width - item.padding.left - item.padding.right);
  const lineHeight = item.fontSize * item.lineHeight;

  const lines = layoutRichTextRuns(item, runs, contentWidth, context);
  const textTop = textBlockTop(item, renderBox.height, lines.length * lineHeight);
  // As in plain text: lines align inside the box, or inside the widest line
  // when that does not fit the box.
  const alignWidth = Math.max(contentWidth, ...lines.map((line) => line.width));

  const dropShadow = pixiDropShadowOf(item);
  const stroke = textStrokeOf(item);

  const fragments = lines.flatMap((line, lineIndex) => {
    const lineLeft = alignedLineLeft(item, alignWidth, line.width);
    const lineTop = textTop + lineIndex * lineHeight;
    return line.fragments.map((fragment, fragmentIndex) => ({
      fragment,
      key: `${lineIndex}:${fragmentIndex}`,
      left: lineLeft + fragment.x,
      lineTop,
    }));
  });

  type PlacedFragment = (typeof fragments)[number];
  type Part = 'shadow' | 'stroke' | 'fill';
  const parts: Part[] = [...(dropShadow ? ['shadow' as const] : []), ...(stroke ? ['stroke' as const] : []), 'fill'];

  /** The stroke a part's text has: the one it draws, or one that only shapes its shadow. */
  const strokeOf = (part: Part) => (part === 'fill' ? null : stroke);

  /** The style a part of a fragment is laid out and measured with: all of it but fill and padding. */
  const layoutStyleOf = ({ fragment }: PlacedFragment, part: Part) => {
    const partStroke = strokeOf(part);
    return {
      ...pixiFontStyleOf(richTextRunItem(item, fragment.run)),
      wordWrap: false,
      whiteSpace: 'pre' as const,
      // With a stroke the shadow is drawn opaque and the text made see-through
      // as a whole (see `buildTextLayers`).
      ...(part === 'shadow' && dropShadow
        ? { dropShadow: partStroke ? { ...dropShadow, alpha: 1 } : dropShadow }
        : {}),
      ...(partStroke ? { stroke: pixiStrokeOf(partStroke, part === 'stroke') } : {}),
    };
  };

  /**
   * The Pixi texts of a fragment, by part: its shadow alone, its stroke alone,
   * and the fragment itself without either.
   */
  const pixiTextsOf = (placed: PlacedFragment): Partial<Record<Part, PixiTextLayer>> => {
    const measured = parts.map((part) => {
      const layoutStyle = layoutStyleOf(placed, part);
      return { part, layoutStyle, inkRoom: measureTextRasterPadding(placed.fragment.text, layoutStyle) };
    });
    // One resolution for all of a fragment's texts, clamped for the largest of
    // their textures: stroke and shadow are rasterised on the texels the fill
    // is (see `buildTextLayers`).
    const resolution = clampRasterResolution(
      requestedResolution,
      Math.max(placed.fragment.width, lineHeight, 1) +
        Math.max(...measured.map(({ inkRoom }) => inkRoom)) * 2 +
        (stroke?.width ?? 0),
      getMaxTextureSize(),
    );
    return Object.fromEntries(
      measured.map(({ part, layoutStyle, inkRoom }) => [
        part,
        pixiTextOf(placed, part, layoutStyle, inkRoom, resolution),
      ]),
    );
  };

  const pixiTextOf = (
    { fragment, key, left, lineTop }: PlacedFragment,
    part: Part,
    layoutStyle: ReturnType<typeof layoutStyleOf>,
    inkRoom: number,
    resolution: number,
  ): PixiTextLayer => {
    const partStroke = strokeOf(part);
    // A stroked text is moved back onto the glyphs of the unstroked one.
    const placement = strokedTextPlacement(inkRoom, partStroke?.width ?? 0, resolution);
    const padding = placement.padding;

    // `item` gives the baseline wanted, `layoutStyle` where Pixi draws this
    // fragment's font: the difference moves the fragment onto the shared line.
    const x = snapOffsetToTexels(left, resolution);
    const shift = snapOffsetToTexels(measureTextBaselineShift(item, layoutStyle), resolution);
    const y = lineTop + shift;

    const paint = fragment.run.paint;
    let fill: FillGradient | string = item.fill;
    if (part !== 'fill') {
      fill = NO_PAINT;
    } else if (paint?.kind === 'color') {
      fill = paint.color;
    } else if (paint?.kind === 'gradient') {
      // Across the fragment's own box, as a layer's gradient runs across the
      // layer's: the fragment's width, and its line box from top to bottom.
      fill =
        buildPixiGradient(
          {
            fill: paint.start,
            secondaryFill: paint.end,
            gradientEnabled: true,
            gradientAngle: paint.angle,
          },
          fragment.width,
          lineHeight,
          // The line box starts `shift` above the fragment's texture.
          { x: padding, y: padding - shift },
        ) ?? paint.start;
    } else if (item.gradientEnabled) {
      // Across the item's box, which starts this far into the fragment's texture.
      fill =
        buildPixiGradient(item, renderBox.width, renderBox.height, {
          x: padding - x,
          y: padding - y,
        }) ?? item.fill;
    }

    let alpha = 1;
    if (partStroke) alpha = part === 'shadow' ? dropShadow?.alpha ?? 1 : partStroke.alpha;

    return {
      key: `${part}:${key}`,
      text: fragment.text,
      style: { ...layoutStyle, fill, padding },
      resolution,
      x: x + placement.offset,
      y: y + placement.offset,
      alpha,
    };
  };

  // Every shadow under every stroke, and every stroke under every fill.
  const texts = fragments.map(pixiTextsOf);
  return parts.flatMap((part) => texts.flatMap((byPart) => byPart[part] ?? []));
}

// ---------------------------------------------------------------------------
// Text content component (redraws when the text's font arrives)
// ---------------------------------------------------------------------------

// Pixi measures the ascent and descent of a font declaration once and keeps the
// answer. Measured before the declaration's font was registered, it describes a
// fallback font, so it is dropped whenever a font is registered. This runs
// before React re-renders the text layers that follow the registration.
subscribeToFontRegistrations(() => CanvasTextMetrics.clearMetrics());

function PixiTextContent({ item, zoom }: { item: TextCanvasItem; zoom: number }) {
  // The text is rasterised with whatever the browser has for its family at that
  // moment: a fallback font, if the family's file has not been registered yet
  // (bundled fonts still loading at startup, an uploaded font restored after
  // the saved canvas is shown, a missing font imported later). Nothing about
  // the item changes when the file arrives, so follow the family instead: a
  // registration re-renders this layer, and every render measures, lays out
  // and rasterises the text anew. Layers in other families are left alone. The
  // emoji fallback counts as one of every layer's families: the text may have
  // characters only it can draw.
  useSyncExternalStore(subscribeToFontRegistrations, () => getTextFontRegistrationCount(item.fontFamily));

  // Pixi rasterizes Text to a texture at `resolution * devicePixelRatio`.
  // When zoom > 1 the texture is magnified and turns blurry, so scale
  // resolution with zoom to keep glyphs sharp on zoom-in.
  const requestedResolution = Math.max(1, zoom) * (window.devicePixelRatio || 1);

  // Text with tags is drawn fragment by fragment; text without is untouched by them.
  const rich = parseRichText(item.text);
  const fragments = rich.hasMarkup
    ? buildRichTextFragments(item, rich.runs, requestedResolution)
    : null;
  const layers = fragments ?? buildTextLayers(item, requestedResolution);
  return (
    <>
      {layers.map((layer) => (
        <pixiText
          key={layer.key}
          text={layer.text}
          style={layer.style}
          x={layer.x}
          y={layer.y}
          alpha={layer.alpha}
          resolution={layer.resolution}
          eventMode="none"
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Individual item drawers
// ---------------------------------------------------------------------------

function applyFillAndStroke(
  g: Graphics,
  item: GradientCapable & { stroke: string; strokeWidth: number },
  width: number,
  height: number,
  join: 'miter' | 'round' = 'miter',
) {
  const grad = buildPixiGradient(item, width, height);
  g.fill(grad ?? item.fill);
  if (item.strokeWidth > 0 && item.stroke && item.stroke !== 'transparent') {
    g.stroke({ color: item.stroke, width: item.strokeWidth, join });
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
  // Pixi draws the ellipse as a polygon with the same number of corners per
  // quarter turn whatever its proportions, so the corners at the two ends of a
  // flat ellipse are sharp. Mitred, a wide stroke would stick out past the
  // ellipse there (4 px for 200x8 with a 24 px stroke); rounded, it stays
  // half a stroke width from the outline, as in the SVG export.
  applyFillAndStroke(g, item, item.width, item.height, 'round');
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

function drawPolygon(g: Graphics, item: PolygonCanvasItem) {
  g.clear();
  // Vertices are absolute; the container sits at the derived AABB origin, so
  // draw in local space to keep gradients and filters box-relative.
  const local = item.vertices.map((v) => ({ x: v.x - item.x, y: v.y - item.y }));
  const segments = buildPolygonPathSegments(local, item.curveRadius, item.closed);
  if (segments.length === 0) return;
  for (const segment of segments) {
    switch (segment.type) {
      case 'move':
        g.moveTo(segment.x, segment.y);
        break;
      case 'line':
        g.lineTo(segment.x, segment.y);
        break;
      case 'quad':
        g.quadraticCurveTo(segment.cx, segment.cy, segment.x, segment.y);
        break;
      case 'close':
        g.closePath();
        break;
    }
  }
  if (item.closed) {
    const grad = buildPixiGradient(item, item.width, item.height);
    g.fill(grad ?? item.fill);
  }
  if (item.strokeWidth > 0 && item.stroke && item.stroke !== 'transparent') {
    // Round joins keep thin corners clean. A line's ends stay square-cut
    // (the default butt cap), stopping exactly at its first and last vertex.
    g.stroke({
      color: item.stroke,
      width: item.strokeWidth,
      join: 'round',
    });
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

  // SVG sources are vector data: instead of sampling the natural-size <img>
  // raster (blurry once stretched or zoomed), redraw them onto a canvas at the
  // resolution the current presentation needs.
  const isSvgSource = item.mimeType === 'image/svg+xml';
  const svgPixelScale = useMemo(
    () =>
      isSvgSource
        ? computeSvgPixelScale({
            originalWidth: item.originalWidth,
            originalHeight: item.originalHeight,
            presentationWidth: presentation.width,
            presentationHeight: presentation.height,
            zoom,
            devicePixelRatio: window.devicePixelRatio || 1,
            maxTextureSize: getMaxTextureSize(),
          })
        : 0,
    [isSvgSource, item.originalWidth, item.originalHeight, presentation.width, presentation.height, zoom],
  );
  const svgCanvas = useSvgImageCanvas(
    isSvgSource ? imageElement : null,
    item.originalWidth * svgPixelScale,
    item.originalHeight * svgPixelScale,
  );

  const texture = useMemo(() => {
    // Each SVG raster is a fresh private canvas, so build its texture
    // directly instead of going through Texture.from's global cache.
    if (svgCanvas) return new Texture({ source: new CanvasSource({ resource: svgCanvas }) });
    return imageElement ? Texture.from(imageElement) : Texture.EMPTY;
  }, [svgCanvas, imageElement]);

  // SVG raster textures are replaced wholesale on every scale change —
  // destroy the superseded ones or their GPU memory accumulates. (The
  // imageElement fallback textures come from Texture.from's shared cache and
  // must NOT be destroyed here.)
  useEffect(() => {
    if (!svgCanvas || texture === Texture.EMPTY) return;
    return () => {
      texture.destroy(true);
    };
  }, [texture, svgCanvas]);

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
      {/* The mirror flip lives on a wrapper's scale, never in a negative sprite
          width: Pixi's width setter keeps the sign the scale already has, so a
          sprite that was once given a negative width stays flipped when the
          width turns positive again, and lands outside the clip mask. */}
      <pixiContainer
        x={presentation.x}
        y={presentation.y}
        rotation={(presentation.rotation * Math.PI) / 180}
        scale={{ x: presentation.scaleX, y: 1 }}
        eventMode="none"
      >
        <pixiSprite
          texture={texture}
          width={presentation.width}
          height={presentation.height}
          filters={adjustmentFilters}
          mask={maskNode}
          eventMode="none"
        />
      </pixiContainer>
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

  // useGeneratorCanvas hands back a new canvas whenever its pixel size
  // changes, so the texture changes with it and the sprite below re-derives
  // its scale. Each canvas is private, so build its texture directly instead
  // of going through Texture.from's global cache.
  const texture = useMemo(
    () =>
      generatorCanvas
        ? new Texture({ source: new CanvasSource({ resource: generatorCanvas }) })
        : Texture.EMPTY,
    [generatorCanvas],
  );

  // Destroy superseded textures or their GPU memory accumulates.
  useEffect(() => {
    if (texture === Texture.EMPTY) return;
    return () => {
      texture.destroy(true);
    };
  }, [texture]);

  // Between size changes the canvas element is reused — tell PixiJS to
  // re-upload its pixels when the pattern changes.
  useEffect(() => {
    if (texture !== Texture.EMPTY) {
      texture.source.update();
    }
  }, [texture, item.generatorParams, item.seed]);

  if (!generatorCanvas) return null;

  // Keyed by texture: a sprite that outlives its texture would keep the scale
  // it derived from the old one for a frame.
  return (
    <pixiSprite
      key={texture.uid}
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
        case 'polygon':
          drawPolygon(g, item);
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

      if (nativeEvent.altKey) {
        // Alt-clicks cycle the selection through the items under the pointer.
        // Rapid ones must each count, never pair up into a double-click.
        lastClickRef.current = 0;
      } else {
        // Double-click detection
        const now = Date.now();
        if (now - lastClickRef.current < 400) {
          lastClickRef.current = 0;
          e.stopPropagation();
          onItemDoubleClick(item);
          return;
        }
        lastClickRef.current = now;
      }

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
    // Every zoom-dependent setting is written by the function registered with
    // the filter, so the PNG export can set the same filters for its own 1:1
    // scale and put them back (see zoomScaledFilters.ts).
    if (item.blurRadius > 0) {
      const blurRadius = item.blurRadius;
      // ClampingBlurFilter is a Gaussian BlurFilter with shaders that clamp
      // sample UVs to the input texture's active frame (uInputClamp).
      // Pixi's stock BlurFilter samples raw UVs; TexturePool reuses power-
      // of-two textures whose pixels between the frame and po2 boundary
      // keep stale data from previous use, and the blur kernel pulls those
      // bright values into the result. Clamping eliminates that read.
      const blurFilter = new ClampingBlurFilter({
        strength: blurRadius * zoom,
        clipToViewport: false,
      });
      filters.push(
        registerZoomScaledFilter(blurFilter, zoom, dpr, (filterZoom, baseResolution) => {
          const strength = blurRadius * filterZoom;
          blurFilter.strength = strength;
          // With clamping in place, padding determines where the visible blur
          // halo ends. Pixi's auto-padding (strength*2) cuts the Gaussian tail
          // off mid-falloff; the optimized 4-pass kernel reaches ~5× strength,
          // so pad to 6× for a smooth fadeout.
          blurFilter.padding = strength * 6;
          const blurRegionPx = (itemMaxDim + blurFilter.padding * 2) * filterZoom;
          blurFilter.resolution = clampRasterResolution(baseResolution, blurRegionPx, maxTextureSize);
        }),
      );
    }
    if (item.kind !== 'text') {
      const s = item.shadow;
      const hasShadow = s && (s.blur > 0 || s.offsetX !== 0 || s.offsetY !== 0) && s.opacity > 0;
      if (hasShadow) {
        const shadowFilter = new DropShadowFilter({
          color: s.color,
          alpha: s.opacity,
          blur: (s.blur / 2) * zoom,
          offset: { x: s.offsetX * zoom, y: s.offsetY * zoom },
          quality: 8,
        });
        shadowFilter.clipToViewport = false;
        filters.push(
          registerZoomScaledFilter(shadowFilter, zoom, dpr, (filterZoom, baseResolution) => {
            const shadowBlur = (s.blur / 2) * filterZoom;
            const shadowOffsetX = s.offsetX * filterZoom;
            const shadowOffsetY = s.offsetY * filterZoom;
            shadowFilter.blur = shadowBlur;
            shadowFilter.offset = { x: shadowOffsetX, y: shadowOffsetY };
            // DropShadowFilter wraps a Kawase blur whose reach scales with
            // blur × quality. Auto-padding (offset + blur*2 + quality*4) clips
            // the tail; extend it the same way as BlurFilter. Set last: the
            // blur and offset setters reset the padding to the auto value.
            shadowFilter.padding =
              Math.max(Math.abs(shadowOffsetX), Math.abs(shadowOffsetY)) +
              shadowBlur * 6 +
              32;
            const shadowRegionPx = (itemMaxDim + shadowFilter.padding * 2) * filterZoom;
            shadowFilter.resolution = clampRasterResolution(baseResolution, shadowRegionPx, maxTextureSize);
          }),
        );
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

  // Exact hit testing in local space against the straight-edged vertex ring:
  // closed polygons hit on the fill plus the stroke band, open chains hit on a
  // padded corridor along the stroke.
  const polygonHitArea = useMemo(() => {
    if (item.kind !== 'polygon') return null;
    const polygon = item as RenderableCanvasItem & { kind: 'polygon' };
    const local = polygon.vertices.map((v) => ({
      x: v.x - polygon.x,
      y: v.y - polygon.y,
    }));
    if (polygon.closed) {
      const rim = polygon.strokeWidth / 2;
      return {
        contains: (x: number, y: number) =>
          pointInPolygonVertices({ x, y }, local) ||
          (rim > 0 && distanceToPolygonEdges({ x, y }, local, true) <= rim),
      };
    }
    const pad = Math.max(polygon.strokeWidth / 2 + 8, 12);
    return {
      contains: (x: number, y: number) =>
        distanceToPolygonEdges({ x, y }, local, false) <= pad,
    };
  }, [item]);

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
    children = <PixiTextContent item={item} zoom={zoom} />;
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
      hitArea={polygonHitArea ?? shapeHitArea}
      onMouseDown={handleMouseDown}
    >
      {children}
    </pixiContainer>
  );
});
