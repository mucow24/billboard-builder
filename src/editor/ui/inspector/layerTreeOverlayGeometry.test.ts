import { describe, expect, it } from 'vitest';

import { createGroupNode, createRectangleItem, createTextItem } from '../../document/documentDefaults';
import { flattenLayerRows } from '../../document/sceneGraph';

import {
  buildLayerTreeOverlaySegments,
  type LayerTreeOverlayMetricMap,
} from './layerTreeOverlayGeometry';

describe('layerTreeOverlayGeometry', () => {
  it('anchors root trunks to toggle outflows and child branches to row junctions', () => {
    const nestedLeaf = createRectangleItem({ id: 'nested-leaf' });
    const nestedGroup = createGroupNode([nestedLeaf], 'Details Cluster');
    nestedGroup.id = 'nested-group';
    const siblingLeaf = createTextItem({ id: 'sibling-leaf' });
    const rootGroup = createGroupNode([nestedGroup, siblingLeaf], 'Hero Group');
    rootGroup.id = 'root-group';

    const rows = flattenLayerRows([rootGroup]);
    const metrics: LayerTreeOverlayMetricMap = {
      'root-group': {
        groupOutflowX: 10,
        groupOutflowY: 21,
        junctionX: 2,
        junctionY: 14,
      },
      'sibling-leaf': { junctionX: 22, junctionY: 38 },
      'nested-group': {
        groupOutflowX: 30,
        groupOutflowY: 69,
        junctionX: 22,
        junctionY: 62,
      },
      'nested-leaf': { junctionX: 42, junctionY: 86 },
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
      { kind: 'trunk', parentNodeId: 'nested-group', x1: 22, y1: 62, x2: 22, y2: 86 },
      {
        childNodeId: 'nested-leaf',
        kind: 'branch',
        parentNodeId: 'nested-group',
        x1: 22,
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
      'root-group': {
        groupOutflowX: 10,
        groupOutflowY: 21,
        junctionX: 2,
        junctionY: 14,
      },
      'nested-group': {
        groupOutflowX: 30,
        groupOutflowY: 45,
        junctionX: 22,
        junctionY: 38,
      },
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

  it('falls back to the row junction when a top-level group toggle metric is unavailable', () => {
    const child = createTextItem({ id: 'child' });
    const group = createGroupNode([child], 'Hero Group');
    group.id = 'group';

    const rows = flattenLayerRows([group]);
    const metrics: LayerTreeOverlayMetricMap = {
      group: { junctionX: 12, junctionY: 18 },
      child: { junctionX: 26, junctionY: 42 },
    };

    expect(buildLayerTreeOverlaySegments(rows, metrics)).toEqual([
      { kind: 'trunk', parentNodeId: 'group', x1: 12, y1: 18, x2: 12, y2: 42 },
      {
        childNodeId: 'child',
        kind: 'branch',
        parentNodeId: 'group',
        x1: 12,
        y1: 42,
        x2: 26,
        y2: 42,
      },
    ]);
  });
});
