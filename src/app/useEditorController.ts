import { useEffect, useState } from 'react';
import type Konva from 'konva';

import { useCanvasBootstrap } from './useCanvasBootstrap';
import { useCanvasPersistence } from './useCanvasPersistence';
import { useEditorShortcuts } from './useEditorShortcuts';
import { downloadStageAsPng } from '../editor/io/exportPng';
import { findMissingFonts, registerFontFile, toFontReference } from '../editor/fonts';
import { importImageFile } from '../editor/io/images';
import { downloadProject, readProjectFile } from '../editor/io/projectFile';
import { selectCanRedo, selectCanUndo, selectSelectedItem, selectSelectedItems } from '../editor/core/selectors';
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
    editor,
    applyTransaction,
    addImageItem,
    deleteItem,
    deleteSelectedItems,
    dispatch,
    duplicateSelectedItems,
    loadDocument,
    nudgeSelectedItems,
    redo,
    registerAvailableFont,
    reorderSelectedItem,
    resetDocument,
    selectAllItems,
    selectSingleItem,
    setActiveTool,
    setCanvasSize,
    setMissingFontFamilies,
    toggleSelectedItem,
    toggleSelectedItems,
    undo,
    updateSelectedItem,
    updateSelectedItems,
  } = useEditorStore();

  const { document, history, session } = editor;
  const {
    activeTool,
    availableFonts,
    missingFontFamilies,
    selectedItemIds,
  } = session;
  const selectedItem = selectSelectedItem(document, editor);
  const selectedItems = selectSelectedItems(document, editor);
  const selectedItemOrNull = selectedItem ?? null;
  const canUndo = selectCanUndo(history);
  const canRedo = selectCanRedo(history);

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
    applyTransaction,
    deleteSelectedItems,
    duplicateSelectedItems,
    nudgeSelectedItems,
    onPasteImageFile: handleImageFile,
    redo,
    reorderSelectedItem,
    selectAllItems,
    selectedItems,
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
      applyTransaction,
      deleteItem,
      deleteSelectedItems,
      dispatch,
      duplicateSelectedItems,
      handleExport,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject,
      handleSave,
      nudgeSelectedItems,
      redo,
      reorderSelectedItem,
      selectAllItems,
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
      selectedItem: selectedItemOrNull,
      selectedItemIds,
      selectedItems,
    },
  };
}
