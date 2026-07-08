import { z } from 'zod';

import { fileDtoToDocument, documentToFileDto } from './documentCodec';
import { normalizeProjectDocument } from './documentNormalizer';
import type { CanvasNode, ProjectDocument } from './documentTypes';
import type { ProjectFile } from './documentFileDto';

const CanvasShadowSchema = z.object({
  color: z.string(),
  blur: z.number().nonnegative(),
  offsetX: z.number(),
  offsetY: z.number(),
  opacity: z.number().min(0).max(1),
});

const ImageAdjustmentsSchema = z.object({
  brightness: z.number().min(0).max(200),
  contrast: z.number().min(0).max(100),
  tintColor: z.string(),
  tintStrength: z.number().min(0).max(100),
});

const ImageCropRectSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const ImageSourceTransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
});

const TextPaddingSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

const BandsGeneratorParamsSchema = z.object({
  generatorType: z.literal('bands'),
  bandColorA: z.string(),
  bandColorB: z.string(),
  shadowColor: z.string(),
  stripeCount: z.number().int().min(1),
  stripeAngle: z.number(),
  stripeThickness: z.number().min(1),
  stripeSpacingJitter: z.number().min(0),
  stripeOffset: z.number(),
  stripeSkew: z.number().min(0),
  stripeContrast: z.number().min(0).max(1),
  stripeGlow: z.number().min(0).max(1),
  seedOverride: z.number().nullable(),
});

const BurstGeneratorParamsSchema = z.object({
  generatorType: z.literal('burst'),
  accentColor: z.string(),
  bandColorB: z.string(),
  burstRays: z.number().int().min(1),
  burstScale: z.number().min(0),
  opacity: z.number().min(0).max(1),
  offsetX: z.number(),
  offsetY: z.number(),
  rotation: z.number(),
});

const ZigzagsGeneratorParamsSchema = z.object({
  generatorType: z.literal('zigzags'),
  accentColor: z.string(),
  bandColorA: z.string(),
  count: z.number().int().min(0),
  zigzagAmplitude: z.number().min(0),
  thickness: z.number().min(0),
  opacity: z.number().min(0).max(1),
  seedOverride: z.number().nullable(),
});

const FlatGridGeneratorParamsSchema = z.object({
  generatorType: z.literal('flatGrid'),
  accentColor: z.string(),
  gridSpacingX: z.number().min(1),
  gridSpacingY: z.number().min(1),
  thickness: z.number().min(0),
  offsetX: z.number(),
  offsetY: z.number(),
  rotation: z.number(),
});

const PerspectiveGridGeneratorParamsSchema = z.object({
  generatorType: z.literal('perspectiveGrid'),
  bandColorB: z.string(),
  perspectiveHorizon: z.number(),
  perspectiveDepth: z.number().int().min(1),
  perspectiveNear: z.number(),
  perspectiveExtent: z.number(),
  thickness: z.number().min(0),
  perspectiveThicknessFalloff: z.number().min(0),
  perspectiveRows: z.number().int().min(0),
});

const ScanlinesGeneratorParamsSchema = z.object({
  generatorType: z.literal('scanlines'),
  scanlineColor: z.string(),
  scanlineHeight: z.number().int().min(1),
  scanlineSpacing: z.number().int().min(0),
});

const NoiseGeneratorParamsSchema = z.object({
  generatorType: z.literal('noise'),
  intensity: z.number().min(0).max(1),
  seedOverride: z.number().nullable(),
});

const VignetteGeneratorParamsSchema = z.object({
  generatorType: z.literal('vignette'),
  intensity: z.number().min(0).max(1),
});

const ShapeTypesSchema = z.object({
  rect: z.boolean(),
  diamond: z.boolean(),
  triangle: z.boolean(),
  circle: z.boolean(),
  bar: z.boolean(),
});

const ShapesGeneratorParamsSchema = z.object({
  generatorType: z.literal('shapes'),
  accentColor: z.string(),
  bandColorA: z.string(),
  bandColorB: z.string(),
  shapeTypes: ShapeTypesSchema,
  count: z.number().int().min(0),
  shapeMinSize: z.number().min(0),
  shapeMaxSize: z.number().min(0),
  rotation: z.number().min(0),
  opacity: z.number().min(0).max(1),
  shapeOutline: z.number().min(0),
  shapeMix: z.number().min(0).max(1),
  seedOverride: z.number().nullable(),
});

