import { useLayoutEffect, useRef, useState } from 'react';
import type Konva from 'konva';

import { useEditorController } from './app/useEditorController';
import { CanvasStage } from './editor/rendering/CanvasStage';
import { ToolPalette } from './editor/ui/ToolPalette';
import { Toolbar } from './editor/ui/Toolbar';
import { PropertiesPanel } from './editor/ui/PropertiesPanel';
import type { CanvasItem, GuideLine } from './editor/document/documentTypes';

export default function App() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [topbarHeight, setTopbarHeight] = useState(56);
  const topbarRef = useRef<HTMLDivElement | null>(null);

  const {
    actions: {
      deleteItem,
      deleteSelectedItems,
      dispatch,
      handleExport,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject,
      handleSave,
      redo,
      reorderSelectedItem,
      selectSingleItem,
      setActiveTool,
      setCanvasSize,
      toggleSelectedItem,
      toggleSelectedItems,
      undo,
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
      missingFontFamilies,
      selectedItem,
      selectedItemIds,
      selectedItems,
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

  return (
    <div className="app-shell">
      <main className="editor-layout editor-layout-overlay">
        <CanvasStage
          activeTool={activeTool}
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
              canUndo={canUndo}
              canRedo={canRedo}
              onCanvasSizeChange={setCanvasSize}
              onDelete={deleteSelectedItems}
              onExport={() => handleExport(stageRef.current)}
              onFontUpload={() => fontInputRef.current?.click()}
              onImageUpload={() => imageInputRef.current?.click()}
              onLoad={() => openInputRef.current?.click()}
              onNewProject={() => {
                handleNewProject(() => {
                  setGuides([]);
                });
              }}
              onRedo={redo}
              onSave={handleSave}
              onUndo={undo}
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
                missingFontFamilies={missingFontFamilies}
                selectedItem={selectedItem ?? undefined}
                selectedItems={selectedItems}
                onBackgroundChange={(background) => dispatch({ type: 'set_background', background })}
                onDeleteItem={deleteItem}
                onItemChange={(changes: Partial<CanvasItem>) => {
                  if (selectedItems.length > 1) {
                    updateSelectedItems(selectedItems.map((item) => ({ itemId: item.id, changes })));
                    return;
                  }
                  updateSelectedItem(changes);
                }}
                onSelectItem={selectSingleItem}
                onReorder={reorderSelectedItem}
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
