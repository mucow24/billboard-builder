import {
  createDefaultProjectDocument,
  DEFAULT_ITEM_SHADOW,
  normalizeZIndices,
  sortByZIndex,
} from './documentDefaults';
import { normalizeImageAdjustments } from './imageAdjustments';
import { normalizeTextPadding } from './textPadding';
import type {
  CanvasItem,
  CanvasShadow,
  EllipseCanvasItem,
  ImageCanvasItem,
  LineCanvasItem,
  ProjectDocumentV1,
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

export function normalizeCanvasItem(item: CanvasItem): CanvasItem {
  switch (item.kind) {
    case 'text': {
      const normalizedTextItem: TextCanvasItem = {
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
      const normalizedImageItem: ImageCanvasItem = {
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
        hidden: Boolean(item.hidden),
        opacity: clampOpacity(item.opacity),
        shadow: normalizeShadow(item.shadow),
        originalWidth: clampFinite(item.originalWidth, 1, 1),
        originalHeight: clampFinite(item.originalHeight, 1, 1),
        preserveAspectRatio: Boolean(item.preserveAspectRatio),
        adjustments: normalizeImageAdjustments(item.adjustments),
      };
      return normalizedImageItem;
    }
    case 'rectangle': {
      const normalizedRectangleItem: RectangleCanvasItem = {
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
        x: clampFinite(item.x, 0),
        y: clampFinite(item.y, 0),
        width: clampDimension(item.width),
        height: clampDimension(item.height),
        rotation: clampFinite(item.rotation, 0),
        scaleX: clampFinite(item.scaleX, 1),
        scaleY: clampFinite(item.scaleY, 1),
        zIndex: Math.max(0, Math.trunc(clampFinite(item.zIndex, 0, 0))),
        locked: Boolean(item.locked),
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

export function normalizeProjectDocument(
  input: Partial<ProjectDocumentV1> | undefined,
): ProjectDocumentV1 {
  const baseDocument = createDefaultProjectDocument();
  const items = normalizeZIndices(sortByZIndex((input?.items ?? []).map(normalizeCanvasItem)));

  return {
    version: 1,
    canvas: {
      width: clampDimension(input?.canvas?.width ?? baseDocument.canvas.width),
      height: clampDimension(input?.canvas?.height ?? baseDocument.canvas.height),
      presetId:
        typeof input?.canvas?.presetId === 'string' ? input.canvas.presetId : undefined,
    },
    background: input?.background ?? baseDocument.background,
    items,
    fonts: (input?.fonts ?? []).filter((font): font is ProjectDocumentV1['fonts'][number] => {
      return (
        typeof font?.family === 'string' &&
        typeof font?.sourceName === 'string' &&
        (font?.kind === 'system' || font?.kind === 'bundled' || font?.kind === 'uploaded')
      );
    }),
  };
}

export function normalizeExistingProjectDocument(document: ProjectDocumentV1): ProjectDocumentV1 {
  return normalizeProjectDocument(document);
}
