import { useMemo } from 'react';

import {
  getSelectionRenderBounds,
} from './transformGeometry';
import { buildRenderableCanvasItems } from './renderAdapter';
import {
  collectLeafItems,
  getNodeById,
  isCanvasItemNode,
  isGroupNode,
  getNodeEntry,
} from '../document/sceneGraph';
import type {
  CanvasItem,
  CanvasNode,
  ProjectDocument,
} from '../document/documentTypes';

export interface InteractionDerivedState {
  selectedIdSet: Set<string>;
  renderables: ReturnType<typeof buildRenderableCanvasItems>;
  orderedItems: CanvasItem[];
  renderableByLeafId: Map<string, ReturnType<typeof buildRenderableCanvasItems>[number]>;
  selectedNodes: CanvasNode[];
  selectedItems: CanvasItem[];
  selectedLeafIdSet: Set<string>;
  groupBounds: { x: number; y: number; width: number; height: number } | null;
  stageBounds: { x: number; y: number; width: number; height: number };
}

export function useInteractionDerivedState(
  document: ProjectDocument,
  selectedNodeIds: string[],
): InteractionDerivedState {
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const renderables = useMemo(
    () => buildRenderableCanvasItems(document, selectedNodeIds),
    [document, selectedNodeIds],
  );

  const orderedItems = useMemo(
    () =>
      renderables.map(({ selectableNodeId, ...item }) => {
        void selectableNodeId;
        return item;
      }),
    [renderables],
  );

  const renderableByLeafId = useMemo(
    () => new Map(renderables.map((item) => [item.id, item])),
    [renderables],
  );

  const selectedNodes = useMemo(
    () =>
      selectedNodeIds
        .map((nodeId) => getNodeById(document.nodes, nodeId))
        .filter((node): node is CanvasNode => Boolean(node)),
    [document.nodes, selectedNodeIds],
  );

  const selectedItems = useMemo(
    () =>
      selectedNodes
        .flatMap(collectLeafItems)
        .slice()
        .sort((left, right) => left.zIndex - right.zIndex),
    [selectedNodes],
  );

  const selectedLeafIdSet = useMemo(
    () => new Set(selectedItems.map((item) => item.id)),
    [selectedItems],
  );

  const groupBounds = useMemo(
    () => getSelectionRenderBounds(selectedItems),
    [selectedItems],
  );

  const stageBounds = useMemo(
    () => ({ x: 0, y: 0, width: document.canvas.width, height: document.canvas.height }),
    [document.canvas.height, document.canvas.width],
  );

  return {
    selectedIdSet,
    renderables,
    orderedItems,
    renderableByLeafId,
    selectedNodes,
    selectedItems,
    selectedLeafIdSet,
    groupBounds,
    stageBounds,
  };
}

/**
 * Computes subgroup outline frames for the current selection.
 * Extracted to keep the main hook lean.
 */
export function useSubgroupOutlineFrames(
  document: ProjectDocument,
  selectedNodes: CanvasNode[],
  renderedItems: CanvasItem[],
) {
  return useMemo(() => {
    const outlineGroupIds = new Set<string>();

    if (selectedNodes.length === 1 && isCanvasItemNode(selectedNodes[0])) {
      const parentGroupId =
        getNodeEntry(document.nodes, selectedNodes[0].id)?.parent?.id ?? null;
      if (parentGroupId) {
        outlineGroupIds.add(parentGroupId);
      }
    } else if (selectedNodes.length > 1) {
      selectedNodes.filter(isGroupNode).forEach((node) => {
        outlineGroupIds.add(node.id);
      });
    }

    return Array.from(outlineGroupIds)
      .map((groupId) => {
        const outlineItems = renderedItems.filter((item) =>
          (item as CanvasItem & { groupPath: string[] }).groupPath.includes(groupId),
        );
        const bounds = getSelectionRenderBounds(outlineItems);
        return bounds ? { nodeId: groupId, bounds } : null;
      })
      .filter(
        (frame): frame is { nodeId: string; bounds: { x: number; y: number; width: number; height: number } } =>
          Boolean(frame),
      );
  }, [document.nodes, renderedItems, selectedNodes]);
}
