import { useEffect, useRef, useState } from 'react';

import { LayersInspectorTab } from './inspector/LayersInspectorTab';
import { SelectionInspector } from './inspector/SelectionInspector';
import { FavoritesInspectorTab } from './inspector/FavoritesInspectorTab';
import type { InspectorTab, PropertiesPanelProps } from './inspector/types';

export type { PropertiesPanelProps } from './inspector/types';
export type { InspectorTab } from './inspector/types';

export function PropertiesPanel({
  activeTab,
  availableFonts,
  fonts,
  layerRows,
  missingFontFamilies,
  onDeleteFavorite = () => {},
  onRenameFavorite = () => {},
  onRecolorFavorite = () => {},
  onReorderFavorite = () => {},
  selectedGroup,
  selectedItem,
  selectedItems = selectedItem ? [selectedItem] : [],
  selectedNodeIds,
  onGroupOpacityChange,
  onDeleteNode,
  onMoveNode,
  onOpenProperties = () => {},
  onRenameGroup = () => {},
  onItemChange,
  onInsertFavorite = () => {},
  onReorder,
  onSelectNode,
  onSelectGroupChildren,
  onToggleNode,
  onToggleNodeLocked,
  onToggleNodeHidden,
  favorites = [],
  pendingCollapsedGroupIds = [],
  onClearPendingCollapsedGroupIds,
}: PropertiesPanelProps) {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const layersScrollRef = useRef<HTMLDivElement | null>(null);
  const propertiesScrollRef = useRef<HTMLDivElement | null>(null);
  const favoritesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef({ layers: 0, properties: 0, favorites: 0 });
  const prevTabRef = useRef<InspectorTab>(activeTab);

  useEffect(() => {
    if (selectedNodeIds.length === 0) {
      return;
    }
    const selectedAncestorIds = new Set(
      layerRows
        .filter((row) => selectedNodeIds.includes(row.node.id))
        .flatMap((row) => row.ancestorGroupIds)
    );
    if (selectedAncestorIds.size === 0) {
      return;
    }
    setCollapsedGroupIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const groupId of selectedAncestorIds) {
        if (next.delete(groupId)) {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [layerRows, selectedNodeIds]);

  useEffect(() => {
    if (pendingCollapsedGroupIds.length === 0) return;
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      for (const id of pendingCollapsedGroupIds) next.add(id);
      return next;
    });
    onClearPendingCollapsedGroupIds?.();
  }, [pendingCollapsedGroupIds, onClearPendingCollapsedGroupIds]);

  // Save scroll position of the outgoing tab before it unmounts.
  // We track this via prevTabRef so we know which tab was active before the prop changed.
  if (prevTabRef.current !== activeTab) {
    const prevTarget =
      prevTabRef.current === 'layers'
        ? layersScrollRef.current
        : prevTabRef.current === 'favorites'
          ? favoritesScrollRef.current
          : propertiesScrollRef.current;
    if (prevTarget) {
      scrollPositionsRef.current[prevTabRef.current] = prevTarget.scrollTop;
    }
    prevTabRef.current = activeTab;
  }

  // Restore scroll position of the incoming tab after it mounts
  useEffect(() => {
    const target =
      activeTab === 'layers'
        ? layersScrollRef.current
        : activeTab === 'favorites'
          ? favoritesScrollRef.current
          : propertiesScrollRef.current;
    if (target) {
      target.scrollTop = scrollPositionsRef.current[activeTab];
    }
  }, [activeTab]);

  function handleToggleGroupCollapse(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <aside className="properties-panel tabbed-properties-panel">
      {missingFontFamilies.length > 0 ? (
        <section className="panel-section panel-section-banner warning">
          <h2>Missing fonts</h2>
          <p>{missingFontFamilies.join(', ')}</p>
        </section>
      ) : null}

      <section
        className="panel-section panel-section-tabbed-rail"
        data-testid="layers-panel-rail"
      >
        {activeTab === 'layers' ? (
          <div
            ref={layersScrollRef}
            className="rail-tab-body rail-tab-body-layers"
            data-testid="layers-tab-body"
          >
            <LayersInspectorTab
              canReorder={selectedNodeIds.length > 0}
              collapsedGroupIds={collapsedGroupIds}
              rows={layerRows}
              onDeleteNode={onDeleteNode}
              onMoveNode={onMoveNode}
              onOpenProperties={onOpenProperties}
              onRenameGroup={onRenameGroup}
              onReorder={onReorder}
              onSelectNode={onSelectNode}
              onToggleNode={onToggleNode}
              onToggleNodeLocked={onToggleNodeLocked}
              onToggleNodeHidden={onToggleNodeHidden}
              onToggleGroupCollapse={handleToggleGroupCollapse}
              selectedNodeIds={selectedNodeIds}
            />
          </div>
        ) : activeTab === 'favorites' ? (
          <div
            ref={favoritesScrollRef}
            className="rail-tab-body rail-tab-body-favorites"
            data-testid="favorites-tab-body"
          >
            <FavoritesInspectorTab
              favorites={favorites}
              onDeleteFavorite={onDeleteFavorite}
              onInsertFavorite={onInsertFavorite}
              onRenameFavorite={onRenameFavorite}
              onRecolorFavorite={onRecolorFavorite}
              onReorderFavorite={onReorderFavorite}
            />
          </div>
        ) : (
          <div
            ref={propertiesScrollRef}
            className="rail-tab-body rail-tab-body-properties"
            data-testid="properties-tab-body"
          >
            <SelectionInspector
              availableFonts={availableFonts}
              fonts={fonts}
              onGroupOpacityChange={onGroupOpacityChange}
              onItemChange={onItemChange}
              onSelectGroupChildren={onSelectGroupChildren}
              selectedGroup={selectedGroup}
              selectedItem={selectedItem}
              selectedNodeCount={selectedNodeIds.length}
              selectedItems={selectedItems}
            />
          </div>
        )}
      </section>
    </aside>
  );
}
