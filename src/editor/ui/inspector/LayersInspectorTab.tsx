import { ColorPickerControl } from '../ColorPickerControl';
import { isCanvasItemNode } from '../../document/sceneGraph';

import {
  getItemGlyph,
  getLayerPreviewStyle,
  getLayerPrimaryLabel,
  getLayerSecondaryLabel,
} from './inspectorModel';
import type { LayersInspectorTabProps } from './types';

export function LayersInspectorTab({
  background,
  canReorder,
  collapsedGroupIds,
  rows,
  onBackgroundChange,
  onDeleteItem,
  onOpenProperties,
  onReorder,
  onSelectNode,
  onToggleGroupCollapse,
  selectedNodeIds,
}: LayersInspectorTabProps) {
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const visibleRows = rows.filter((row) =>
    row.ancestorGroupIds.every((groupId) => !collapsedGroupIds.has(groupId))
  );

  return (
    <div className="rail-tab-body rail-tab-body-layers">
      <div className="layer-list layer-list-tabbed">
        {visibleRows.map((row) => {
          const isGroup = row.node.kind === 'group';
          const isCollapsed = isGroup && collapsedGroupIds.has(row.node.id);
          const hasSelectedDescendant =
            row.hasChildren &&
            rows.some(
              (candidate) =>
                selectedNodeIdSet.has(candidate.node.id) &&
                candidate.ancestorGroupIds.includes(row.node.id)
            );
          const secondary = isGroup
            ? `${row.childCount} item${row.childCount === 1 ? '' : 's'}`
            : isCanvasItemNode(row.node)
              ? getLayerSecondaryLabel(row.node)
              : null;
          const isSelected = selectedNodeIdSet.has(row.selectableNodeId);
          const rowLabel = isGroup
            ? row.node.name
            : isCanvasItemNode(row.node)
              ? getLayerPrimaryLabel(row.node)
              : row.node.name;
          const rowGlyph = isCanvasItemNode(row.node) ? getItemGlyph(row.node.kind) : 'G';
          return (
            <div
              key={row.node.id}
              className={isSelected ? 'layer-row active' : hasSelectedDescendant ? 'layer-row contains-selection' : 'layer-row'}
              style={{ paddingLeft: `${row.depth * 18}px` }}
            >
              {isGroup && row.hasChildren ? (
                <button
                  type="button"
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${rowLabel}`}
                  className="layer-row-chevron-button"
                  onClick={() => onToggleGroupCollapse(row.node.id)}
                >
                  <span className="layer-row-chevron" aria-hidden="true">
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                </button>
              ) : (
                <span className="layer-row-chevron-spacer" aria-hidden="true" />
              )}
              <button
                aria-label={rowLabel}
                className="layer-row-select"
                type="button"
                onClick={() => {
                  onSelectNode(row.selectableNodeId);
                }}
                onDoubleClick={() => {
                  onSelectNode(row.selectableNodeId);
                  onOpenProperties();
                }}
              >
                <span
                  className={isGroup ? 'layer-row-type layer-row-type-group' : `layer-row-type layer-row-type-${row.node.kind}`}
                  aria-hidden="true"
                  style={isCanvasItemNode(row.node) ? getLayerPreviewStyle(row.node) : undefined}
                >
                  {rowGlyph}
                </span>
                <span className="layer-row-copy compact richer">
                  <strong>{rowLabel}</strong>
                  {secondary ? <small>{secondary}</small> : null}
                </span>
              </button>
              <button
                aria-label={`Delete ${rowLabel}`}
                className="layer-row-delete"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteItem(row.selectableNodeId);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="layers-panel-footer layers-panel-utilities">
        <div className="layer-order-toolbar" role="group" aria-label="Layer order controls">
          <button
            type="button"
            aria-label="Bring front"
            disabled={!canReorder}
            onClick={() => onReorder('front')}
          >
            ⇡
          </button>
          <button
            type="button"
            aria-label="Forward"
            disabled={!canReorder}
            onClick={() => onReorder('forward')}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Backward"
            disabled={!canReorder}
            onClick={() => onReorder('backward')}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Send back"
            disabled={!canReorder}
            onClick={() => onReorder('back')}
          >
            ⇣
          </button>
        </div>
        <div className="pinned-utility-row">
          <ColorPickerControl
            label="Canvas background"
            value={background}
            onChange={onBackgroundChange}
          />
        </div>
      </div>
    </div>
  );
}
