import { getGenerator } from '../generators';
import { DEFAULT_IMAGE_ADJUSTMENTS } from './imageAdjustments';
import { DEFAULT_TEXT_PADDING } from './textPadding';

import type {
  BaseCanvasItem,
  CanvasLeafKind,
  CanvasPreset,
  CanvasSize,
  CanvasShadow,
  EllipseCanvasItem,
  GeneratorCanvasItem,
  ImageCropRect,
  ImageCanvasItem,
  LineCanvasItem,
  NgonCanvasItem,
  ProjectDocument,
  RectangleCanvasItem,
  TextCanvasItem,
} from './documentTypes';
import { createGroupNode } from './sceneGraph';

export const DEFAULT_FONT_FAMILY = 'Arial';

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'square-lg', label: '2048 x 2048', width: 2048, height: 2048 },
  { id: 'landscape', label: '2048 x 1024', width: 2048, height: 1024 },
  { id: 'portrait', label: '1024 x 2048', width: 1024, height: 2048 },
  { id: 'square-sm', label: '1024 x 1024', width: 1024, height: 1024 },
];

export const WEB_SAFE_FONTS = [
  'Arial',
  'Georgia',
  'Helvetica',
  'Impact',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
] as const;

export const DUPLICATE_ITEM_OFFSET = 24;

export const DEFAULT_ITEM_SHADOW: CanvasShadow = {
  color: '#000000',
  blur: 0,
  offsetX: 0,
  offsetY: 0,
  opacity: 0,
} as const;

export function createFullImageCropRect(
  originalWidth: number,
  originalHeight: number,
): ImageCropRect {
  return {
    x: 0,
    y: 0,
    width: originalWidth,
    height: originalHeight,
  };
}

const DEFAULT_CANVAS: CanvasSize = {
  width: 2048,
  height: 2048,
  presetId: 'square-lg',
};

function createBaseItem<TKind extends CanvasLeafKind>(
  kind: TKind,
  name: string
): BaseCanvasItem & { kind: TKind } {
  return {
    id: crypto.randomUUID(),
    kind,
    name,
    x: 120,
    y: 120,
    width: 240,
    height: 120,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    zIndex: 0,
    locked: false,
    lockAspectRatio: false,
    hidden: false,
    opacity: 1,
    shadow: { ...DEFAULT_ITEM_SHADOW },
    blurRadius: 0,
  };
}

export function createDefaultProjectDocument(): ProjectDocument {
  return {
    version: 2,
    canvas: DEFAULT_CANVAS,
    background: '#ffffff00',
    nodes: [],
    fonts: [],
  };
}

export function createTextItem(position?: Partial<TextCanvasItem>): TextCanvasItem {
  return {
    ...createBaseItem('text', 'Text'),
    width: 320,
    height: 96,
    text: 'Double-click to edit',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: 42,
    fontStyle: 'normal',
    fontWeight: 'normal',
    fill: '#ffffff',
    secondaryFill: '#ffffff',
    gradientEnabled: false,
    gradientAngle: 0,
    align: 'left',
    verticalAlign: 'top',
    lineHeight: 1.1,
    letterSpacing: 0,
    padding: { ...DEFAULT_TEXT_PADDING },
    ...position,
  };
}

export function createRectangleItem(
  position?: Partial<RectangleCanvasItem>
): RectangleCanvasItem {
  return {
    ...createBaseItem('rectangle', 'Rectangle'),
    fill: '#f97316',
    secondaryFill: '#f97316',
    gradientEnabled: false,
    gradientAngle: 0,
    stroke: '#c2410cff',
    strokeWidth: 0,
    cornerRadius: 0,
    ...position,
  };
}

export function createEllipseItem(
  position?: Partial<EllipseCanvasItem>
): EllipseCanvasItem {
  return {
    ...createBaseItem('ellipse', 'Ellipse'),
    fill: '#0ea5e9',
    secondaryFill: '#0ea5e9',
    gradientEnabled: false,
    gradientAngle: 0,
    stroke: '#0369a1ff',
    strokeWidth: 0,
    ...position,
  };
}

export function createNgonItem(
  position?: Partial<NgonCanvasItem>
): NgonCanvasItem {
  return {
    ...createBaseItem('ngon', 'Polygon'),
    fill: '#8b5cf6',
    secondaryFill: '#8b5cf6',
    gradientEnabled: false,
    gradientAngle: 0,
    stroke: '#6d28d9ff',
    strokeWidth: 0,
    sides: 6,
    ...position,
  };
}

export function createLineItem(position?: Partial<LineCanvasItem>): LineCanvasItem {
  return {
    ...createBaseItem('line', 'Line'),
    width: 240,
    height: 24,
    stroke: '#111827ff',
    strokeWidth: 6,
    startX: position?.x ?? 160,
    startY: position?.y ?? 160,
    endX: (position?.x ?? 160) + 240,
    endY: (position?.y ?? 160) + 24,
    ...position,
  };
}

export function createImageItem(params: {
  x?: number;
  y?: number;
  src: string;
  mimeType: string;
  width?: number;
  height?: number;
  originalWidth: number;
  originalHeight: number;
  name?: string;
}): ImageCanvasItem {
  return {
    ...createBaseItem('image', params.name ?? 'Image'),
    x: params.x ?? 120,
    y: params.y ?? 120,
    width: params.width ?? params.originalWidth,
    height: params.height ?? params.originalHeight,
    src: params.src,
    mimeType: params.mimeType,
    originalWidth: params.originalWidth,
    originalHeight: params.originalHeight,
    crop: createFullImageCropRect(params.originalWidth, params.originalHeight),
    sourceTransform: {
      x: 0,
      y: 0,
      width: params.width ?? params.originalWidth,
      height: params.height ?? params.originalHeight,
      rotation: 0,
    },
    mirrorHorizontal: false,
    preserveAspectRatio: true,
    adjustments: { ...DEFAULT_IMAGE_ADJUSTMENTS },
  };
}

export function createGeneratorItem(
  generatorType: string,
  canvasWidth: number,
  canvasHeight: number,
): GeneratorCanvasItem {
  const spec = getGenerator(generatorType);
  if (!spec) throw new Error(`Unknown generator type: ${generatorType}`);
  return {
    ...createBaseItem('generator', spec.label),
    x: 0,
    y: 0,
    width: canvasWidth,
    height: canvasHeight,
    seed: Math.floor(Math.random() * 0xffffffff),
    generatorParams: spec.createDefaultParams(),
  };
}

export { createGroupNode };