const GeneratorParamsSchema = z.discriminatedUnion('generatorType', [
  BandsGeneratorParamsSchema,
  BurstGeneratorParamsSchema,
  ZigzagsGeneratorParamsSchema,
  FlatGridGeneratorParamsSchema,
  PerspectiveGridGeneratorParamsSchema,
  ScanlinesGeneratorParamsSchema,
  NoiseGeneratorParamsSchema,
  VignetteGeneratorParamsSchema,
  ShapesGeneratorParamsSchema,
]);

const BaseCanvasItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['text', 'image', 'rectangle', 'ellipse', 'ngon', 'polygon', 'line', 'generator']),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  locked: z.boolean(),
  lockAspectRatio: z.boolean().optional(),
  hidden: z.boolean(),
  opacity: z.number().min(0).max(1),
  shadow: CanvasShadowSchema.optional(),
  blurRadius: z.number().nonnegative().optional(),
});

const TextCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontStyle: z.enum(['normal', 'italic']),
  fontWeight: z.enum(['normal', 'bold']),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  gradientAngle: z.number().optional(),
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number().optional(),
  padding: TextPaddingSchema.optional(),
});

const ImageCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('image'),
  src: z.string(),
  mimeType: z.string(),
  originalWidth: z.number().positive(),
  originalHeight: z.number().positive(),
  crop: ImageCropRectSchema.optional(),
  sourceTransform: ImageSourceTransformSchema.optional(),
  mirrorHorizontal: z.boolean().optional(),
  preserveAspectRatio: z.boolean(),
  adjustments: ImageAdjustmentsSchema.optional(),
});

const RectangleCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('rectangle'),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  gradientAngle: z.number().optional(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
  cornerRadius: z.number().nonnegative(),
});

const EllipseCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('ellipse'),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  gradientAngle: z.number().optional(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
});

const NgonCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('ngon'),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  gradientAngle: z.number().optional(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
  sides: z.number().int().min(3),
});

const PolygonVertexSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const PolygonCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('polygon'),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  gradientAngle: z.number().optional(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
  vertices: z.array(PolygonVertexSchema).min(3),
  closed: z.boolean().optional(),
  curveRadius: z.number().nonnegative().optional(),
});

const LineCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('line'),
  stroke: z.string(),
  strokeWidth: z.number().positive(),
  startX: z.number().optional(),
  startY: z.number().optional(),
  endX: z.number().optional(),
  endY: z.number().optional(),
});

const GeneratorCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('generator'),
  seed: z.number(),
  generatorParams: GeneratorParamsSchema,
});

const CanvasItemSchema = z.discriminatedUnion('kind', [
  TextCanvasItemSchema,
  ImageCanvasItemSchema,
  RectangleCanvasItemSchema,
  EllipseCanvasItemSchema,
  NgonCanvasItemSchema,
  PolygonCanvasItemSchema,
  LineCanvasItemSchema,
  GeneratorCanvasItemSchema,
]);

const CanvasNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      id: z.string().min(1),
      kind: z.literal('group'),
      name: z.string().min(1),
      opacity: z.number().min(0).max(1),
      children: z.array(CanvasNodeSchema),
    }),
    CanvasItemSchema,
  ])
);

const ProjectFileSchema = z.object({
  version: z.literal(2),
  name: z.string().optional(),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    presetId: z.string().optional(),
  }),
  background: z.string(),
  nodes: z.array(CanvasNodeSchema),
  fonts: z.array(
    z.object({
      family: z.string(),
      sourceName: z.string(),
      kind: z.enum(['system', 'bundled', 'uploaded']),
    })
  ),
});

export function parseProjectDocument(input: unknown): ProjectDocument {
  const parsedFile = ProjectFileSchema.parse(input) as ProjectFile;
  return fileDtoToDocument(parsedFile);
}

export function parseCanvasNodes(input: unknown): CanvasNode[] {
  const parsedNodes = z.array(CanvasNodeSchema).parse(input) as CanvasNode[];
  return normalizeProjectDocument({ version: 2, nodes: parsedNodes }).nodes;
}

export function serializeProjectDocument(document: ProjectDocument): string {
  return JSON.stringify(documentToFileDto(document), null, 2);
}
