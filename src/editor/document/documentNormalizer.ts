import { createDefaultProjectDocument, DEFAULT_ITEM_SHADOW, normalizeZIndices, sortByZIndex } from './documentDefaults';
import type { CanvasItem, CanvasShadow, ProjectDocumentV1 } from './documentTypes';

function normalizeShadow(shadow: Partial<CanvasShadow> | undefined): CanvasShadow {
  return {
    ...DEFAULT_ITEM_SHADOW,
    ...(shadow ?? {}),
  };
}

function normalizeItem(item: CanvasItem): CanvasItem {
  return {
    ...item,
    shadow: normalizeShadow(item.shadow),
  } as CanvasItem;
}

export function normalizeProjectDocument(
  input: Partial<ProjectDocumentV1> | undefined
): ProjectDocumentV1 {
  const baseDocument = createDefaultProjectDocument();
  const items = normalizeZIndices(sortByZIndex((input?.items ?? []).map(normalizeItem)));

  return {
    version: 1,
    canvas: {
      width: Math.max(1, Number(input?.canvas?.width ?? baseDocument.canvas.width)),
      height: Math.max(1, Number(input?.canvas?.height ?? baseDocument.canvas.height)),
      presetId: input?.canvas?.presetId,
    },
    background: input?.background ?? baseDocument.background,
    items,
    fonts: (input?.fonts ?? []).filter((font): font is ProjectDocumentV1['fonts'][number] => {
      return (
        typeof font?.family === 'string' &&
        typeof font?.sourceName === 'string' &&
        (font?.kind === 'system' || font?.kind === 'bundled' || font?.kind === 'uploaded')
      );
    }),
  };
}
