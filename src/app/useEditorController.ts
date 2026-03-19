import { useEffect, useState } from 'react';
import type Konva from 'konva';

import { useCanvasBootstrap } from './useCanvasBootstrap';
import { useCanvasPersistence } from './useCanvasPersistence';
import { useEditorShortcuts } from './useEditorShortcuts';
import { downloadStageAsPng } from '../editor/io/exportPng';
import { findMissingFonts, registerFontFile, toFontReference } from '../editor/fonts';
import { importImageFile } from '../editor/io/images';
import { downloadProject, readProjectFile } from '../editor/io/projectFile';
import {
  selectCanRedo,
  selectCanUndo,
  selectSelectedGroup,
  selectSelectedItem,
  selectSelectedItems,
  selectSelectedNode,
  selectSelectedNodes,
} from '../editor/core/selectors';
import { createImageItem } from '../editor/document/documentDefaults';
import { flattenLayerRows } from '../editor/document/sceneGraph';
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
    deleteNode,
    deleteSelectedNodes,
    dispatch,
    duplicateSelectedNodes,
    groupSelectedNodes,
    loadDocument,
    nudgeSelectedNodes,
    redo,
    registerAvailableFont,
    reorderSelectedNode,
    resetDocument,
    selectAllNodes,
    selectSingleNode,
    setActiveTool,
    setCanvasSize,
    setMissingFontFamilies,
    toggleSelectedNode,
    toggleSelectedNodes,
    undo,
    ungroupSelectedNode,
    updateSelectedGroup,
    updateSelectedItem,
    updateSelectedItems,
  } = useEditorStore();

  const { document, history, session } = editor;
  const {
    activeTool,
    availableFonts,
    missingFontFamilies,
    selectedNodeIds,
  } = session;
  const selectedNode = selectSelectedNode(document, editor) ?? null;
  const selectedNodes = selectSelectedNodes(document, editor);
  const selectedItem = selectSelectedItem(document, editor) ?? null;
  const selectedGroup = selectSelectedGroup(document, editor) ?? null;
  const selectedItems = selectSelectedItems(document, editor);
  const layerRows = flattenLayerRows(document.nodes);
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
    deleteSelectedNodes,
    duplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedNodes,
    onPasteImageFile: handleImageFile,
    redo,
    reorderSelectedNode,
    selectedNodes,
    selectAllNodes,
    setActiveTool,
    undo,
    ungroupSelectedNode,
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
      deleteItem: deleteNode,
      deleteNode,
      deleteSelectedItems: deleteSelectedNodes,
      deleteSelectedNodes,
      dispatch,
      duplicateSelectedItems: duplicateSelectedNodes,
      duplicateSelectedNodes,
      groupSelectedNodes,
      handleExport,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject,
      handleSave,
      nudgeSelectedItems: nudgeSelectedNodes,
      nudgeSelectedNodes,
      redo,
      reorderSelectedItem: reorderSelectedNode,
      reorderSelectedNode,
      selectAllItems: selectAllNodes,
      selectAllNodes,
      selectSingleItem: selectSingleNode,
      selectSingleNode,
      setActiveTool,
      setCanvasSize,
      toggleSelectedItem: toggleSelectedNode,
      toggleSelectedNode,
      toggleSelectedItems: toggleSelectedNodes,
      toggleSelectedNodes,
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
      selectedItems,
      selectedItemIds: selectedNodeIds,
      selectedNode,
      selectedNodeIds,
      selectedNodes,
    },
  };
}
