import { DUPLICATE_ITEM_OFFSET } from '../editor/document/documentDefaults';
import { cloneCanvasNode, collectLeafItems, isGroupNode } from '../editor/document/sceneGraph';
import type { CanvasNode } from '../editor/document/documentTypes';
import type { StoredTemplate } from '../editor/persistence/templateLibraryService';

function getSingleNodeTemplateLabel(node: CanvasNode): string {
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
      return 'Text';
    case 'image':
      return 'Image';
  }
}

export function buildDefaultTemplateName(nodes: readonly CanvasNode[]): string {
  if (nodes.length === 1) {
    return `${getSingleNodeTemplateLabel(nodes[0]!)} template`;
  }
  return `${nodes.length} items template`;
}

export function uniquifyTemplateName(
  baseName: string,
  templates: readonly Pick<StoredTemplate, 'name'>[],
): string {
  const existingNames = new Set(templates.map((template) => template.name));
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

export function instantiateTemplateNodes(
  nodes: readonly CanvasNode[],
  repeatCount: number,
): CanvasNode[] {
  return nodes.map((node) => cloneCanvasNode(node, DUPLICATE_ITEM_OFFSET * repeatCount));
}

export function summarizeTemplateNodes(nodes: readonly CanvasNode[]) {
  const leafItems = nodes.flatMap(collectLeafItems);
  const kindCounts = new Map<string, number>();

  for (const item of leafItems) {
    kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);
  }

  return {
    itemCount: leafItems.length,
    kindCounts,
  };
}
