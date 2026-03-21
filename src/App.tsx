import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type Konva from 'konva';

import { readEditorRuntimeFlags } from './app/editorRuntimeFlags';
import { useEditorController } from './app/useEditorController';
import { CanvasStage } from './editor/rendering/CanvasStage';
import { ToolPalette } from './editor/ui/ToolPalette';
import { Toolbar } from './editor/ui/Toolbar';
import { PropertiesPanel } from './editor/ui/PropertiesPanel';
import type { CanvasItem, GuideLine } from './editor/document/documentTypes';
import { canGroupNodes, canUngroupNode } from './editor/document/sceneGraph';

export default function App() {
  const runtimeFlags = readEditorRuntimeFlags();
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [showExportBoundsCue, setShowExportBoundsCue] = useState(false);
  const [topbarHeight, setTopbarHeight] = useState(56);
  const topbarRef = useRef<HTMLDivElement | null>(null);

  const {
    actions: {
      deleteTemplate,
      deleteSelectedItems,
      dispatch,
      groupSelectedNodes,
      handleExport,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject,
      handleSave,
      redo,
      reorderSelectedItem,
      saveSelectionAsTemplate,
      selectSingleItem,
      setActiveTool,
      setCanvasSize,
      insertTemplate,
      toggleSelectedItem,
      toggleSelectedItems,
      undo,
      ungroupSelectedNode,
      updateSelectedGroup,
      updateSelectedItem,
      updateSelectedItems,
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
      selectedGroup,
      selectedItem,
      selectedItemIds,
      selectedItems,
      selectedNode,
      selectedNodeIds,
      templates,
    },
  } = useEditorController();

  useLayoutEffect(() => {
    const element = topbarRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      setTopbarHeight(Math.ceil(element.getBoundingClientRect().height));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  const handleExportIntentChange = useCallback((active: boolean) => {
    setShowExportBoundsCue(active);
  }, []);

  return (
    <div className="app-shell">
      <main className="editor-layout editor-layout-overlay">
        <CanvasStage
          activeTool={activeTool}
          debugMode={runtimeFlags.debugMode}
          showCanvasTestHooks={runtimeFlags.enableCanvasTestHooks}
          showExportBoundsCue={showExportBoundsCue}
          document={document}
          selectedItemIds={selectedItemIds}
          guides={guides}
          onGuidesChange={setGuides}
          onSelectItem={selectSingleItem}
          onToggleSelectItem={toggleSelectedItem}
          onToggleSelectItems={toggleSelectedItems}
          onUpdateItem={(itemId, changes) => {
            dispatch({ type: 'update_item', itemId, changes });
          }}
          onUpdateItems={updateSelectedItems}
          onAddItem={(item) => dispatch({ type: 'add_item', item })}
          onSetActiveTool={setActiveTool}
          stageRef={stageRef}
        />

        <div
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
              canSaveTemplate={selectedNodeIds.length > 0}
              onCanvasSizeChange={setCanvasSize}
              onDelete={deleteSelectedItems}
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
              onSaveTemplate={saveSelectionAsTemplate}
              onUndo={undo}
              onUngroup={ungroupSelectedNode}
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

          <div className="overlay-properties">
            <div className="overlay-properties-panel">
              <PropertiesPanel
                availableFonts={availableFonts}
                background={document.background}
                fonts={document.fonts}
                items={document.items}
                layerRows={layerRows}
                missingFontFamilies={missingFontFamilies}
                onDeleteTemplate={deleteTemplate}
                selectedGroup={selectedGroup ?? undefined}
                selectedItem={selectedItem ?? undefined}
                selectedItems={selectedItems}
                selectedNodeIds={selectedNodeIds}
                onBackgroundChange={(background) => dispatch({ type: 'set_background', background })}
                onGroupOpacityChange={updateSelectedGroup}
                onDeleteSelection={deleteSelectedItems}
                onItemChange={(changes: Partial<CanvasItem>) => {
                  if (selectedItems.length > 1) {
                    updateSelectedItems(selectedItems.map((item) => ({ itemId: item.id, changes })));
                    return;
                  }
                  updateSelectedItem(changes);
                }}
                onInsertTemplate={insertTemplate}
                onSelectNode={selectSingleItem}
                onReorder={reorderSelectedItem}
                templates={templates}
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
