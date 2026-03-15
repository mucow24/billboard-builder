import {
  createDefaultProjectDocument,
  normalizeZIndices,
  sortByZIndex,
} from './defaults';
import type { CanvasItem, ProjectDocument, ProjectDocumentV1 } from './types';

function normalizeItem(item: CanvasItem, index: number): CanvasItem {
  return {
    ...item,
    name: item.name || `${item.kind}-${index + 1}`,
    scaleX: item.scaleX || 1,
    scaleY: item.scaleY || 1,
    opacity: item.opacity ?? 1,
    locked: item.locked ?? false,
    hidden: item.hidden ?? false,
    zIndex: item.zIndex ?? index,
    ...(item.kind === 'text'
      ? {
          letterSpacing: item.letterSpacing ?? 0,
          verticalAlign: item.verticalAlign ?? 'top',
        }
      : {}),
    ...(item.kind === 'line'
      ? {
          startX: item.startX ?? item.x,
          startY: item.startY ?? item.y,
          endX: item.endX ?? item.x + item.width,
          endY: item.endY ?? item.y + item.height,
        }
      : {}),
  };
}

export function migrateProjectDocument(
  input: Partial<ProjectDocumentV1> | ProjectDocument
): ProjectDocumentV1 {
  if (input.version !== 1) {
    throw new Error(`Unsupported project version: ${String(input.version)}`);
  }

  const defaultDocument = createDefaultProjectDocument();
  return {
    ...defaultDocument,
    ...input,
    canvas: {
      ...defaultDocument.canvas,
      ...input.canvas,
    },
    items: normalizeZIndices(
      sortByZIndex((input.items ?? []).map((item, index) => normalizeItem(item, index)))
    ),
    selectedItemIds: (input.selectedItemIds ?? []).filter(Boolean),
    fonts: input.fonts ?? [],
  };
}
