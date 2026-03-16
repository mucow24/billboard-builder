import { useEffect, useState } from 'react';
import type Konva from 'konva';

import { useCanvasBootstrap } from './useCanvasBootstrap';
import { useCanvasPersistence } from './useCanvasPersistence';
import { useEditorShortcuts } from './useEditorShortcuts';
import { downloadStageAsPng } from '../editor/io/exportPng';
import { findMissingFonts, registerFontFile, toFontReference } from '../editor/fonts';
import { importImageFile } from '../editor/io/images';
import { downloadProject, readProjectFile } from '../editor/io/projectFile';
import { selectCanRedo, selectCanUndo, selectSelectedItem } from '../editor/core/selectors';
import { createImageItem } from '../editor/document/documentDefaults';
import { useEditorStore } from '../editor/state/store';

function getPointerCenteredPosition(x: number, y: number) {
  return {
    x: Math.max(16, x - 120),
    y: Math.max(16, y - 60),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useEditorController() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    activeTool,
    availableFonts,
    document,
    historyFuture,
    historyPast,
    missingFontFamilies,
    exportScale,
    selectedItemIds,
    addImageItem,
    deleteItem,
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
    setMissingFontFamilies,
    undo,
    updateSelectedItem,
  } = useEditorStore();

  const selectedItem = selectSelectedItem(document, {
    activeTool,
    availableFonts,
    missingFontFamilies,
    exportScale,
    selectedItemIds,
  });
  const selectedItemOrNull = selectedItem ?? null;
  const canUndo = selectCanUndo({ past: historyPast, future: historyFuture });
  const canRedo = selectCanRedo({ past: historyPast, future: historyFuture });

  const { persistenceReady } = useCanvasBootstrap({
    dispatch,
    loadDocument,
    registerAvailableFont,
  });

  useEffect(() => {
    setMissingFontFamilies(findMissingFonts(document.fonts, availableFonts));
  }, [availableFonts, document.fonts, setMissingFontFamilies]);

  useCanvasPersistence({ document, persistenceReady });

  useEditorShortcuts({
    deleteSelectedItems,
    dispatch,
    onPasteImageFile: handleImageFile,
    redo,
    reorderSelectedItem,
    selectedItem: selectedItemOrNull,
    setActiveTool,
    undo,
  });

  async function handleImageFile(file: File) {
    try {
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
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Failed to import image: ${getErrorMessage(error, 'Unknown error.')}`);
    }
  }

  async function handleImageUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    await handleImageFile(file);
  }

  async function handleFontUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    try {
      const uploadedFont = await registerFontFile(file);
      registerAvailableFont(uploadedFont);
      dispatch({
        type: 'register_font',
        font: toFontReference(uploadedFont),
      });
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Failed to register font: ${getErrorMessage(error, 'Unknown error.')}`);
    }
  }

  async function handleOpenProject(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    try {
      const projectDocument = await readProjectFile(file);
      loadDocument(projectDocument);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Failed to open project: ${getErrorMessage(error, 'Unknown error.')}`);
    }
  }

  function handleNewProject(onAfterReset?: () => void) {
    onAfterReset?.();
    setErrorMessage(null);
    resetDocument();
  }

  function handleExport(stage: Konva.Stage | null) {
    if (!stage) {
      return;
    }
    downloadStageAsPng(stage, 1);
  }

  function handleSave() {
    downloadProject(document);
  }

  return {
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
      undo,
      updateSelectedItem,
    },
    state: {
      activeTool,
      availableFonts,
      canRedo,
      canUndo,
      document,
      errorMessage,
      missingFontFamilies,
      selectedItem: selectedItemOrNull,
      selectedItemIds,
    },
  };
}
