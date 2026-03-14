import type {
  BaseCanvasItem,
  CanvasItem,
  CanvasPreset,
  CanvasSize,
  EllipseCanvasItem,
  ImageCanvasItem,
  LineCanvasItem,
  ProjectDocumentV1,
  RectangleCanvasItem,
  TextCanvasItem,
} from './types';

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
  };
}

export function createDefaultProjectDocument(): ProjectDocumentV1 {
  return {
    version: 1,
    canvas: DEFAULT_CANVAS,
    background: '#ffffff00',
    items: [],
    selectedItemIds: [],
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
    fontWeight: 'bold',
    fill: '#111827',
    align: 'left',
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

export function createImageItem(
  input: Pick<ImageCanvasItem, 'src' | 'mimeType' | 'originalWidth' | 'originalHeight'> &
    Partial<ImageCanvasItem>
): ImageCanvasItem {
  const aspectRatio = input.originalWidth / input.originalHeight;
  const width = input.width ?? 320;
  const height = input.height ?? Math.round(width / aspectRatio);

  return {
    ...createBaseItem('image', 'Image'),
    width,
    height,
    preserveAspectRatio: true,
    ...input,
  };
}

export function cloneCanvasItem(
  item: CanvasItem,
  offset: { x: number; y: number } = {
    x: DUPLICATE_ITEM_OFFSET,
    y: DUPLICATE_ITEM_OFFSET,
  }
): CanvasItem {
  if (item.kind === 'line') {
    const clonedLineItem: LineCanvasItem = {
      ...item,
      id: crypto.randomUUID(),
      x: item.x + offset.x,
      y: item.y + offset.y,
      startX: item.startX + offset.x,
      startY: item.startY + offset.y,
      endX: item.endX + offset.x,
      endY: item.endY + offset.y,
    };

    return clonedLineItem;
  }

  return {
    ...item,
    id: crypto.randomUUID(),
    x: item.x + offset.x,
    y: item.y + offset.y,
  };
}
