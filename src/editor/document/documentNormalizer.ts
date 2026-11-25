import { splitColorAlpha } from '../generators/colorUtils';
import { fontFamilyUseOf } from '../fonts/boldWeight';
import { clampFinite } from './clampFinite';
import {
  createDefaultProjectDocument,
  createFullImageCropRect,
  DEFAULT_CANVAS_NAME,
  DEFAULT_ITEM_SHADOW,
  DEFAULT_TEXT_STROKE,
  MIN_LINE_STROKE_WIDTH,
} from './documentDefaults';
import { normalizeImageAdjustments } from './imageAdjustments';
import { collectLeafItems, normalizeLeafZIndices, isGroupNode } from './sceneGraph';
import { normalizeTextPadding } from './textPadding';
import type {
  CanvasItem,
  CanvasNode,
  CanvasShadow,
  EllipseCanvasItem,
  GeneratorCanvasItem,
  GeneratorParams,
  GroupNode,
  ImageCanvasItem,
  LegacyLineCanvasItem,
  NgonCanvasItem,
  PolygonCanvasItem,
  ProjectDocument,
  RectangleCanvasItem,
  TextCanvasItem,
} from './documentTypes';
import {
  polygonMinVertices,
  polygonBounds,
  rectanglePolygonVertices,
} from './polygonVertices';

function clampDimension(value: number): number {
  return clampFinite(value, 1, 1);
}

/** A line is only its stroke, so it never goes to 0 (see `MIN_LINE_STROKE_WIDTH`). */
function clampLineStrokeWidth(value: number): number {
  return clampFinite(value, 1, MIN_LINE_STROKE_WIDTH);
}

function clampOpacity(value: number, fallback = 1): number {
  return clampFinite(value, fallback, 0, 1);
}

function normalizeShadow(shadow: Partial<CanvasShadow> | undefined): CanvasShadow {
  const nextShadow = {
    ...DEFAULT_ITEM_SHADOW,
    ...(shadow ?? {}),
  };

  return {
    color: nextShadow.color,
    blur: clampFinite(nextShadow.blur, DEFAULT_ITEM_SHADOW.blur, 0),
    offsetX: clampFinite(nextShadow.offsetX, DEFAULT_ITEM_SHADOW.offsetX),
    offsetY: clampFinite(nextShadow.offsetY, DEFAULT_ITEM_SHADOW.offsetY),
    opacity: clampOpacity(nextShadow.opacity, DEFAULT_ITEM_SHADOW.opacity),
  };
}

