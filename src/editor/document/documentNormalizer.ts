import {
  createDefaultProjectDocument,
  createFullImageCropRect,
  DEFAULT_ITEM_SHADOW,
} from './documentDefaults';
import { normalizeImageAdjustments } from './imageAdjustments';
import { collectLeafItems, normalizeLeafZIndices, isGroupNode } from './sceneGraph';
import { normalizeTextPadding } from './textPadding';
import type {
  CanvasItem,
  CanvasNode,
  CanvasShadow,
  EllipseCanvasItem,
  GroupNode,
  ImageCanvasItem,
  LineCanvasItem,
  ProjectDocument,
  LegacyProjectDocumentV1,
  RectangleCanvasItem,
  TextCanvasItem,
} from './documentTypes';

function clampFinite(
  value: number,
  fallback: number,
  min?: number,
  max?: number
): number {
  let nextValue = Number.isFinite(value) ? value : fallback;
  if (min !== undefined) {
    nextValue = Math.max(min, nextValue);
  }
  if (max !== undefined) {
    nextValue = Math.min(max, nextValue);
  }
  return nextValue;
}

function clampDimension(value: number): number {
  return clampFinite(value, 1, 1);
}

function clampOpacity(value: number, fallback = 1): number {
  return clampFinite(value, fallback, 0, 1);
}

function clampLineStrokeWidth(value: number): number {
  return clampFinite(value, 1, 1);
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

function normalizeGradientFill<T extends { fill: string; secondaryFill?: string; gradientEnabled?: boolean }>(
  item: T,
): Pick<T, 'fill'> & { secondaryFill: string; gradientEnabled: boolean } {
  return {
    fill: item.fill,
    secondaryFill: typeof item.secondaryFill === 'string' ? item.secondaryFill : item.fill,
    gradientEnabled: Boolean(item.gradientEnabled),
  };
}

export function normalizeCanvasItem(item: CanvasItem): CanvasItem {
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
        fontSize: clampFinite(item.fontSize, 1, 1),
        lineHeight: clampFinite(item.lineHeight, 1, 0.1),
        letterSpacing: clampFinite(item.letterSpacing ?? 0, 0),
        padding: normalizeTextPadding(item.padding),
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
        strokeWidth: clampFinite(item.strokeWidth, 0, 0),
      };
      return normalizedEllipseItem;
    }
    case 'line': {
      const startX = clampFinite(item.startX, item.x);
      const startY = clampFinite(item.startY, item.y);
      const endX = clampFinite(item.endX, item.x + item.width);
      const endY = clampFinite(item.endY, item.y + item.height);
      const normalizedLineItem: LineCanvasItem = {
        ...item,
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: Math.max(1, Math.abs(endX - startX)),
        height: Math.max(1, Math.abs(endY - startY)),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
        lockAspectRatio: Boolean(item.lockAspectRatio),
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        startX,
        startY,
        endX,
        endY,
        strokeWidth: clampLineStrokeWidth(item.strokeWidth),
      };
      return normalizedLineItem;
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
  const referencedFamilies = new Set(
    nodes
      .flatMap(collectLeafItems)
      .filter((item) => item.kind === 'text')
      .map((item) => item.fontFamily),
  );

  return fonts.filter((font) => referencedFamilies.has(font.family));
}

type ProjectInput = Partial<ProjectDocument> | Partial<LegacyProjectDocumentV1> | undefined;

export function normalizeProjectDocument(
  input: ProjectInput
): ProjectDocument {
  const baseDocument = createDefaultProjectDocument();
  const projectInput = input ?? {};
  const projectNodes = 'nodes' in projectInput
    ? ((projectInput as Partial<ProjectDocument>).nodes ?? [])
    : undefined;
  const legacyItems = (projectInput as Partial<ProjectDocument> & Partial<LegacyProjectDocumentV1>).items ?? [];
  const rawNodes = projectNodes && projectNodes.length > 0 ? projectNodes : legacyItems;
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

  return {
    version: 2,
    canvas: {
      width: clampDimension(input?.canvas?.width ?? baseDocument.canvas.width),
      height: clampDimension(input?.canvas?.height ?? baseDocument.canvas.height),
      presetId:
        typeof input?.canvas?.presetId === 'string' ? input.canvas.presetId : undefined,
    },
    background: input?.background ?? baseDocument.background,
    nodes: normalizedNodes,
    items: normalizedNodes.flatMap(collectLeafItems),
    fonts: normalizedFonts,
  };
}

export function normalizeExistingProjectDocument(document: ProjectDocument): ProjectDocument {
  return normalizeProjectDocument(document);
}
