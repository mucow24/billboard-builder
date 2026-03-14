import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';

import { CanvasStage } from './editor/canvas/CanvasStage';
import { ToolPalette } from './editor/components/ToolPalette';
import { Toolbar } from './editor/components/Toolbar';
import { PropertiesPanel } from './editor/components/PropertiesPanel';
import { createImageItem } from './editor/model/defaults';
import { downloadStageAsPng } from './editor/io/exportPng';
import {
  findMissingFonts,
  loadBundledFonts,
  registerFontFile,
  toFontReference,
} from './editor/io/fonts';
import { importImageFile } from './editor/io/images';
import { downloadProject, readAutosave, readProjectFile, saveAutosave } from './editor/io/projectFile';
import { useEditorStore } from './editor/state/store';
import type { CanvasItem, GuideLine } from './editor/model/types';

function getPointerCenteredPosition(x: number, y: number) {
  return {
    x: Math.max(16, x - 120),
    y: Math.max(16, y - 60),
  };
}

function getCanvasCenteredPosition(width: number, height: number) {
  return {
    x: Math.max(16, width / 2 - 120),
    y: Math.max(16, height / 2 - 60),
  };
}

export default function App() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const openInputRef = useRef<HTMLInputElement | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);

  const {
    activeTool,
    availableFonts,
    document,
    exportScale,
    historyFuture,
    historyPast,
    missingFontFamilies,
    addImageItem,
    deleteSelectedItems,
    dispatch,
    loadDocument,
    redo,
    registerAvailableFont,
    reorderSelectedItem,
    resetDocument,
    selectSingleItem,
    setActiveTool,
    setCanvasSize,
    setExportScale,
    setMissingFontFamilies,
    undo,
    updateSelectedItem,
    createItemAt,
  } = useEditorStore();

  const selectedItem = document.items.find(
    (item) => item.id === document.selectedItemIds[0]
  );

  useEffect(() => {
    const autosave = readAutosave();
    if (!autosave) {
      return;
    }
    loadDocument(autosave);
  }, [loadDocument]);

  useEffect(() => {
    let isMounted = true;

    void loadBundledFonts().then((fonts) => {
      if (!isMounted) {
        return;
      }
      for (const font of fonts) {
        registerAvailableFont(font);
        dispatch({
          type: 'register_font',
          font: toFontReference(font),
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [dispatch, registerAvailableFont]);

  useEffect(() => {
    saveAutosave(document);
    setMissingFontFamilies(findMissingFonts(document.fonts, availableFonts));
  }, [availableFonts, document, setMissingFontFamilies]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
          return;
        }
        undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target as HTMLElement | null;
        const isInputFocused = target
          ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
          : false;
        if (isInputFocused) {
          return;
        }
        event.preventDefault();
        deleteSelectedItems();
        return;
      }
      const hotkeyMap = new Map([
        ['v', 'select'],
        ['t', 'text'],
        ['r', 'rectangle'],
        ['o', 'ellipse'],
        ['l', 'line'],
      ] as const);
      const pressedKey = event.key.toLowerCase() as 'v' | 't' | 'r' | 'o' | 'l';
      const tool = hotkeyMap.get(pressedKey);
      if (tool) {
        setActiveTool(tool);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedItems, redo, setActiveTool, undo]);

  async function handleImageUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    const image = await importImageFile(file);
    const imageItem = createImageItem({
      src: image.src,
      mimeType: image.mimeType,
      originalWidth: image.width,
      originalHeight: image.height,
      name: image.sourceName,
      ...getPointerCenteredPosition(180, 180),
    });
    addImageItem(imageItem);
    setActiveTool('select');
  }

  async function handleFontUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    const uploadedFont = await registerFontFile(file);
    registerAvailableFont(uploadedFont);
    dispatch({
      type: 'register_font',
      font: toFontReference(uploadedFont),
    });
  }

  async function handleOpenProject(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    const projectDocument = await readProjectFile(file);
    loadDocument(projectDocument);
  }

  return (
    <div className="app-shell">
      <Toolbar
        canvas={document.canvas}
        exportScale={exportScale}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onCanvasSizeChange={setCanvasSize}
        onDelete={deleteSelectedItems}
        onExport={() => {
          if (!stageRef.current) {
            return;
          }
          downloadStageAsPng(stageRef.current, exportScale);
        }}
        onExportScaleChange={setExportScale}
        onFontUpload={() => fontInputRef.current?.click()}
        onImageUpload={() => imageInputRef.current?.click()}
        onLoad={() => openInputRef.current?.click()}
        onNewProject={() => {
          setGuides([]);
          resetDocument();
        }}
        onRedo={redo}
        onSave={() => downloadProject(document)}
        onUndo={undo}
      />

      <div className="editor-layout">
        <ToolPalette
          activeTool={activeTool}
          onChange={setActiveTool}
          onCreate={(tool) => {
            const position = getCanvasCenteredPosition(
              document.canvas.width,
              document.canvas.height
            );
            createItemAt(tool, position.x, position.y);
          }}
        />

        <main className="canvas-workspace">
          <section className="canvas-callout">
            <h1>Billboard Builder</h1>
            <p>
              Tool buttons place a new item at center stage. Use Arrow to move, resize, rotate,
              or edit endpoints for lines.
            </p>
          </section>
          <CanvasStage
            activeTool={activeTool}
            document={document}
            guides={guides}
            onGuidesChange={setGuides}
            onSelectItem={selectSingleItem}
            onUpdateItem={(itemId, changes) => {
              dispatch({ type: 'update_item', itemId, changes });
            }}
            stageRef={stageRef}
          />
        </main>

        <PropertiesPanel
          availableFonts={availableFonts}
          background={document.background}
          fonts={document.fonts}
          items={document.items}
          missingFontFamilies={missingFontFamilies}
          selectedItem={selectedItem}
          onBackgroundChange={(background) => dispatch({ type: 'set_background', background })}
          onItemChange={(changes: Partial<CanvasItem>) => updateSelectedItem(changes)}
          onReorder={reorderSelectedItem}
          onSelectItem={selectSingleItem}
        />
      </div>

      <input
        ref={imageInputRef}
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
