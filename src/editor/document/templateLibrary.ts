import type {
  CanvasNode,
  DocumentFontReference,
  ProjectDocument,
} from './documentTypes';
import { collectLeafItems, isGroupNode } from './sceneGraph';

export interface TemplateSelectionPayload {
  fonts: DocumentFontReference[];
  nodes: CanvasNode[];
}

export function getTemplateSelectionRoots(
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

export function collectTemplateFontReferences(
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

export function buildTemplateSelectionPayload(
  document: Pick<ProjectDocument, 'fonts' | 'nodes'>,
  selectedNodeIds: readonly string[],
): TemplateSelectionPayload {
  const nodes = getTemplateSelectionRoots(document.nodes, selectedNodeIds);

  return {
    fonts: collectTemplateFontReferences(nodes, document.fonts),
    nodes,
  };
}
