import { DUPLICATE_ITEM_OFFSET } from '../editor/document/documentDefaults';
import { cloneCanvasNode, isGroupNode } from '../editor/document/sceneGraph';
import type { CanvasNode } from '../editor/document/documentTypes';
import type { StoredFavorite } from '../editor/persistence/favoriteLibraryService';

function normalizeFavoriteTextContent(text: string): string {
  const compactText = text.trim().replace(/\s+/g, ' ');
  if (!compactText) {
    return 'Empty text';
  }
  return compactText.length > 40 ? `${compactText.slice(0, 40)}...` : compactText;
}

function getSingleNodeFavoriteLabel(node: CanvasNode): string {
  if (isGroupNode(node)) {
    return node.name || 'Group';
  }

  switch (node.kind) {
    case 'rectangle':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'text':
      return `Text:${normalizeFavoriteTextContent(node.text)}`;
    case 'image':
      return 'Image';
  }
}

export function buildDefaultFavoriteName(nodes: readonly CanvasNode[]): string {
  if (nodes.length === 1) {
    const label = getSingleNodeFavoriteLabel(nodes[0]!);
    return label.startsWith('Text:') ? label : `${label} favorite`;
  }
  return `${nodes.length} items favorite`;
}

export function uniquifyFavoriteName(
  baseName: string,
  favorites: readonly Pick<StoredFavorite, 'name'>[],
): string {
  const existingNames = new Set(favorites.map((favorite) => favorite.name));
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let nextIndex = 2;
  let nextName = `${baseName} (${nextIndex})`;
  while (existingNames.has(nextName)) {
    nextIndex += 1;
    nextName = `${baseName} (${nextIndex})`;
  }

  return nextName;
}

export function instantiateFavoriteNodes(
  nodes: readonly CanvasNode[],
  repeatCount: number,
): CanvasNode[] {
  return nodes.map((node) => cloneCanvasNode(node, DUPLICATE_ITEM_OFFSET * repeatCount));
}
