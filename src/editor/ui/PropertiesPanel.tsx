import { useEffect, useRef, useState } from 'react';

import { LayersInspectorTab } from './inspector/LayersInspectorTab';
import { SelectionInspector } from './inspector/SelectionInspector';
import type { PropertiesPanelProps } from './inspector/types';

export type { PropertiesPanelProps } from './inspector/types';

export function PropertiesPanel({
  availableFonts,
  background,
  fonts,
  items,
  layerRows,
  missingFontFamilies,
  selectedGroup,
  selectedItem,
  selectedItems = selectedItem ? [selectedItem] : [],
  selectedNodeIds,
  onBackgroundChange,
  onGroupOpacityChange,
  onDeleteItem,
  onItemChange,
  onReorder,
  onSelectNode,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'properties' | 'layers'>('properties');
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const layersScrollRef = useRef<HTMLDivElement | null>(null);
  const propertiesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef({ layers: 0, properties: 0 });
  const isMultiSelection = selectedItems.length > 1;

  useEffect(() => {
    const nextTab = selectedItem || selectedGroup || isMultiSelection ? 'properties' : activeTab;
    setActiveTab((current) => (current === 'layers' ? current : nextTab));
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
      activeTab === 'layers' ? layersScrollRef.current : propertiesScrollRef.current;
    if (target) {
      target.scrollTop = scrollPositionsRef.current[activeTab];
    }
  }, [activeTab]);

  function handleTabChange(nextTab: 'properties' | 'layers') {
    scrollPositionsRef.current.layers =
      layersScrollRef.current?.scrollTop ?? scrollPositionsRef.current.layers;
    scrollPositionsRef.current.properties =
      propertiesScrollRef.current?.scrollTop ??
      scrollPositionsRef.current.properties;
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

      <section className="panel-section panel-section-tabbed-rail">
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
        </div>

        {activeTab === 'layers' ? (
          <div ref={layersScrollRef}>
            <LayersInspectorTab
              background={background}
              canReorder={selectedNodeIds.length > 0}
              collapsedGroupIds={collapsedGroupIds}
              rows={layerRows}
              onBackgroundChange={onBackgroundChange}
              onDeleteItem={onDeleteItem}
              onOpenProperties={() => handleTabChange('properties')}
              onReorder={onReorder}
              onSelectNode={onSelectNode}
              onToggleGroupCollapse={handleToggleGroupCollapse}
              selectedNodeIds={selectedNodeIds}
            />
          </div>
        ) : (
          <div ref={propertiesScrollRef}>
            <SelectionInspector
              availableFonts={availableFonts}
              fonts={fonts}
              onGroupOpacityChange={onGroupOpacityChange}
              onItemChange={onItemChange}
              selectedGroup={selectedGroup}
              selectedItem={selectedItem}
              selectedItems={selectedItems}
            />
          </div>
        )}
      </section>
    </aside>
  );
}
