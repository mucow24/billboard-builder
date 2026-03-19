import { flattenVisibleLeafNodes } from '../document/sceneGraph';
import type { CanvasItem, ProjectDocument } from '../document/documentTypes';

export type RenderableCanvasItem = CanvasItem & {
  selectableNodeId: string;
};

export function buildRenderableCanvasItems(document: ProjectDocument): RenderableCanvasItem[] {
  return flattenVisibleLeafNodes(document.nodes).map((entry) => ({
    ...entry.item,
    opacity: entry.effectiveOpacity,
    selectableNodeId: entry.selectableNodeId,
  }));
}
