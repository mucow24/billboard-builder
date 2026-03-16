import type {
  BaseCanvasItem,
  CanvasItem,
  CanvasPreset,
  CanvasSize,
  EllipseCanvasItem,
  ImageCanvasItem,
  LineCanvasItem,
  ProjectDocumentV1,
  CanvasShadow,
  RectangleCanvasItem,
  TextCanvasItem,
} from './documentTypes';

export const DEFAULT_FONT_FAMILY = 'Arial';

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'square-lg', label: '1024 x 1024', width: 1024, height: 1024 },
  { id: 'landscape', label: '1024 x 512', width: 1024, height: 512 },
  { id: 'portrait', label: '512 x 1024', width: 512, height: 1024 },
  { id: 'square-sm', label: '512 x 512', width: 512, height: 512 },
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

const DEFAULT_CANVAS: CanvasSize = {
  width: 1024,
  height: 1024,
  presetId: 'square-lg',
};

function createBaseItem<TKind extends CanvasItem['kind']>(
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
    hidden: false,
    opacity: 1,
    shadow: { ...DEFAULT_ITEM_SHADOW },
  };
}

export function createDefaultProjectDocument(): ProjectDocumentV1 {
  return {
    version: 1,
    canvas: DEFAULT_CANVAS,
    background: '#ffffff00',
    items: [],
    fonts: [],
  };
}

export function normalizeZIndices<T extends CanvasItem>(items: T[]): T[] {
  return items.map((item, index) => ({
    ...item,
    zIndex: index,
  }));
}

export function sortByZIndex<T extends CanvasItem>(items: T[]): T[] {
  return items.slice().sort((left, right) => left.zIndex - right.zIndex);
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
    fill: '#111827',
    align: 'left',
    verticalAlign: 'top',
    lineHeight: 1.1,
    letterSpacing: 0,
    ...position,
  };
}

export function createRectangleItem(
  position?: Partial<RectangleCanvasItem>
): RectangleCanvasItem {
  return {
    ...createBaseItem('rectangle', 'Rectangle'),
    fill: '#f97316',
    stroke: '#c2410cff',
    strokeWidth: 0,
    cornerRadius: 16,
    ...position,
  };
}

export function createEllipseItem(
  position?: Partial<EllipseCanvasItem>
): EllipseCanvasItem {
  return {
    ...createBaseItem('ellipse', 'Ellipse'),
    fill: '#0ea5e9',
    stroke: '#0369a1ff',
    strokeWidth: 0,
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
    preserveAspectRatio: true,
  };
}

export function cloneCanvasItem(item: CanvasItem): CanvasItem {
  const nextId = crypto.randomUUID();
  const basePosition = {
    x: item.x + DUPLICATE_ITEM_OFFSET,
    y: item.y + DUPLICATE_ITEM_OFFSET,
  };

  if (item.kind === 'line') {
    return {
      ...item,
      id: nextId,
      x: item.x + DUPLICATE_ITEM_OFFSET,
      y: item.y + DUPLICATE_ITEM_OFFSET,
      startX: item.startX + DUPLICATE_ITEM_OFFSET,
      startY: item.startY + DUPLICATE_ITEM_OFFSET,
      endX: item.endX + DUPLICATE_ITEM_OFFSET,
      endY: item.endY + DUPLICATE_ITEM_OFFSET,
    };
  }

  return {
    ...item,
    id: nextId,
    ...basePosition,
  };
}
