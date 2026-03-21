import { isGroupNode, type LayerRow } from '../../document/sceneGraph';

export interface LayerTreeOverlayMetric {
  anchorX: number;
  bottomY: number;
  centerY: number;
  entryX: number;
  nodeId: string;
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
    segments.push({
      kind: 'trunk',
      parentNodeId: row.node.id,
      x1: parentMetric.anchorX,
      y1: parentMetric.bottomY,
      x2: parentMetric.anchorX,
      y2: lastChildMetric.centerY,
    });

    for (const childMetric of childMetrics) {
      segments.push({
        childNodeId: childMetric.nodeId,
        kind: 'branch',
        parentNodeId: row.node.id,
        x1: parentMetric.anchorX,
        y1: childMetric.centerY,
        x2: Math.max(parentMetric.anchorX, childMetric.entryX),
        y2: childMetric.centerY,
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
