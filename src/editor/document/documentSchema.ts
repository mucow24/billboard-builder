import { z } from 'zod';

import { fileDtoToDocument, documentToFileDto } from './documentCodec';
import { normalizeProjectDocument } from './documentNormalizer';
import type { CanvasItem, CanvasNode, ProjectDocument } from './documentTypes';
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

const BaseCanvasItemSchemaV1 = z.object({
  id: z.string().min(1),
  kind: z.enum(['text', 'image', 'rectangle', 'ellipse', 'line']),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  zIndex: z.number().int().nonnegative(),
  locked: z.boolean(),
  hidden: z.boolean(),
  opacity: z.number().min(0).max(1),
  shadow: CanvasShadowSchema.optional(),
});

const TextCanvasItemSchemaV1 = BaseCanvasItemSchemaV1.extend({
  kind: z.literal('text'),
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontStyle: z.enum(['normal', 'italic']),
  fontWeight: z.enum(['normal', 'bold']),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number().optional(),
  padding: TextPaddingSchema.optional(),
});

const ImageCanvasItemSchemaV1 = BaseCanvasItemSchemaV1.extend({
  kind: z.literal('image'),
  src: z.string(),
  mimeType: z.string(),
  originalWidth: z.number().positive(),
  originalHeight: z.number().positive(),
  crop: ImageCropRectSchema.optional(),
  sourceTransform: ImageSourceTransformSchema.optional(),
  preserveAspectRatio: z.boolean(),
  adjustments: ImageAdjustmentsSchema.optional(),
});

const RectangleCanvasItemSchemaV1 = BaseCanvasItemSchemaV1.extend({
  kind: z.literal('rectangle'),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
  cornerRadius: z.number().nonnegative(),
});

const EllipseCanvasItemSchemaV1 = BaseCanvasItemSchemaV1.extend({
  kind: z.literal('ellipse'),
  fill: z.string(),
  secondaryFill: z.string().optional(),
  gradientEnabled: z.boolean().optional(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
});

const LineCanvasItemSchemaV1 = BaseCanvasItemSchemaV1.extend({
  kind: z.literal('line'),
  stroke: z.string(),
  strokeWidth: z.number().positive(),
  startX: z.number().optional(),
  startY: z.number().optional(),
  endX: z.number().optional(),
  endY: z.number().optional(),
});

const TextCanvasItemSchemaV2 = TextCanvasItemSchemaV1.omit({ zIndex: true });
const ImageCanvasItemSchemaV2 = ImageCanvasItemSchemaV1.omit({ zIndex: true });
const RectangleCanvasItemSchemaV2 = RectangleCanvasItemSchemaV1.omit({ zIndex: true });
const EllipseCanvasItemSchemaV2 = EllipseCanvasItemSchemaV1.omit({ zIndex: true });
const LineCanvasItemSchemaV2 = LineCanvasItemSchemaV1.omit({ zIndex: true });

const CanvasItemSchemaV1 = z.discriminatedUnion('kind', [
  TextCanvasItemSchemaV1,
  ImageCanvasItemSchemaV1,
  RectangleCanvasItemSchemaV1,
  EllipseCanvasItemSchemaV1,
  LineCanvasItemSchemaV1,
]);

const CanvasItemSchemaV2 = z.discriminatedUnion('kind', [
  TextCanvasItemSchemaV2,
  ImageCanvasItemSchemaV2,
  RectangleCanvasItemSchemaV2,
  EllipseCanvasItemSchemaV2,
  LineCanvasItemSchemaV2,
]);

const CanvasNodeSchemaV2: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      id: z.string().min(1),
      kind: z.literal('group'),
      name: z.string().min(1),
      opacity: z.number().min(0).max(1),
      children: z.array(CanvasNodeSchemaV2),
    }),
    CanvasItemSchemaV2,
  ])
);

const ProjectFileSchemaV1 = z.object({
  version: z.literal(1),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    presetId: z.string().optional(),
  }),
  background: z.string(),
  items: z.array(CanvasItemSchemaV1),
  fonts: z.array(
    z.object({
      family: z.string(),
      sourceName: z.string(),
      kind: z.enum(['system', 'bundled', 'uploaded']),
    })
  ),
});

const ProjectFileSchemaV2 = z.object({
  version: z.literal(2),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    presetId: z.string().optional(),
  }),
  background: z.string(),
  nodes: z.array(CanvasNodeSchemaV2),
  items: z.array(CanvasItemSchemaV1).optional(),
  fonts: z.array(
    z.object({
      family: z.string(),
      sourceName: z.string(),
      kind: z.enum(['system', 'bundled', 'uploaded']),
    })
  ),
});

const ProjectFileSchema = z.union([ProjectFileSchemaV1, ProjectFileSchemaV2]);

export function parseProjectDocument(input: unknown): ProjectDocument {
  const parsedFile = ProjectFileSchema.parse(input) as ProjectFile;
  return fileDtoToDocument(parsedFile);
}

export function parseCanvasItems(input: unknown): CanvasItem[] {
  return z.array(CanvasItemSchemaV1).parse(input) as CanvasItem[];
}

export function parseCanvasNodes(input: unknown): CanvasNode[] {
  const parsedNodes = z.array(CanvasNodeSchemaV2).parse(input) as CanvasNode[];
  return normalizeProjectDocument({ version: 2, nodes: parsedNodes }).nodes;
}

export function serializeProjectDocument(document: ProjectDocument): string {
  return JSON.stringify(documentToFileDto(document), null, 2);
}
