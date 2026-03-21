import { isGroupNode, type LayerRow } from '../../document/sceneGraph';

export interface LayerTreeOverlayMetric {
  groupOutflowX?: number;
  groupOutflowY?: number;
  junctionX: number;
  junctionY: number;
}

export interface LayerTreeOverlaySegment {
  childNodeId?: string;
  kind: 'branch' | 'trunk';
  parentNodeId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type LayerTreeOverlayMetricMap = Record<string, LayerTreeOverlayMetric>;

export function buildLayerTreeOverlaySegments(
  rows: LayerRow[],
  metricsByNodeId: LayerTreeOverlayMetricMap,
): LayerTreeOverlaySegment[] {
  const segments: LayerTreeOverlaySegment[] = [];

  for (const [index, row] of rows.entries()) {
    if (!isGroupNode(row.node)) {
      continue;
    }

    const parentMetric = metricsByNodeId[row.node.id];
    if (!parentMetric) {
      continue;
    }

    const immediateChildren = collectVisibleImmediateChildren(rows, index);
    const childMetrics = immediateChildren
      .map((childRow) => metricsByNodeId[childRow.node.id])
      .filter((metric): metric is LayerTreeOverlayMetric => metric !== undefined);

    if (childMetrics.length === 0) {
      continue;
    }

    const lastChildMetric = childMetrics[childMetrics.length - 1];
    const trunkX =
      row.depth > 0 ? parentMetric.junctionX : (parentMetric.groupOutflowX ?? parentMetric.junctionX);
    const trunkY =
      row.depth > 0 ? parentMetric.junctionY : (parentMetric.groupOutflowY ?? parentMetric.junctionY);
    segments.push({
      kind: 'trunk',
      parentNodeId: row.node.id,
      // Nested group trunks should continue through the incoming parent
      // branch junction rather than starting inside the disclosure toggle.
      x1: trunkX,
      y1: trunkY,
      x2: trunkX,
      y2: lastChildMetric.junctionY,
    });

    for (const [childIndex, childMetric] of childMetrics.entries()) {
      segments.push({
        childNodeId: immediateChildren[childIndex].node.id,
        kind: 'branch',
        parentNodeId: row.node.id,
        x1: trunkX,
        y1: childMetric.junctionY,
        x2: Math.max(trunkX, childMetric.junctionX),
        y2: childMetric.junctionY,
      });
    }
  }

  return segments;
}

function collectVisibleImmediateChildren(rows: LayerRow[], parentIndex: number): LayerRow[] {
  const parentRow = rows[parentIndex];
  const children: LayerRow[] = [];

  for (let index = parentIndex + 1; index < rows.length; index += 1) {
    const candidate = rows[index];
    if (candidate.depth <= parentRow.depth) {
      break;
    }
    if (candidate.depth === parentRow.depth + 1) {
      children.push(candidate);
    }
  }

  return children;
}