function normalizeImageCrop(
  crop: Partial<ImageCanvasItem['crop']> | undefined,
  originalWidth: number,
  originalHeight: number,
): ImageCanvasItem['crop'] {
  const defaultCrop = createFullImageCropRect(originalWidth, originalHeight);
  const nextCrop = {
    ...defaultCrop,
    ...(crop ?? {}),
  };

  let width = clampFinite(nextCrop.width, defaultCrop.width, 1, originalWidth);
  let height = clampFinite(nextCrop.height, defaultCrop.height, 1, originalHeight);
  const x = clampFinite(nextCrop.x, defaultCrop.x, 0, originalWidth - width);
  const y = clampFinite(nextCrop.y, defaultCrop.y, 0, originalHeight - height);

  width = Math.min(width, originalWidth - x);
  height = Math.min(height, originalHeight - y);

  return {
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function deriveImageSourceTransformFromCrop(params: {
  crop: ImageCanvasItem['crop'];
  frameWidth: number;
  frameHeight: number;
  mirrorHorizontal: boolean;
  originalWidth: number;
  originalHeight: number;
}): ImageCanvasItem['sourceTransform'] {
  const scaleX = params.frameWidth / Math.max(params.crop.width, 1);
  const scaleY = params.frameHeight / Math.max(params.crop.height, 1);

  return {
    x: params.mirrorHorizontal
      ? -(params.originalWidth - params.crop.x - params.crop.width) * scaleX
      : -params.crop.x * scaleX,
    y: -params.crop.y * scaleY,
    width: params.originalWidth * scaleX,
    height: params.originalHeight * scaleY,
    rotation: 0,
  };
}

function normalizeImageSourceTransform(
  sourceTransform: Partial<ImageCanvasItem['sourceTransform']> | undefined,
  fallbackCrop: ImageCanvasItem['crop'],
  frameWidth: number,
  frameHeight: number,
  mirrorHorizontal: boolean,
  originalWidth: number,
  originalHeight: number,
): ImageCanvasItem['sourceTransform'] {
  const fallback = deriveImageSourceTransformFromCrop({
    crop: fallbackCrop,
    frameWidth,
    frameHeight,
    mirrorHorizontal,
    originalWidth,
    originalHeight,
  });
  const nextSourceTransform = {
    ...fallback,
    ...(sourceTransform ?? {}),
  };

  return {
    x: clampFinite(nextSourceTransform.x, fallback.x),
    y: clampFinite(nextSourceTransform.y, fallback.y),
    width: clampDimension(nextSourceTransform.width),
    height: clampDimension(nextSourceTransform.height),
    rotation: clampFinite(nextSourceTransform.rotation, fallback.rotation),
  };
}

function normalizeGradientFill<T extends { fill: string; secondaryFill?: string; gradientEnabled?: boolean; gradientAngle?: number }>(
  item: T,
): Pick<T, 'fill'> & { secondaryFill: string; gradientEnabled: boolean; gradientAngle: number } {
  return {
    fill: item.fill,
    secondaryFill: typeof item.secondaryFill === 'string' ? item.secondaryFill : item.fill,
    gradientEnabled: Boolean(item.gradientEnabled),
    gradientAngle: clampFinite(item.gradientAngle ?? 0, 0),
  };
}

/**
 * Scanlines used to carry their transparency in the color's alpha digits.
 * Opacity is now a setting of its own, so a layer saved without one takes its
 * opacity from that alpha and keeps the color opaque: it looks the same.
 *
 * Diagonal bands saved before the bands were centered on the item keep their
 * old layout, so they look the same too.
 */
function normalizeGeneratorParams(params: GeneratorParams): GeneratorParams {
  if (params.generatorType === 'bands') {
    return typeof params.stripeCentered === 'boolean'
      ? params
      : { ...params, stripeCentered: false };
  }
  if (params.generatorType !== 'scanlines') {
    return params;
  }
  if (typeof params.opacity === 'number' && Number.isFinite(params.opacity)) {
    return { ...params, opacity: Math.max(0, Math.min(1, params.opacity)) };
  }
  const { alpha, color } = splitColorAlpha(params.scanlineColor);
  return { ...params, scanlineColor: color, opacity: alpha };
}

/**
 * Normalize one item. Also the single place a line saved in the old format
 * (start and end point, no fill) becomes a two-vertex open polygon.
 */
export function normalizeCanvasItem(item: CanvasItem | LegacyLineCanvasItem): CanvasItem {
  switch (item.kind) {
    case 'text': {
      const normalizedTextItem: TextCanvasItem = {
        ...item,
        ...normalizeGradientFill(item),
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        fontSize: clampFinite(item.fontSize, 1, 1),
        // Any finite value: 0 puts every line on the first, and a negative one
        // stacks the lines upwards.
        lineHeight: clampFinite(item.lineHeight, 1),
        letterSpacing: clampFinite(item.letterSpacing ?? 0, 0),
        padding: normalizeTextPadding(item.padding),
        // Text saved before it had an outline has neither field.
        stroke: typeof item.stroke === 'string' ? item.stroke : DEFAULT_TEXT_STROKE,
        strokeWidth: clampFinite(item.strokeWidth ?? 0, 0, 0),
      };
      return normalizedTextItem;
    }
    case 'image': {
      const originalWidth = clampFinite(item.originalWidth, 1, 1);
      const originalHeight = clampFinite(item.originalHeight, 1, 1);
      const width = clampDimension(item.width);
      const height = clampDimension(item.height);
      const crop = normalizeImageCrop(item.crop, originalWidth, originalHeight);
      const mirrorHorizontal = Boolean(item.mirrorHorizontal);
      const normalizedImageItem: ImageCanvasItem = {
        ...item,
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width,
        height,
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        originalWidth,
        originalHeight,
        crop,
        sourceTransform: normalizeImageSourceTransform(
          item.sourceTransform,
          crop,
          width,
          height,
          mirrorHorizontal,
          originalWidth,
          originalHeight,
        ),
        mirrorHorizontal,
        preserveAspectRatio: Boolean(item.preserveAspectRatio),
        adjustments: normalizeImageAdjustments(item.adjustments),
      };
      return normalizedImageItem;
    }
    case 'rectangle': {
      const normalizedRectangleItem: RectangleCanvasItem = {
        ...item,
        ...normalizeGradientFill(item),
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        strokeWidth: clampFinite(item.strokeWidth, 0, 0),
        cornerRadius: clampFinite(item.cornerRadius, 0, 0),
      };
      return normalizedRectangleItem;
    }
    case 'ellipse': {
      const normalizedEllipseItem: EllipseCanvasItem = {
        ...item,
        ...normalizeGradientFill(item),
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        strokeWidth: clampFinite(item.strokeWidth, 0, 0),
      };
      return normalizedEllipseItem;
    }
    case 'ngon': {
      const normalizedNgonItem: NgonCanvasItem = {
        ...item,
        ...normalizeGradientFill(item),
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        strokeWidth: clampFinite(item.strokeWidth, 0, 0),
        sides: Math.max(3, Math.trunc(clampFinite(item.sides, 6, 3))),
      };
      return normalizedNgonItem;
    }
    case 'polygon': {
      // Vertices are the geometry source of truth: clamp them finite, rebuild
      // them from the item's box if the list degenerated below the floor (a
      // rectangle ring when closed, the box's diagonal when open), and
      // re-derive the AABB in x/y/width/height.
      const closed = item.closed !== false;
      const boxX = clampFinite(item.x, 0);
      const boxY = clampFinite(item.y, 0);
      const boxWidth = clampDimension(item.width);
      const boxHeight = clampDimension(item.height);
      const fallbackVertices = closed
        ? rectanglePolygonVertices(boxX, boxY, boxWidth, boxHeight)
        : [
            { x: boxX, y: boxY },
            { x: boxX + boxWidth, y: boxY + boxHeight },
          ];
      const clampedVertices = (Array.isArray(item.vertices) ? item.vertices : []).map(
        (vertex) => ({
          x: clampFinite(vertex?.x, 0),
          y: clampFinite(vertex?.y, 0),
        }),
      );
      const vertices =
        clampedVertices.length >= polygonMinVertices(closed) ? clampedVertices : fallbackVertices;
      const normalizedPolygonItem: PolygonCanvasItem = {
        ...item,
        ...normalizeGradientFill(item),
        ...polygonBounds(vertices),
        // Rotation is not part of the polygon model (rotating rewrites the
        // vertices instead), so it pins at 0.
        rotation: 0,
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        // A line is only its stroke, so it never goes to 0; a closed polygon
        // can drop its outline entirely.
        strokeWidth: closed ? clampFinite(item.strokeWidth, 0, 0) : clampLineStrokeWidth(item.strokeWidth),
        vertices,
        closed,
        curveRadius: clampFinite(item.curveRadius ?? 0, 0, 0),
      };
      return normalizedPolygonItem;
    }
    case 'line': {
      const startX = clampFinite(item.startX, item.x);
      const startY = clampFinite(item.startY, item.y);
      const endX = clampFinite(item.endX, item.x + item.width);
      const endY = clampFinite(item.endY, item.y + item.height);
      // Drop the old endpoint fields; the vertices carry them from here on.
      const legacyRest: Omit<LegacyLineCanvasItem, 'startX' | 'startY' | 'endX' | 'endY'> &
        Partial<LegacyLineCanvasItem> = { ...item };
      delete legacyRest.startX;
      delete legacyRest.startY;
      delete legacyRest.endX;
      delete legacyRest.endY;
      const vertices = [
        { x: startX, y: startY },
        { x: endX, y: endY },
      ];
      const normalizedLineItem: PolygonCanvasItem = {
        ...legacyRest,
        kind: 'polygon',
        ...polygonBounds(vertices),
        // Part of the polygon model, never painted on an open chain.
        fill: '#f97316',
        secondaryFill: '#0840e9',
        gradientEnabled: false,
        gradientAngle: 0,
        rotation: 0,
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        // A line saved in the old format was never drawn thinner than 1.
        strokeWidth: clampDimension(item.strokeWidth),
        vertices,
        closed: false,
        curveRadius: 0,
      };
      return normalizedLineItem;
    }
    case 'generator': {
      const normalizedGeneratorItem: GeneratorCanvasItem = {
        ...item,
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        blurRadius: clampFinite(item.blurRadius ?? 0, 0, 0),
        seed: clampFinite(item.seed, 0),
        generatorParams: normalizeGeneratorParams(item.generatorParams),
      };
      return normalizedGeneratorItem;
    }
  }
}

function normalizeCanvasNode(node: CanvasNode): CanvasNode {
  if (isGroupNode(node)) {
    const normalizedGroupNode: GroupNode = {
      id: typeof node.id === 'string' && node.id.length > 0 ? node.id : crypto.randomUUID(),
      kind: 'group',
      name: typeof node.name === 'string' && node.name.length > 0 ? node.name : 'Group',
      locked: Boolean(node.locked),
      hidden: Boolean(node.hidden),
      opacity: clampOpacity(node.opacity),
      children: Array.isArray(node.children) ? node.children.map(normalizeCanvasNode) : [],
    };
    return normalizedGroupNode;
  }
  return normalizeCanvasItem(node);
}

function normalizeCanvasNodes(nodes: CanvasNode[]): CanvasNode[] {
  return normalizeLeafZIndices(nodes.map(normalizeCanvasNode));
}

function normalizeDocumentFonts(
  nodes: CanvasNode[],
  fonts: ProjectDocument['fonts'],
): ProjectDocument['fonts'] {
  // A family stays referenced while text is set in it, or may be drawn in it:
  // bold text is drawn in a heavier weight of its typeface (see `boldWeight`).
  const isUsed = fontFamilyUseOf(
    nodes.flatMap(collectLeafItems).flatMap((item) => (item.kind === 'text' ? [item] : [])),
  );

  return fonts.filter((font) => isUsed(font.family));
}

type ProjectInput = Partial<ProjectDocument> | undefined;

export function normalizeProjectDocument(
  input: ProjectInput
): ProjectDocument {
  const baseDocument = createDefaultProjectDocument();
  const projectInput = input ?? {};
  const rawNodes = projectInput.nodes ?? [];
  const normalizedNodes = normalizeCanvasNodes(rawNodes);
  const normalizedFonts = normalizeDocumentFonts(
    normalizedNodes,
    (input?.fonts ?? []).filter((font): font is ProjectDocument['fonts'][number] => {
      return (
        typeof font?.family === 'string' &&
        typeof font?.sourceName === 'string' &&
        (font?.kind === 'system' || font?.kind === 'bundled' || font?.kind === 'uploaded')
      );
    }),
  );

  const trimmedName =
    typeof input?.name === 'string' ? input.name.trim() : '';

  return {
    version: 2,
    name: trimmedName.length > 0 ? trimmedName : DEFAULT_CANVAS_NAME,
    canvas: {
      width: clampDimension(input?.canvas?.width ?? baseDocument.canvas.width),
      height: clampDimension(input?.canvas?.height ?? baseDocument.canvas.height),
      presetId:
        typeof input?.canvas?.presetId === 'string' ? input.canvas.presetId : undefined,
    },
    background: input?.background ?? baseDocument.background,
    nodes: normalizedNodes,
    fonts: normalizedFonts,
  };
}
