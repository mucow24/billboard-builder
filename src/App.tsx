import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type Konva from 'konva';

import { readEditorRuntimeFlags } from './app/editorRuntimeFlags';
import { useEditorController } from './app/useEditorController';
import { useSpacebarHeld } from './app/useSpacebarHeld';
import { useStatusToast } from './app/useStatusToast';
import { CanvasStage } from './editor/rendering/CanvasStage';
import { ToolPalette } from './editor/ui/ToolPalette';
import { Toolbar } from './editor/ui/Toolbar';
import { PropertiesPanel } from './editor/ui/PropertiesPanel';
import type { InspectorTab } from './editor/ui/PropertiesPanel';
import { createGeneratorItem } from './editor/document/documentDefaults';
import type { GuideLine } from './editor/document/documentTypes';
import { canGroupNodes, canUngroupNode, getNodeById, isGroupNode } from './editor/document/sceneGraph';

export default function App() {
  const runtimeFlags = readEditorRuntimeFlags();
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [exportButtonHovered, setExportButtonHovered] = useState(false);
  const spacebarHeld = useSpacebarHeld();
  const showExportBoundsCue = exportButtonHovered || spacebarHeld;
  const favoriteStatus = useStatusToast();
  const [topbarHeight, setTopbarHeight] = useState(56);
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const overlaysRef = useRef<HTMLDivElement | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties');
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const {
    actions: {
      deleteFavorite,
      deleteNode,
      deleteSelectedNodes,
      renameFavorite,
      recolorFavorite,
      reorderFavorite,
      dispatch,
      groupSelectedNodes,
      handleExport,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject,
      clearPendingCollapsedGroupIds,
      handleSave,
      redo,
      reorderSelectedNode,
      saveSelectionAsFavorite,
      selectSingleNode,
      setActiveTool,
      setCanvasSize,
      insertFavorite,
      toggleSelectedNode,
      undo,
      ungroupSelectedNode,
      updateSelectedGroup,
      updateSelectionItems,
    },
    state: {
      activeTool,
      availableFonts,
      canRedo,
      canUndo,
      document,
      errorMessage,
      layerRows,
      missingFontFamilies,
      pendingCollapsedGroupIds,
      selectedGroup,
      selectedItem,
      selectedItems,
      selectedNode,
      selectedNodeIds,
      favorites,
    },
  } = useEditorController();

  useLayoutEffect(() => {
    const element = topbarRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      // Use borderBoxSize (layout size, unaffected by CSS transforms) with offsetHeight fallback
      const height = entry.borderBoxSize?.[0]?.blockSize ?? element.offsetHeight;
      setTopbarHeight(height);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Measure the connected tab's position relative to the panel so CSS can draw the gapped top border
  useLayoutEffect(() => {
    const overlays = overlaysRef.current;

    function clearNudge() {
      if (!overlays) return;
      overlays.style.removeProperty('--connected-tab-right-offset');
      overlays.style.removeProperty('--connected-tab-width');
      const pc = overlays.querySelector('.overlay-properties') as HTMLElement | null;
      if (pc) pc.style.transform = '';
    }

    function measure() {
      if (!overlays || panelCollapsed) {
        clearNudge();
        return;
      }
      const tab = overlays.querySelector('.top-toolbar-inspector-tab.connected');
      const panelContainer = overlays.querySelector('.overlay-properties') as HTMLElement | null;
      const tabsContainer = overlays.querySelector('.top-toolbar-inspector-tabs');
      if (!tab || !panelContainer || !tabsContainer) return;
      // Reset any previous nudge before measuring so we get clean values
      panelContainer.style.transform = '';
      const tabRect = tab.getBoundingClientRect();
      const panelRect = panelContainer.getBoundingClientRect();
      const tabsRight = tabsContainer.getBoundingClientRect().right;
      // Nudge the panel so its right edge aligns with the tabs container's right edge
      // (compensates for sub-pixel toolbar border rendering at varying DPRs)
      const rightDrift = panelRect.right - tabsRight;
      if (Math.abs(rightDrift) > 0.01) {
        panelContainer.style.transform = `translateX(${-rightDrift}px)`;
      }
      // Gap position: after the nudge, panel right == tabs right.
      // Inset the gap by 1px on each side so the panel top border meets the tab's side borders cleanly.
      const rightOffset = tabsRight - tabRect.right + 1;
      const width = tabRect.width - 2;
      overlays.style.setProperty('--connected-tab-right-offset', `${rightOffset}px`);
      overlays.style.setProperty('--connected-tab-width', `${width}px`);
    }

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [inspectorTab, panelCollapsed]);

  const handleExportIntentChange = useCallback((active: boolean) => {
    setExportButtonHovered(active);
  }, []);

  function handleInspectorTabChange(tab: InspectorTab) {
    if (tab === inspectorTab) {
      setPanelCollapsed((c) => !c);
    } else {
      setInspectorTab(tab);
      setPanelCollapsed(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="editor-layout editor-layout-overlay">
        <CanvasStage
          debugMode={runtimeFlags.debugMode}
          showCanvasTestHooks={runtimeFlags.enableCanvasTestHooks}
          showExportBoundsCue={showExportBoundsCue}
          guides={guides}
          onGuidesChange={setGuides}
          stageRef={stageRef}
        />

        <div
          ref={overlaysRef}
          className="editor-overlays"
          style={{ ['--overlay-topbar-height' as string]: `${topbarHeight}px` }}
        >
          <div ref={topbarRef} className="overlay-topbar">
            <Toolbar
              canvas={document.canvas}
              canDelete={selectedNodeIds.length > 0}
              canGroup={canGroupNodes(document.nodes, selectedNodeIds)}
              canUngroup={Boolean(selectedNode && selectedNode.kind === 'group' && canUngroupNode(document.nodes, selectedNode.id))}
              canUndo={canUndo}
              canRedo={canRedo}
              canSaveFavorite={selectedNodeIds.length > 0}
              favoriteStatusFading={favoriteStatus.fading}
              favoriteStatusMessage={favoriteStatus.message}
              onCanvasSizeChange={setCanvasSize}
              onDelete={deleteSelectedNodes}
              onExport={() => handleExport(stageRef.current)}
              onExportIntentChange={handleExportIntentChange}
              onFontUpload={() => fontInputRef.current?.click()}
              onGroup={groupSelectedNodes}
              onImageUpload={() => imageInputRef.current?.click()}
              onLoad={() => openInputRef.current?.click()}
              onNewProject={() => {
                handleNewProject(() => {
                  setGuides([]);
                });
              }}
              onRedo={redo}
              onSave={handleSave}
              onSaveFavorite={() => {
                if (saveSelectionAsFavorite()) {
                  favoriteStatus.show('Added to favorites');
                }
              }}
              onUndo={undo}
              onUngroup={ungroupSelectedNode}
              onAddGenerator={(generatorType) => {
                dispatch({
                  type: 'add_node',
                  item: createGeneratorItem(generatorType, document.canvas.width, document.canvas.height),
                });
              }}
              activeInspectorTab={inspectorTab}
              panelCollapsed={panelCollapsed}
              onInspectorTabChange={handleInspectorTabChange}
              itemCount={layerRows.length}
              favoriteCount={favorites.length}
            />
          </div>

          {errorMessage ? (
            <div className="app-status app-status-error overlay-status" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="overlay-tools">
            <ToolPalette activeTool={activeTool} onChange={setActiveTool} />
          </div>

          <div className="overlay-properties" style={{ display: panelCollapsed ? 'none' : undefined }}>
            <div className="overlay-properties-panel">
              <PropertiesPanel
                activeTab={inspectorTab}
                availableFonts={availableFonts}
                background={document.background}
                fonts={document.fonts}
                layerRows={layerRows}
                missingFontFamilies={missingFontFamilies}
                onDeleteFavorite={deleteFavorite}
                onRenameFavorite={renameFavorite}
                onRecolorFavorite={recolorFavorite}
                onReorderFavorite={reorderFavorite}
                selectedGroup={selectedGroup ?? undefined}
                selectedItem={selectedItem ?? undefined}
                selectedItems={selectedItems}
                selectedNodeIds={selectedNodeIds}
                pendingCollapsedGroupIds={pendingCollapsedGroupIds}
                onClearPendingCollapsedGroupIds={clearPendingCollapsedGroupIds}
                onBackgroundChange={(background) => dispatch({ type: 'set_background', background })}
                onGroupOpacityChange={updateSelectedGroup}
                onSelectGroupChildren={() => {
                  if (selectedGroup) {
                    dispatch({ type: 'select_nodes', nodeIds: selectedGroup.children.map((c) => c.id) });
                  }
                }}
                onDeleteNode={deleteNode}
                onOpenProperties={() => handleInspectorTabChange('properties')}
                onRenameGroup={(groupId, name) => {
                  dispatch({ type: 'update_group', groupId, changes: { name } });
                }}
                onItemChange={updateSelectionItems}
                onInsertFavorite={insertFavorite}
                onSelectNode={selectSingleNode}
                onToggleNode={toggleSelectedNode}
                onToggleNodeLocked={(nodeId) => {
                  const node = getNodeById(document.nodes, nodeId);
                  if (!node) return;
                  if (isGroupNode(node)) {
                    dispatch({ type: 'update_group', groupId: nodeId, changes: { locked: !node.locked } });
                  } else {
                    dispatch({ type: 'update_node', itemId: nodeId, changes: { locked: !node.locked } });
                  }
                }}
                onToggleNodeHidden={(nodeId) => {
                  const node = getNodeById(document.nodes, nodeId);
                  if (!node) return;
                  if (isGroupNode(node)) {
                    dispatch({ type: 'update_group', groupId: nodeId, changes: { hidden: !node.hidden } });
                  } else {
                    dispatch({ type: 'update_node', itemId: nodeId, changes: { hidden: !node.hidden } });
                  }
                }}
                onReorder={reorderSelectedNode}
                favorites={favorites}
              />
            </div>
          </div>
        </div>
      </main>

      <input
        ref={imageInputRef}
        data-testid="image-upload-input"
        hidden
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleImageUpload(event.target.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={fontInputRef}
        data-testid="font-upload-input"
        hidden
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
        onChange={(event) => {
          void handleFontUpload(event.target.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={openInputRef}
        data-testid="project-open-input"
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          void handleOpenProject(event.target.files);
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}
