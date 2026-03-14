export type CanvasTool =
  | 'select'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'line';

export type CanvasItemKind =
  | 'text'
  | 'image'
  | 'rectangle'
  | 'ellipse'
  | 'line';

export interface CanvasSize {
  width: number;
  height: number;
  presetId?: string;
}

export interface CanvasPreset extends CanvasSize {
  id: string;
  label: string;
}

export interface DocumentFontReference {
  family: string;
  sourceName: string;
  kind: 'system' | 'uploaded';
}

export interface BaseCanvasItem {
  id: string;
  kind: CanvasItemKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  opacity: number;
}

export interface TextCanvasItem extends BaseCanvasItem {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: 'normal' | 'italic';
  fontWeight: 'normal' | 'bold';
  fill: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
}

export interface ImageCanvasItem extends BaseCanvasItem {
  kind: 'image';
  src: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  preserveAspectRatio: boolean;
}

export interface RectangleCanvasItem extends BaseCanvasItem {
  kind: 'rectangle';
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface EllipseCanvasItem extends BaseCanvasItem {
  kind: 'ellipse';
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface LineCanvasItem extends BaseCanvasItem {
  kind: 'line';
  stroke: string;
  strokeWidth: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type CanvasItem =
  | TextCanvasItem
  | ImageCanvasItem
  | RectangleCanvasItem
  | EllipseCanvasItem
  | LineCanvasItem;

export interface ProjectDocumentV1 {
  version: 1;
  canvas: CanvasSize;
  background: string;
  items: CanvasItem[];
  selectedItemIds: string[];
  fonts: DocumentFontReference[];
}

export type ProjectDocument = ProjectDocumentV1;

export type ReorderMode = 'forward' | 'backward' | 'front' | 'back';

export type EditorCommand =
  | { type: 'add_item'; item: CanvasItem }
  | { type: 'delete_items'; itemIds: string[] }
  | { type: 'select_items'; itemIds: string[] }
  | { type: 'clear_selection' }
  | { type: 'update_item'; itemId: string; changes: Partial<CanvasItem> }
  | { type: 'update_item_live'; itemId: string; changes: Partial<CanvasItem> }
  | { type: 'set_canvas_size'; canvas: CanvasSize }
  | { type: 'set_background'; background: string }
  | { type: 'reorder_item'; itemId: string; mode: ReorderMode }
  | { type: 'register_font'; font: DocumentFontReference }
  | { type: 'load_document'; document: ProjectDocumentV1 };

export interface UploadedFont {
  family: string;
  sourceName: string;
}

export interface GuideLine {
  orientation: 'vertical' | 'horizontal';
  position: number;
}

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
