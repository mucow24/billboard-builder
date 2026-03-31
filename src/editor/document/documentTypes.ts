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
  | 'line'
  | 'generator';

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
  lockAspectRatio: boolean;
  hidden: boolean;
  opacity: number;
  shadow: CanvasShadow;
  blurRadius: number;
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
  mirrorHorizontal: boolean;
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

export interface BandsGeneratorParams {
  generatorType: 'bands';
  bandColorA: string;
  bandColorB: string;
  shadowColor: string;
  stripeCount: number;
  stripeAngle: number;
  stripeThickness: number;
  stripeSpacingJitter: number;
  stripeOffset: number;
  stripeSkew: number;
  stripeContrast: number;
  stripeGlow: number;
  seedOverride: number | null;
}

export interface BurstGeneratorParams {
  generatorType: 'burst';
  accentColor: string;
  bandColorB: string;
  burstRays: number;
  burstScale: number;
  burstOpacity: number;
  burstOffsetX: number;
  burstOffsetY: number;
  burstRotation: number;
}

export interface ZigzagsGeneratorParams {
  generatorType: 'zigzags';
  accentColor: string;
  bandColorA: string;
  zigzagCount: number;
  zigzagAmplitude: number;
  zigzagThickness: number;
  zigzagOpacity: number;
  seedOverride: number | null;
}

export interface FlatGridGeneratorParams {
  generatorType: 'flatGrid';
  accentColor: string;
  gridSpacingX: number;
  gridSpacingY: number;
  gridThickness: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridRotation: number;
}

export interface PerspectiveGridGeneratorParams {
  generatorType: 'perspectiveGrid';
  bandColorB: string;
  perspectiveHorizon: number;
  perspectiveDepth: number;
  perspectiveNear: number;
  perspectiveExtent: number;
  perspectiveThickness: number;
  perspectiveThicknessFalloff: number;
  perspectiveRows: number;
}

export interface ScanlinesGeneratorParams {
  generatorType: 'scanlines';
  scanlineSpacing: number;
  scanlineOpacity: number;
}

export interface NoiseGeneratorParams {
  generatorType: 'noise';
  noise: number;
  seedOverride: number | null;
}

export interface VignetteGeneratorParams {
  generatorType: 'vignette';
  vignette: number;
}

export type ShapeTypeKey = 'rect' | 'diamond' | 'triangle' | 'circle' | 'bar';

export interface ShapesGeneratorParams {
  generatorType: 'shapes';
  accentColor: string;
  bandColorA: string;
  bandColorB: string;
  shapeTypes: Record<ShapeTypeKey, boolean>;
  shapeCount: number;
  shapeMinSize: number;
  shapeMaxSize: number;
  shapeRotation: number;
  shapeOpacity: number;
  shapeOutline: number;
  shapeMix: number;
  seedOverride: number | null;
}

export type GeneratorParams =
  | BandsGeneratorParams
  | BurstGeneratorParams
  | ZigzagsGeneratorParams
  | FlatGridGeneratorParams
  | PerspectiveGridGeneratorParams
  | ScanlinesGeneratorParams
  | NoiseGeneratorParams
  | VignetteGeneratorParams
  | ShapesGeneratorParams;

export interface GeneratorCanvasItem extends BaseCanvasItem {
  kind: 'generator';
  seed: number;
  generatorParams: GeneratorParams;
}

export type CanvasItem =
  | TextCanvasItem
  | ImageCanvasItem
  | RectangleCanvasItem
  | EllipseCanvasItem
  | LineCanvasItem
  | GeneratorCanvasItem;

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
