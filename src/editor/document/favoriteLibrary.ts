import type {
  CanvasNode,
  DocumentFontReference,
  ProjectDocument,
} from './documentTypes';
import { collectLeafItems, isGroupNode } from './sceneGraph';

export interface FavoriteSelectionPayload {
  fonts: DocumentFontReference[];
  nodes: CanvasNode[];
}

export interface FavoriteNodeSummary {
  itemCount: number;
  kindCounts: Map<string, number>;
  previewColors: string[];
}

const MAX_FAVORITE_PREVIEW_COLORS = 4;

export function getFavoriteSelectionRoots(
  nodes: CanvasNode[],
  selectedNodeIds: readonly string[],
): CanvasNode[] {
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const selectionRoots: CanvasNode[] = [];

  function visit(currentNodes: CanvasNode[]) {
    for (const node of currentNodes) {
      if (selectedNodeIdSet.has(node.id)) {
        selectionRoots.push(node);
        continue;
      }
      if (isGroupNode(node)) {
        visit(node.children);
      }
    }
  }

  visit(nodes);
  return selectionRoots;
}

export function collectFavoriteFontReferences(
  nodes: CanvasNode[],
  fonts: readonly DocumentFontReference[],
): DocumentFontReference[] {
  const referencedFamilies = new Set(
    nodes.flatMap((node) =>
      collectLeafItems(node)
        .filter((item) => item.kind === 'text')
        .map((item) => item.fontFamily),
    ),
  );

  return fonts.filter((font) => referencedFamilies.has(font.family));
}

export function buildFavoriteSelectionPayload(
  document: Pick<ProjectDocument, 'fonts' | 'nodes'>,
  selectedNodeIds: readonly string[],
): FavoriteSelectionPayload {
  const nodes = getFavoriteSelectionRoots(document.nodes, selectedNodeIds);

  return {
    fonts: collectFavoriteFontReferences(nodes, document.fonts),
    nodes,
  };
}

export function summarizeFavoriteNodes(nodes: readonly CanvasNode[]): FavoriteNodeSummary {
  const leafItems = nodes.flatMap(collectLeafItems);
  const kindCounts = new Map<string, number>();
  const previewColors: string[] = [];
  const seenColors = new Set<string>();

  function pushPreviewColor(color: string | undefined) {
    if (!color || previewColors.length >= MAX_FAVORITE_PREVIEW_COLORS) {
      return;
    }
    const normalizedColor = color.trim().toLowerCase();
    if (!normalizedColor || seenColors.has(normalizedColor)) {
      return;
    }
    seenColors.add(normalizedColor);
    previewColors.push(color);
  }

  for (const item of leafItems) {
    kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);

    switch (item.kind) {
      case 'rectangle':
      case 'ellipse':
      case 'polygon':
        pushPreviewColor(item.fill);
        if (item.strokeWidth > 0) {
          pushPreviewColor(item.stroke);
        }
        break;
      case 'text':
        pushPreviewColor(item.fill);
        break;
      case 'line':
        pushPreviewColor(item.stroke);
        break;
      case 'image':
        if (item.adjustments.tintStrength > 0) {
          pushPreviewColor(item.adjustments.tintColor);
        }
        break;
    }
  }

  return {
    itemCount: leafItems.length,
    kindCounts,
    previewColors,
  };
}
