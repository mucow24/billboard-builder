import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { ColorPickerControl } from '../ColorPickerControl';
import { isCanvasItemNode } from '../../document/sceneGraph';

import {
  getLayerPreviewStyle,
  getLayerPrimaryLabel,
  getLayerSecondaryLabel,
} from './inspectorModel';
import {
  computeLayerMoveTarget,
  computeRowConnectors,
  formatImmediateChildCount,
  getLayerRowVisualState,
  getVisibleLayerRows,
  resolveDropDepth,
} from './layersTabModel';
import { useListReorder } from './useListReorder';
import type { LayersInspectorTabProps } from './types';

const GRIP_ICON = (
  <svg viewBox="0 0 6 13" className="layer-grip-icon">
    <circle cx="1.5" cy="1.5" r="1" />
    <circle cx="4.5" cy="1.5" r="1" />
    <circle cx="1.5" cy="5" r="1" />
    <circle cx="4.5" cy="5" r="1" />
    <circle cx="1.5" cy="8.5" r="1" />
    <circle cx="4.5" cy="8.5" r="1" />
    <circle cx="1.5" cy="12" r="1" />
    <circle cx="4.5" cy="12" r="1" />
  </svg>
);

export function LayersInspectorTab({
  background,
  canReorder,
  collapsedGroupIds,
  rows,
  onBackgroundChange,
  onDeleteNode,
  onMoveNode,
  onOpenProperties,
  onRenameGroup,
  onReorder,
  onSelectNode,
  onToggleNode,
  onToggleNodeLocked,
  onToggleNodeHidden,
  onToggleGroupCollapse,
  selectedNodeIds,
}: LayersInspectorTabProps) {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const visibleRows = useMemo(
    () => getVisibleLayerRows(rows, collapsedGroupIds),
    [rows, collapsedGroupIds],
  );
  const connectorMap = useMemo(
    () => computeRowConnectors(visibleRows),
    [visibleRows],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleReorder = useCallback(
    (fromIndex: number, rawGapIndex: number, ptrX: number | null) => {
      if (ptrX === null) {
        // Keyboard reorder: use existing toolbar-style reorder
        onReorder(rawGapIndex < fromIndex ? 'forward' : 'backward');
        return;
      }
      if (!onMoveNode) return;

      const listEl = listRef.current;
      if (!listEl) return;
      const listRect = listEl.getBoundingClientRect();
      const relativeX = ptrX - listRect.left;

      const rowAbove = rawGapIndex > 0 ? visibleRows[rawGapIndex - 1] : null;
      const rowBelow = rawGapIndex < visibleRows.length ? visibleRows[rawGapIndex] : null;
      const depth = resolveDropDepth(
        rowAbove?.depth ?? 0,
        rowBelow?.depth ?? null,
        relativeX,
      );

      const target = computeLayerMoveTarget(visibleRows, fromIndex, rawGapIndex, depth);
      if (target) {
        onMoveNode(target.nodeId, target.targetParentId, target.targetChildrenIndex);
      }
    },
    [visibleRows, onMoveNode, onReorder],
  );

  const { dragIndex, dropTargetIndex, pointerX, getDragHandleProps } = useListReorder(
    listRef,
    visibleRows.length,
    handleReorder,
    { scrollContainerRef },
  );

  // Compute the resolved depth for the drop indicator during drag
  const dropIndicatorDepth = useMemo(() => {
    if (dragIndex === null || dropTargetIndex === null || pointerX === null) return 0;
    const listEl = listRef.current;
    if (!listEl) return 0;
    const listRect = listEl.getBoundingClientRect();
    const relativeX = pointerX - listRect.left;
    const rowAbove = dropTargetIndex > 0 ? visibleRows[dropTargetIndex - 1] : null;
    const rowBelow = dropTargetIndex < visibleRows.length ? visibleRows[dropTargetIndex] : null;
    return resolveDropDepth(
      rowAbove?.depth ?? 0,
      rowBelow?.depth ?? null,
      relativeX,
    );
  }, [dragIndex, dropTargetIndex, pointerX, visibleRows]);
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
                aria-label="Move to top"
                title="Move to top"
                disabled={!canReorder}
                onClick={() => onReorder('front')}
              >
                {renderReorderIcon('front')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                aria-label="Move up"
                title="Move up"
                disabled={!canReorder}
                onClick={() => onReorder('forward')}
              >
                {renderReorderIcon('forward')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                aria-label="Move down"
                title="Move down"
                disabled={!canReorder}
                onClick={() => onReorder('backward')}
              >
                {renderReorderIcon('backward')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                aria-label="Move to bottom"
                title="Move to bottom"
                disabled={!canReorder}
                onClick={() => onReorder('back')}
              >
                {renderReorderIcon('back')}
              </button>
            </div>
            <ColorPickerControl
              label="Canvas background"
              title="Canvas background color"
              value={background}
              onChange={onBackgroundChange}
              variant="compact"
            />
          </div>
        </div>
        <div className="footer-rule" />
      </div>
      <div
        className="layer-list layer-list-tabbed"
        data-testid="layers-layer-list"
        ref={scrollContainerRef}
      >
        <div className="layer-list-content">
          <div className="layer-list-rows" ref={listRef}>
            {visibleRows.map((row, visualIndex) => {
              const isGroup = row.node.kind === 'group';
              const isGenerator = isCanvasItemNode(row.node) && row.node.kind === 'generator';
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
              const imagePreviewItem =
                isCanvasItemNode(row.node) && row.node.kind === 'image' ? row.node : null;
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
              if (dragIndex === visualIndex) {
                rowClassNames.push('dragging');
              }

              function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return;
                }
                event.preventDefault();
                onSelectNode(row.selectableNodeId);
              }

              const connector = connectorMap.get(row.node.id) ?? { columnHasLine: [], isLastChild: true };

              return (
                <div
                  key={row.node.id}
                  className={rowClassNames.join(' ')}
                  data-depth={row.depth}
                  aria-label={rowLabel}
                  role="button"
                  tabIndex={0}
                  aria-pressed={rowVisualState === 'active'}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      onToggleNode(row.selectableNodeId);
                    } else {
                      onSelectNode(row.selectableNodeId);
                    }
                  }}
                  onDoubleClick={() => {
                    onSelectNode(row.selectableNodeId);
                    onOpenProperties();
                  }}
                  onKeyDown={handleRowKeyDown}
                  data-testid={`layers-row-${row.node.id}`}
                >
                  <button
                    type="button"
                    className={`layer-grip${isGenerator ? ' layer-grip-inert' : ''}`}
                    aria-label={`Reorder ${row.node.name}`}
                    aria-disabled={isGenerator || undefined}
                    {...(isGenerator ? { tabIndex: -1 } : getDragHandleProps(visualIndex))}
                  >
                    {GRIP_ICON}
                  </button>
                  {/* One column cell per ancestor depth level (k = 0..depth-2) */}
                  {connector.columnHasLine.map((hasLine, k) => (
                    <div
                      key={k}
                      className={`layer-tree-col${hasLine ? ' layer-tree-col-line' : ''}`}
                    />
                  ))}
                  {/* Junction cell for depth > 0 (L-shape = last child, T-shape = more siblings below) */}
                  {row.depth > 0 && (
                    <div
                      className={`layer-tree-junc ${connector.isLastChild ? 'layer-tree-junc-l' : 'layer-tree-junc-t'}`}
                    />
                  )}
                  {/* Downward-start line behind the toggle button for expanded groups.
                      left = depth*24+11 matches the left edge of junction ::before/::after lines. */}
                  {isGroup && !isCollapsed && row.hasChildren && (
                    <span
                      className="layer-tree-down"
                      style={{ left: `${22 + row.depth * 24 + 10}px` }}
                    />
                  )}
                  {/* Icon */}
                  {isGroup ? (
                    <button
                      type="button"
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${rowLabel}`}
                      title={isCollapsed ? 'Expand group' : 'Close group'}
                      className="layer-row-type layer-row-type-group layer-row-type-toggle"
                      data-testid={`layers-preview-anchor-${row.node.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleGroupCollapse(row.node.id);
                      }}
                    >
                      {isCollapsed ? (
                        <svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 4h6M4 1v6" /></svg>
                      ) : (
                        <svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 4h6" /></svg>
                      )}
                    </button>
                  ) : (
                    <span
                      className={`layer-row-type layer-row-type-${row.node.kind}`}
                      data-testid={`layers-preview-anchor-${row.node.id}`}
                      aria-hidden="true"
                      style={rowPreviewStyle}
                    >
                      {imagePreviewItem ? (
                        <img
                          className="layer-row-thumbnail"
                          data-testid={`layers-thumbnail-${row.node.id}`}
                          src={imagePreviewItem.src}
                          alt=""
                          draggable={false}
                        />
                      ) : row.node.kind === 'generator' ? (
                        <span className="layer-row-generator-icon">G</span>
                      ) : null}
                    </span>
                  )}
                  {/* Label */}
                  <span
                    className="layer-row-copy compact richer"
                    data-testid={`layers-row-copy-${row.node.id}`}
                  >
                    {isGroup && editingGroupId === row.node.id ? (
                      <input
                        className="layer-rename-input"
                        defaultValue={row.node.name}
                        ref={(el) => {
                          if (el) {
                            el.focus();
                            el.select();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            const value = (e.target as HTMLInputElement).value.trim();
                            if (value && value !== row.node.name) {
                              onRenameGroup?.(row.node.id, value);
                            }
                            setEditingGroupId(null);
                          } else if (e.key === 'Escape') {
                            setEditingGroupId(null);
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value && value !== row.node.name) {
                            onRenameGroup?.(row.node.id, value);
                          }
                          setEditingGroupId(null);
                        }}
                      />
                    ) : (
                      <>
                        <strong
                          className="layer-row-label"
                          data-testid={`layers-primary-label-${row.node.id}`}
                        >
                          {rowLabel}
                        </strong>
                        {secondary ? (
                          <small data-testid={`layers-secondary-label-${row.node.id}`}>
                            {secondary}
                          </small>
                        ) : null}
                      </>
                    )}
                  </span>
                  {/* Lock & Visibility */}
                  <span className="layer-row-actions">
                    {isGroup && (
                      <button
                        type="button"
                        className="layer-row-action-btn layer-row-action-btn-rename"
                        aria-label="Rename group"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingGroupId(row.node.id);
                        }}
                      >
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M8.5 1.5l2 2-7 7H1.5v-2z" />
                          <path d="M7 3l2 2" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      className={`layer-row-action-btn${row.node.locked ? ' active' : ''}`}
                      aria-label={row.node.locked ? 'Unlock layer' : 'Lock layer'}
                      title="Lock"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleNodeLocked(row.node.id);
                      }}
                    >
                      {row.node.locked ? (
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                          <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
                          <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                          <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
                          <path d="M4 5.5V4a2 2 0 0 1 4 0" fill="none" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`layer-row-action-btn${row.node.hidden ? ' active' : ''}`}
                      aria-label={row.node.hidden ? 'Show layer' : 'Hide layer'}
                      title="Toggle visibility"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleNodeHidden(row.node.id);
                      }}
                    >
                      {row.node.hidden ? (
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6z" fill="none" />
                          <circle cx="6" cy="6" r="1.5" fill="none" />
                          <path d="M2 10L10 2" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6z" fill="none" />
                          <circle cx="6" cy="6" r="1.5" fill="none" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      className="layer-row-action-btn"
                      aria-label="Delete layer"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNode(row.node.id);
                      }}
                    >
                      <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M3 3l6 6" />
                        <path d="M9 3 3 9" />
                      </svg>
                    </button>
                  </span>
                </div>
              );
            })}
            {dropTargetIndex !== null && dragIndex !== null && (
              <div
                className="layer-drop-indicator"
                data-drop-indicator
                style={{
                  position: 'absolute',
                  left: `${12 + dropIndicatorDepth * 24}px`,
                  right: 0,
                  top: 0,
                  transform: `translateY(${getDropIndicatorOffset(listRef.current, dropTargetIndex)}px)`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function getDropIndicatorOffset(list: HTMLElement | null, dropIndex: number): number {
  if (!list) return 0;
  const children = Array.from(list.children).filter(
    (el) => !el.classList.contains('layer-drop-indicator'),
  ) as HTMLElement[];
  if (dropIndex >= children.length) {
    const last = children[children.length - 1];
    return last ? last.offsetTop + last.offsetHeight : 0;
  }
  return children[dropIndex]?.offsetTop ?? 0;
}
