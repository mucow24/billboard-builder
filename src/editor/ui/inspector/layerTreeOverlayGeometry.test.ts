import { describe, expect, it } from 'vitest';

import { createGroupNode, createRectangleItem, createTextItem } from '../../document/documentDefaults';
import { flattenLayerRows } from '../../document/sceneGraph';

import {
  buildLayerTreeOverlaySegments,
  type LayerTreeOverlayMetricMap,
} from './layerTreeOverlayGeometry';

describe('layerTreeOverlayGeometry', () => {
  it('builds connector segments for visible immediate children of expanded groups', () => {
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Details Cluster');
    nestedGroup.id = 'nested-group';
    const siblingLeaf = createTextItem({ id: 'sibling-leaf' });
    const rootGroup = createGroupNode([nestedGroup, siblingLeaf], 'Hero Group');
    rootGroup.id = 'root-group';

    const rows = flattenLayerRows([rootGroup]);
    const metrics: LayerTreeOverlayMetricMap = {
      'root-group': { anchorX: 10, bottomY: 21, centerY: 14, entryX: 2, nodeId: 'root-group' },
      'sibling-leaf': { anchorX: 30, bottomY: 45, centerY: 38, entryX: 22, nodeId: 'sibling-leaf' },
      'nested-group': { anchorX: 30, bottomY: 69, centerY: 62, entryX: 22, nodeId: 'nested-group' },
      'nested-leaf': { anchorX: 50, bottomY: 93, centerY: 86, entryX: 42, nodeId: 'nested-leaf' },
    };

    expect(buildLayerTreeOverlaySegments(rows, metrics)).toEqual([
      { kind: 'trunk', parentNodeId: 'root-group', x1: 10, y1: 21, x2: 10, y2: 62 },
      {
        childNodeId: 'sibling-leaf',
        kind: 'branch',
        parentNodeId: 'root-group',
        x1: 10,
        y1: 38,
        x2: 22,
        y2: 38,
      },
      {
        childNodeId: 'nested-group',
        kind: 'branch',
        parentNodeId: 'root-group',
        x1: 10,
        y1: 62,
        x2: 22,
        y2: 62,
      },
      { kind: 'trunk', parentNodeId: 'nested-group', x1: 30, y1: 62, x2: 30, y2: 86 },
      {
        childNodeId: 'nested-leaf',
        kind: 'branch',
        parentNodeId: 'nested-group',
        x1: 30,
        y1: 86,
        x2: 42,
        y2: 86,
      },
    ]);
  });

  it('skips collapsed descendants because they are not in the visible rows list', () => {
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Details Cluster');
    nestedGroup.id = 'nested-group';
    const rootGroup = createGroupNode([nestedGroup], 'Hero Group');
    rootGroup.id = 'root-group';

    const rows = flattenLayerRows([rootGroup]).filter((row) => row.node.id !== nestedLeaf.id);
    const metrics: LayerTreeOverlayMetricMap = {
      'root-group': { anchorX: 10, bottomY: 21, centerY: 14, entryX: 2, nodeId: 'root-group' },
      'nested-group': { anchorX: 30, bottomY: 45, centerY: 38, entryX: 22, nodeId: 'nested-group' },
    };

    expect(buildLayerTreeOverlaySegments(rows, metrics)).toEqual([
      { kind: 'trunk', parentNodeId: 'root-group', x1: 10, y1: 21, x2: 10, y2: 38 },
      {
        childNodeId: 'nested-group',
        kind: 'branch',
        parentNodeId: 'root-group',
        x1: 10,
        y1: 38,
        x2: 22,
        y2: 38,
      },
    ]);
  });
});
