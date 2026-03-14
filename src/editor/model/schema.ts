import { z } from 'zod';

import { migrateProjectDocument } from './migrations';
import type { ProjectDocumentV1 } from './types';

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

const ProjectDocumentSchema = z.object({
  version: z.literal(1),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    presetId: z.string().optional(),
  }),
  background: z.string(),
  items: z.array(CanvasItemSchema),
  selectedItemIds: z.array(z.string()),
  fonts: z.array(
    z.object({
      family: z.string(),
      sourceName: z.string(),
      kind: z.enum(['system', 'uploaded']),
    })
  ),
});

export function parseProjectDocument(input: unknown): ProjectDocumentV1 {
  const parsedDocument = ProjectDocumentSchema.parse(input) as Partial<ProjectDocumentV1>;
  return migrateProjectDocument(parsedDocument);
}

export function serializeProjectDocument(document: ProjectDocumentV1): string {
  return JSON.stringify(document, null, 2);
}
