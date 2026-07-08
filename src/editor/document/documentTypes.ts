export type CanvasTool =
  | 'select'
  | 'pan'
  | 'zoom'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'ngon'
  | 'polygon'
  | 'line';

export type CanvasLeafKind =
  | 'text'
  | 'image'
  | 'rectangle'
  | 'ellipse'
  | 'ngon'
  | 'polygon'
  | 'line'
  | 'generator';

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
  gradientAngle: number;
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

export interface NgonCanvasItem extends BaseCanvasItem, GradientFillItem {
  kind: 'ngon';
  stroke: string;
  strokeWidth: number;
  sides: number;
}

export interface PolygonVertex {
  x: number;
  y: number;
}

export interface PolygonCanvasItem extends BaseCanvasItem, GradientFillItem {
  kind: 'polygon';
  stroke: string;
  strokeWidth: number;
  // Absolute canvas coordinates, in order, length >= 3 (like line's endpoints,
  // x/y/width/height hold the derived AABB). Edited via on-canvas vertex
  // handles; edge midpoints split into new vertices.
  vertices: PolygonVertex[];
  // When false the polygon is OPEN: the stroke runs along the vertex chain
  // with no closing edge and no fill, and hit-testing follows the stroke.
  closed: boolean;
  // Corner-rounding radius in canvas units; 0 = sharp corners. Each corner's
  // trim is clamped to half its shorter adjacent edge, so any value is safe.
  curveRadius: number;
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
  opacity: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export interface ZigzagsGeneratorParams {
  generatorType: 'zigzags';
  accentColor: string;
  bandColorA: string;
  count: number;
  zigzagAmplitude: number;
  thickness: number;
  opacity: number;
  seedOverride: number | null;
}

export interface FlatGridGeneratorParams {
  generatorType: 'flatGrid';
  accentColor: string;
  gridSpacingX: number;
  gridSpacingY: number;
  thickness: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export interface PerspectiveGridGeneratorParams {
  generatorType: 'perspectiveGrid';
  bandColorB: string;
  perspectiveHorizon: number;
  perspectiveDepth: number;
  perspectiveNear: number;
  perspectiveExtent: number;
  thickness: number;
  perspectiveThicknessFalloff: number;
  perspectiveRows: number;
}

export interface ScanlinesGeneratorParams {
  generatorType: 'scanlines';
  scanlineColor: string;
  scanlineHeight: number;
  scanlineSpacing: number;
}

export interface NoiseGeneratorParams {
  generatorType: 'noise';
  intensity: number;
  seedOverride: number | null;
}

export interface VignetteGeneratorParams {
  generatorType: 'vignette';
  intensity: number;
}

export type ShapeTypeKey = 'rect' | 'diamond' | 'triangle' | 'circle' | 'bar';

export interface ShapesGeneratorParams {
  generatorType: 'shapes';
  accentColor: string;
  bandColorA: string;
  bandColorB: string;
  shapeTypes: Record<ShapeTypeKey, boolean>;
  count: number;
  shapeMinSize: number;
  shapeMaxSize: number;
  rotation: number;
  opacity: number;
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
  | NgonCanvasItem
  | PolygonCanvasItem
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

export type SelectionItemChange =
  | Partial<CanvasItem>
  | ((item: CanvasItem) => Partial<CanvasItem>);

export interface ProjectDocument {
  version: 2;
  name: string;
  canvas: CanvasSize;
  background: string;
  nodes: CanvasNode[];
  fonts: DocumentFontReference[];
}

export type ReorderMode = 'forward' | 'backward' | 'front' | 'back';

export type EditorCommand =
  | { type: 'add_node'; item: CanvasItem }
  | { type: 'insert_nodes'; nodes: CanvasNode[]; parentId?: string; index?: number }
  | { type: 'delete_nodes'; nodeIds: string[] }
  | { type: 'select_nodes'; nodeIds: string[] }
  | { type: 'clear_selection' }
  | { type: 'update_node'; itemId: string; changes: Partial<CanvasItem> }
  | { type: 'update_group'; groupId: string; changes: Partial<Pick<GroupNode, 'name' | 'opacity' | 'locked' | 'hidden'>> }
  | { type: 'group_nodes'; nodeIds: string[] }
  | { type: 'ungroup_node'; groupId: string }
  | { type: 'set_canvas_size'; canvas: CanvasSize }
  | { type: 'set_canvas_name'; name: string }
  | { type: 'set_background'; background: string }
  | { type: 'reorder_node'; nodeId: string; mode: ReorderMode }
  | { type: 'reorder_nodes'; nodeIds: string[]; mode: ReorderMode }
  | { type: 'move_node'; nodeId: string; targetParentId: string | null; targetIndex: number }
  | { type: 'register_font'; font: DocumentFontReference }
  | { type: 'load_document'; document: ProjectDocument };

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
