import {
  flattenVisibleLeafNodes,
  getNodeEntry,
  isCanvasItemNode,
  isGroupNode,
} from '../document/sceneGraph';
import type { CanvasItem, ProjectDocument } from '../document/documentTypes';

export type RenderableCanvasItem = CanvasItem & {
  groupPath: string[];
  selectableNodeId: string;
};

function getEditableGroupId(document: ProjectDocument, selectedNodeIds: string[]): string | null {
  if (selectedNodeIds.length !== 1) {
    return null;
  }
  const selectedEntry = getNodeEntry(document.nodes, selectedNodeIds[0]);
  if (!selectedEntry) {
    return null;
  }
  if (isGroupNode(selectedEntry.node)) {
    return selectedEntry.node.id;
  }
  if (!isCanvasItemNode(selectedEntry.node) || !selectedEntry.parent) {
    return null;
  }
  return selectedEntry.parent.id;
}

export function buildRenderableCanvasItems(
  document: ProjectDocument,
  selectedNodeIds: string[] = []
): RenderableCanvasItem[] {
  const editableGroupId = getEditableGroupId(document, selectedNodeIds);

  return flattenVisibleLeafNodes(document.nodes).map((entry) => ({
    ...entry.item,
    groupPath: entry.groupPath,
    opacity: entry.effectiveOpacity,
    selectableNodeId:
      editableGroupId && entry.groupPath.includes(editableGroupId)
        ? (() => {
            const editableGroupIndex = entry.groupPath.indexOf(editableGroupId);
            const nextGroupId = entry.groupPath[editableGroupIndex + 1];
            return nextGroupId ?? entry.item.id;
          })()
        : entry.selectableNodeId,
  }));
}
