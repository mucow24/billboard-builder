import { useMemo, type CSSProperties, type KeyboardEvent } from 'react';

import { ColorPickerControl } from '../ColorPickerControl';
import { isCanvasItemNode } from '../../document/sceneGraph';

import {
  getItemGlyph,
  getLayerPreviewStyle,
  getLayerPrimaryLabel,
  getLayerSecondaryLabel,
} from './inspectorModel';
import {
  formatImmediateChildCount,
  getLayerRowVisualState,
  getLayersMetaItemCount,
  getVisibleLayerRows,
} from './layersTabModel';
import { useLayerTreeOverlay } from './useLayerTreeOverlay';
import type { LayersInspectorTabProps } from './types';

export function LayersInspectorTab({
  background,
  canReorder,
  collapsedGroupIds,
  rows,
  onBackgroundChange,
  onDeleteSelection,
  onOpenProperties,
  onReorder,
  onSelectNode,
  onToggleGroupCollapse,
  selectedNodeIds,
}: LayersInspectorTabProps) {
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const visibleRows = useMemo(
    () => getVisibleLayerRows(rows, collapsedGroupIds),
    [rows, collapsedGroupIds],
  );
  const layersMetaItemCount = useMemo(() => getLayersMetaItemCount(rows), [rows]);
  const {
    containerRef,
    overlayHeight,
    overlaySegments,
    registerToggle,
  } = useLayerTreeOverlay(visibleRows);
  const deleteSelectionLabel =
    selectedNodeIds.length > 0
      ? `Delete selected (${selectedNodeIds.length})`
      : 'Delete selected';

  function renderReorderIcon(kind: 'front' | 'forward' | 'backward' | 'back') {
    switch (kind) {
      case 'front':
        return (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2.5h8" />
            <path d="M6 8.5v-4.5" />
            <path d="M4.25 5.75 6 4l1.75 1.75" />
          </svg>
        );
      case 'forward':
        return (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 2.5v7" />
            <path d="M3.5 4.5 6 2l2.5 2.5" />
          </svg>
        );
      case 'backward':
        return (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 2.5v7" />
            <path d="M3.5 7.5 6 10l2.5-2.5" />
          </svg>
        );
      case 'back':
        return (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 9.5h8" />
            <path d="M6 3.5v4.5" />
            <path d="M4.25 6.25 6 8l1.75-1.75" />
          </svg>
        );
    }
  }

  return (
    <>
      <div className="layers-panel-footer layers-panel-utilities">
        <div className="footer-rule" />
        <div className="order-row">
          <div className="order-controls">
            <div className="layer-order-toolbar" role="group" aria-label="Layer order controls">
              <button
                type="button"
                className="toolbar-button"
                aria-label="Bring front"
                disabled={!canReorder}
                onClick={() => onReorder('front')}
              >
                {renderReorderIcon('front')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                aria-label="Forward"
                disabled={!canReorder}
                onClick={() => onReorder('forward')}
              >
                {renderReorderIcon('forward')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                aria-label="Backward"
                disabled={!canReorder}
                onClick={() => onReorder('backward')}
              >
                {renderReorderIcon('backward')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                aria-label="Send back"
                disabled={!canReorder}
                onClick={() => onReorder('back')}
              >
                {renderReorderIcon('back')}
              </button>
            </div>
            <ColorPickerControl
              label="Canvas background"
              value={background}
              onChange={onBackgroundChange}
              variant="compact"
            />
          </div>
          <button
            type="button"
            aria-label={deleteSelectionLabel}
            className="delete-button layers-panel-delete-selection"
            disabled={selectedNodeIds.length === 0}
            onClick={onDeleteSelection}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6" />
              <path d="M9 3 3 9" />
            </svg>
          </button>
        </div>
        <div className="footer-rule" />
      </div>
      <div
        ref={containerRef}
        className="layer-list layer-list-tabbed"
        data-testid="layers-layer-list"
      >
        <div className="layer-list-content">
          {overlaySegments.length > 0 ? (
            <svg
              aria-hidden="true"
              className="layer-tree-overlay"
              style={{ height: `${overlayHeight}px` }}
              width="100%"
            >
              {overlaySegments.map((segment, index) => (
                <line
                  key={`${segment.x1}:${segment.y1}:${segment.x2}:${segment.y2}:${index}`}
                  x1={segment.x1}
                  x2={segment.x2}
                  y1={segment.y1}
                  y2={segment.y2}
                />
              ))}
            </svg>
          ) : null}
          <div className="layer-list-rows">
            {visibleRows.map((row) => {
              const isGroup = row.node.kind === 'group';
              const isCollapsed = isGroup && collapsedGroupIds.has(row.node.id);
              const rowVisualState = getLayerRowVisualState(row, rows, selectedNodeIdSet);
              const secondary = isGroup
                ? formatImmediateChildCount(row.immediateChildCount)
                : isCanvasItemNode(row.node)
                  ? getLayerSecondaryLabel(row.node)
                  : null;
              const rowLabel = isGroup
                ? row.node.name
                : isCanvasItemNode(row.node)
                  ? getLayerPrimaryLabel(row.node)
                  : row.node.name;
              const rowGlyph =
                isCanvasItemNode(row.node) && row.node.kind === 'image'
                  ? getItemGlyph(row.node.kind)
                  : null;
              const rowPreviewStyle = isCanvasItemNode(row.node)
                ? getLayerPreviewStyle(row.node)
                : undefined;
              const rowClassNames = ['layer-row'];
              if (rowVisualState === 'active') {
                rowClassNames.push('active');
              } else if (rowVisualState === 'contains-selection') {
                rowClassNames.push('contains-selection');
              } else if (rowVisualState === 'in-selected-group') {
                rowClassNames.push('in-selected-group');
              }
              if (isGroup) {
                rowClassNames.push('layer-row-group');
                if (!isCollapsed && row.hasChildren) {
                  rowClassNames.push('layer-row-group-expanded');
                }
              }

              function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return;
                }
                event.preventDefault();
                onSelectNode(row.selectableNodeId);
              }

              return (
                <div
                  key={row.node.id}
                  className={rowClassNames.join(' ')}
                  style={{ '--depth': row.depth } as CSSProperties}
                >
                  <div
                    aria-label={rowLabel}
                    className="layer-row-select"
                    role="button"
                    tabIndex={0}
                    aria-pressed={rowVisualState === 'active'}
                    onClick={() => {
                      onSelectNode(row.selectableNodeId);
                    }}
                    onDoubleClick={() => {
                      onSelectNode(row.selectableNodeId);
                      onOpenProperties();
                    }}
                    onKeyDown={handleRowKeyDown}
                  >
                    {isGroup ? (
                      <button
                        ref={registerToggle(row.node.id)}
                        type="button"
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${rowLabel}`}
                        className="layer-row-type layer-row-type-group layer-row-type-toggle"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleGroupCollapse(row.node.id);
                        }}
                      >
                        {isCollapsed ? '+' : '-'}
                      </button>
                    ) : (
                      <span
                        ref={registerToggle(row.node.id)}
                        className={`layer-row-type layer-row-type-${row.node.kind}`}
                        aria-hidden="true"
                        style={rowPreviewStyle}
                      >
                        {rowGlyph}
                      </span>
                    )}
                    <span className="layer-row-copy compact richer">
                      <strong className="layer-row-label">{rowLabel}</strong>
                      {secondary ? <small>{secondary}</small> : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="layers-panel-meta" aria-hidden="true">
        <div className="layers-panel-meta-rule" />
        <div className="layers-panel-meta-copy">{layersMetaItemCount}</div>
      </div>
    </>
  );
}
