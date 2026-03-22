import { useEffect, useRef, useState } from 'react';

import { LayersInspectorTab } from './inspector/LayersInspectorTab';
import { SelectionInspector } from './inspector/SelectionInspector';
import { FavoritesInspectorTab } from './inspector/FavoritesInspectorTab';
import type { PropertiesPanelProps } from './inspector/types';

export type { PropertiesPanelProps } from './inspector/types';

export function PropertiesPanel({
  availableFonts,
  background,
  fonts,
  items,
  layerRows,
  missingFontFamilies,
  onDeleteFavorite = () => {},
  selectedGroup,
  selectedItem,
  selectedItems = selectedItem ? [selectedItem] : [],
  selectedNodeIds,
  onBackgroundChange,
  onGroupOpacityChange,
  onDeleteSelection,
  onItemChange,
  onInsertFavorite = () => {},
  onReorder,
  onSelectNode,
  favorites = [],
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'properties' | 'layers' | 'favorites'>('properties');
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const layersScrollRef = useRef<HTMLDivElement | null>(null);
  const propertiesScrollRef = useRef<HTMLDivElement | null>(null);
  const favoritesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef({ layers: 0, properties: 0, favorites: 0 });
  const isMultiSelection = selectedItems.length > 1;

  useEffect(() => {
    const nextTab = selectedItem || selectedGroup || isMultiSelection ? 'properties' : activeTab;
    setActiveTab((current) => (current === 'layers' || current === 'favorites' ? current : nextTab));
  }, [activeTab, isMultiSelection, selectedGroup, selectedItem]);

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

  function handleTabChange(nextTab: 'properties' | 'layers' | 'favorites') {
    scrollPositionsRef.current.layers =
      layersScrollRef.current?.scrollTop ?? scrollPositionsRef.current.layers;
    scrollPositionsRef.current.properties =
      propertiesScrollRef.current?.scrollTop ??
      scrollPositionsRef.current.properties;
    scrollPositionsRef.current.favorites =
      favoritesScrollRef.current?.scrollTop ??
      scrollPositionsRef.current.favorites;
    setActiveTab(nextTab);
  }

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
        <div className="rail-tab-strip" role="tablist" aria-label="Inspector panels">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'properties'}
            className={activeTab === 'properties' ? 'rail-tab active' : 'rail-tab'}
            onClick={() => handleTabChange('properties')}
          >
            Properties
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'layers'}
            className={activeTab === 'layers' ? 'rail-tab active' : 'rail-tab'}
            onClick={() => handleTabChange('layers')}
          >
            Layers
            <span className="panel-badge">{items.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'favorites'}
            className={activeTab === 'favorites' ? 'rail-tab active' : 'rail-tab'}
            onClick={() => handleTabChange('favorites')}
          >
            Favorites
            <span className="panel-badge">{favorites.length}</span>
          </button>
        </div>

        {activeTab === 'layers' ? (
          <div
            ref={layersScrollRef}
            className="rail-tab-body rail-tab-body-layers"
            data-testid="layers-tab-body"
          >
            <LayersInspectorTab
              background={background}
              canReorder={selectedNodeIds.length > 0}
              collapsedGroupIds={collapsedGroupIds}
              rows={layerRows}
              onBackgroundChange={onBackgroundChange}
              onDeleteSelection={onDeleteSelection}
              onOpenProperties={() => handleTabChange('properties')}
              onReorder={onReorder}
              onSelectNode={onSelectNode}
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
