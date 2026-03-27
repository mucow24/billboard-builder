export type CanvasTool =
  | 'select'
  | 'pan'
  | 'zoom'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'line';

export type CanvasLeafKind =
  | 'text'
  | 'image'
  | 'rectangle'
  | 'ellipse'
  | 'line';

export type CanvasNodeKind = CanvasLeafKind | 'group';

export type TextAlign = 'left' | 'center' | 'right';

export type TextVerticalAlign = 'top' | 'middle' | 'bottom';

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
  kind: 'system' | 'bundled' | 'uploaded';
}

export interface CanvasShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  tintColor: string;
  tintStrength: number;
}

export interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSourceTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BaseCanvasItem {
  id: string;
  kind: CanvasLeafKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  // Derived runtime ordering for leaf helpers that still assume flat items.
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  opacity: number;
  shadow: CanvasShadow;
}

export interface GradientFillItem {
  fill: string;
  secondaryFill: string;
  gradientEnabled: boolean;
}

export interface TextCanvasItem extends BaseCanvasItem, GradientFillItem {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: 'normal' | 'italic';
  fontWeight: 'normal' | 'bold';
  align: TextAlign;
  verticalAlign: TextVerticalAlign;
  lineHeight: number;
  letterSpacing: number;
  padding: TextPadding;
}

export interface ImageCanvasItem extends BaseCanvasItem {
  kind: 'image';
  src: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  crop: ImageCropRect;
  sourceTransform: ImageSourceTransform;
  preserveAspectRatio: boolean;
  adjustments: ImageAdjustments;
}

export interface RectangleCanvasItem extends BaseCanvasItem, GradientFillItem {
  kind: 'rectangle';
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface EllipseCanvasItem extends BaseCanvasItem, GradientFillItem {
  kind: 'ellipse';
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

export interface GroupNode {
  id: string;
  kind: 'group';
  name: string;
  locked: boolean;
  hidden: boolean;
  opacity: number;
  children: CanvasNode[];
}

export type CanvasNode = GroupNode | CanvasItem;

export interface LegacyProjectDocumentV1 {
  version: 1;
  canvas: CanvasSize;
  background: string;
  items: CanvasItem[];
  fonts: DocumentFontReference[];
}

export interface ProjectDocumentV2 {
  version: 2;
  canvas: CanvasSize;
  background: string;
  nodes: CanvasNode[];
  // Derived compatibility view during the scene-graph migration.
  items: CanvasItem[];
  fonts: DocumentFontReference[];
}

export type ProjectDocument = ProjectDocumentV2;
export type ProjectDocumentV1 = LegacyProjectDocumentV1 | ProjectDocumentV2;

export type ReorderMode = 'forward' | 'backward' | 'front' | 'back';

export type EditorCommand =
  | { type: 'add_item'; item: CanvasItem }
  | { type: 'insert_nodes'; nodes: CanvasNode[]; parentId?: string; index?: number }
  | { type: 'delete_items'; itemIds: string[] }
  | { type: 'delete_nodes'; nodeIds: string[] }
  | { type: 'select_items'; itemIds: string[] }
  | { type: 'select_nodes'; nodeIds: string[] }
  | { type: 'clear_selection' }
  | { type: 'update_item'; itemId: string; changes: Partial<CanvasItem> }
  | { type: 'update_group'; groupId: string; changes: Partial<Pick<GroupNode, 'name' | 'opacity' | 'locked' | 'hidden'>> }
  | { type: 'group_nodes'; nodeIds: string[] }
  | { type: 'ungroup_node'; groupId: string }
  | { type: 'set_canvas_size'; canvas: CanvasSize }
  | { type: 'set_background'; background: string }
  | { type: 'reorder_item'; itemId: string; mode: ReorderMode }
  | { type: 'reorder_node'; nodeId: string; mode: ReorderMode }
  | { type: 'reorder_items'; itemIds: string[]; mode: ReorderMode }
  | { type: 'reorder_nodes'; nodeIds: string[]; mode: ReorderMode }
  | { type: 'register_font'; font: DocumentFontReference }
  | { type: 'load_document'; document: ProjectDocument | ProjectDocumentV1 };

export interface UploadedFont {
  family: string;
  sourceName: string;
  weight: '400' | '700';
  style: 'normal' | 'italic';
  kind: 'bundled' | 'uploaded';
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
