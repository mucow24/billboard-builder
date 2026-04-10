import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { CanvasRendererHandle } from './editor/rendering/renderer/canvasRendererTypes';

import { readEditorRuntimeFlags } from './app/editorRuntimeFlags';
import { useEditorController } from './app/useEditorController';
import { useKeyHeld } from './app/useKeyHeld';
import { useStatusToast } from './app/useStatusToast';
import { CanvasStage } from './editor/rendering/CanvasStage';
import { ToolPalette } from './editor/ui/ToolPalette';
import { Toolbar } from './editor/ui/Toolbar';
import { PropertiesPanel } from './editor/ui/PropertiesPanel';
import { createGeneratorItem } from './editor/document/documentDefaults';
import { FontImportProvider } from './editor/ui/FontImportContext';
import type { GuideLine } from './editor/document/documentTypes';
import { canGroupNodes, canUngroupNode, getNodeById, isGroupNode } from './editor/document/sceneGraph';

export default function App() {
  const runtimeFlags = readEditorRuntimeFlags();
  const stageRef = useRef<CanvasRendererHandle | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [exportButtonHovered, setExportButtonHovered] = useState(false);
  const [canvasFocusActive, setCanvasFocusActive] = useState(false);
  const boundsKeyHeld = useKeyHeld('f');
  const showExportBoundsCue = canvasFocusActive || exportButtonHovered || boundsKeyHeld;
  const favoriteStatus = useStatusToast();
  const [topbarHeight, setTopbarHeight] = useState(56);
  const topbarRef = useRef<HTMLDivElement | null>(null);

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
      moveNode,
      redo,
      reorderSelectedNode,
      saveSelectionAsFavorite,
      selectSingleNode,
      setActiveTool,
      setCanvasSize,
      insertFavorite,
      toggleInspectorTab,
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
      inspectorPanel: { tab: inspectorTab, collapsed: panelCollapsed },
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


  const handleExportIntentChange = useCallback((active: boolean) => {
    setExportButtonHovered(active);
  }, []);

  const handleCanvasFocusToggle = useCallback(() => {
    setCanvasFocusActive((prev) => !prev);
  }, []);

  return (
    <div className="app-shell">
      <FontImportProvider onImportFont={() => fontInputRef.current?.click()}>
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
          ref={topbarRef}
          className="overlay-topbar"
          style={{ ['--overlay-topbar-height' as string]: `${topbarHeight}px` }}
        >
          <Toolbar
            background={document.background}
            canvas={document.canvas}
            canDelete={selectedNodeIds.length > 0}
            canGroup={canGroupNodes(document.nodes, selectedNodeIds)}
            canUngroup={Boolean(selectedNode && selectedNode.kind === 'group' && canUngroupNode(document.nodes, selectedNode.id))}
            canUndo={canUndo}
            canRedo={canRedo}
            canSaveFavorite={selectedNodeIds.length > 0}
            favoriteStatusFading={favoriteStatus.fading}
            favoriteStatusMessage={favoriteStatus.message}
            canvasFocusActive={canvasFocusActive}
            onCanvasFocusToggle={handleCanvasFocusToggle}
            onBackgroundChange={(background) => dispatch({ type: 'set_background', background })}
            onCanvasSizeChange={setCanvasSize}
            onDelete={deleteSelectedNodes}
            onExport={() => handleExport(stageRef.current)}
            onExportIntentChange={handleExportIntentChange}
            onGroup={groupSelectedNodes}
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
            activeInspectorTab={inspectorTab}
            panelCollapsed={panelCollapsed}
            onInspectorTabChange={toggleInspectorTab}
            itemCount={layerRows.length}
            favoriteCount={favorites.length}
            inspectorPanel={
              <PropertiesPanel
                activeTab={inspectorTab}
                availableFonts={availableFonts}
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
                onGroupOpacityChange={updateSelectedGroup}
                onSelectGroupChildren={() => {
                  if (selectedGroup) {
                    dispatch({ type: 'select_nodes', nodeIds: selectedGroup.children.map((c) => c.id) });
                  }
                }}
                onDeleteNode={deleteNode}
                onMoveNode={moveNode}
                onOpenProperties={() => toggleInspectorTab('properties')}
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
                  const nowLocked = !node.locked;
                  if (isGroupNode(node)) {
                    dispatch({ type: 'update_group', groupId: nodeId, changes: { locked: nowLocked } });
                  } else {
                    dispatch({ type: 'update_node', itemId: nodeId, changes: { locked: nowLocked } });
                  }
                  if (nowLocked && selectedNodeIds.includes(nodeId)) {
                    selectSingleNode(undefined);
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
            }
          />
        </div>

        <div className="editor-canvas-area">
          <div className="editor-overlays">
            {errorMessage ? (
              <div className="app-status app-status-error overlay-status" role="alert">
                {errorMessage}
              </div>
            ) : null}

            <div className="overlay-tools">
              <ToolPalette
                activeTool={activeTool}
                onChange={setActiveTool}
                onImageUpload={() => imageInputRef.current?.click()}
                onAddGenerator={(generatorType) => {
                  dispatch({
                    type: 'add_node',
                    item: createGeneratorItem(generatorType, document.canvas.width, document.canvas.height),
                  });
                }}
              />
            </div>
          </div>
        </div>
      </main>
      </FontImportProvider>

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
