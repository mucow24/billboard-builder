import { z } from 'zod';

import { fileDtoToDocument, documentToFileDto } from './documentCodec';
import type { ProjectFileV1 } from './documentFileDto';
import type { CanvasItem, ProjectDocumentV1 } from './documentTypes';

const CanvasShadowSchema = z.object({
  color: z.string(),
  blur: z.number().nonnegative(),
  offsetX: z.number(),
  offsetY: z.number(),
  opacity: z.number().min(0).max(1),
});

const BaseCanvasItemSchema = z.object({
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

const TextCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontStyle: z.enum(['normal', 'italic']),
  fontWeight: z.enum(['normal', 'bold']),
  fill: z.string(),
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number().optional(),
});

const ImageCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('image'),
  src: z.string(),
  mimeType: z.string(),
  originalWidth: z.number().positive(),
  originalHeight: z.number().positive(),
  preserveAspectRatio: z.boolean(),
});

const RectangleCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('rectangle'),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
  cornerRadius: z.number().nonnegative(),
});

const EllipseCanvasItemSchema = BaseCanvasItemSchema.extend({
  kind: z.literal('ellipse'),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().nonnegative(),
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

const CanvasItemSchema = z.discriminatedUnion('kind', [
  TextCanvasItemSchema,
  ImageCanvasItemSchema,
  RectangleCanvasItemSchema,
  EllipseCanvasItemSchema,
  LineCanvasItemSchema,
]);

const ProjectFileSchema = z.object({
  version: z.literal(1),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    presetId: z.string().optional(),
  }),
  background: z.string(),
  items: z.array(CanvasItemSchema),
  fonts: z.array(
    z.object({
      family: z.string(),
      sourceName: z.string(),
      kind: z.enum(['system', 'bundled', 'uploaded']),
    })
  ),
});

export function parseProjectDocument(input: unknown): ProjectDocumentV1 {
  const parsedFile = ProjectFileSchema.parse(input) as ProjectFileV1;
  return fileDtoToDocument(parsedFile);
}

export function parseCanvasItems(input: unknown): CanvasItem[] {
  return z.array(CanvasItemSchema).parse(input) as CanvasItem[];
}

export function serializeProjectDocument(document: ProjectDocumentV1): string {
  return JSON.stringify(documentToFileDto(document), null, 2);
}
