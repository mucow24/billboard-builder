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
  onBackgroundChange,
  onGroupOpacityChange,
  onDeleteItem,
  onItemChange,
  onReorder,
  onSelectNode,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'properties' | 'layers'>('properties');
  const layersScrollRef = useRef<HTMLDivElement | null>(null);
  const propertiesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef({ layers: 0, properties: 0 });
  const isMultiSelection = selectedItems.length > 1;

  useEffect(() => {
    const nextTab = selectedItem || selectedGroup || isMultiSelection ? 'properties' : activeTab;
    setActiveTab((current) => (current === 'layers' ? current : nextTab));
  }, [activeTab, isMultiSelection, selectedGroup, selectedItem]);

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
              canReorder={Boolean(selectedItem || selectedGroup)}
              rows={layerRows}
              onBackgroundChange={onBackgroundChange}
              onDeleteItem={onDeleteItem}
              onOpenProperties={() => handleTabChange('properties')}
              onReorder={onReorder}
              onSelectNode={onSelectNode}
              selectedNodeIds={selectedGroup ? [selectedGroup.id] : selectedItem ? [selectedItem.id] : []}
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
