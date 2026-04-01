import { useEffect, useRef, useState } from 'react';

import { useCanvasBootstrap } from './useCanvasBootstrap';
import { useCanvasPersistence } from './useCanvasPersistence';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useFavoritesController } from './useFavoritesController';
import { useFileIOController } from './useFileIOController';
import { useFontController } from './useFontController';
import { useUploadedFontPersistence } from './useUploadedFontPersistence';
import { findMissingFonts } from '../editor/fonts';
import {
  selectCanRedo,
  selectCanUndo,
  selectSelectedGroup,
  selectSelectedItem,
  selectSelectedItems,
  selectSelectedNode,
  selectSelectedNodes,
} from '../editor/core/selectors';
import { flattenLayerRows } from '../editor/document/sceneGraph';
import { useEditorStore } from '../editor/state/store';

function useStableArray<T>(next: T[]): T[] {
  const ref = useRef(next);
  if (
    next.length !== ref.current.length ||
    next.some((item, i) => item !== ref.current[i])
  ) {
    ref.current = next;
  }
  return ref.current;
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
    selectParentNode,
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
  const selectedNodesRaw = selectSelectedNodes(document, editor);
  const selectedNodes = useStableArray(selectedNodesRaw);
  const selectedItem = selectSelectedItem(document, editor) ?? null;
  const selectedGroup = selectSelectedGroup(document, editor) ?? null;
  const selectedItems = selectSelectedItems(document, editor);
  const layerRows = flattenLayerRows(document.nodes);
  const canUndo = selectCanUndo(history);
  const canRedo = selectCanRedo(history);

  const { persistenceReady } = useCanvasBootstrap({
    loadDocument,
    registerAvailableFont,
  });

  const {
    favorites,
    favoritesReady,
    deleteFavorite,
    insertFavorite,
    recolorFavorite,
    renameFavorite,
    reorderFavorite,
    saveSelectionAsFavorite,
  } = useFavoritesController({
    applyTransaction,
    availableFonts,
    document,
    registerAvailableFont,
    selectedNodeIds,
    setErrorMessage,
  });

  const {
    handleFontUpload,
    handleSelectedItemUpdate,
    handleSelectedItemsUpdate,
  } = useFontController({
    availableFonts,
    dispatch,
    registerAvailableFont,
    setErrorMessage,
    updateSelectedItem,
    updateSelectedItems,
  });

  const {
    handleImageFile,
    handleImageUpload,
    handleOpenProject,
    handleNewProject,
    handleExport,
    handleSave,
  } = useFileIOController({
    document,
    addImageItem,
    loadDocument,
    resetDocument,
    setActiveTool,
    setErrorMessage,
  });

  useEffect(() => {
    if (!persistenceReady) {
      return;
    }
    setMissingFontFamilies(findMissingFonts(document.fonts, availableFonts));
  }, [availableFonts, document.fonts, persistenceReady, setMissingFontFamilies]);

  useCanvasPersistence({ document, persistenceReady });
  useUploadedFontPersistence({
    documentFonts: document.fonts,
    favorites,
    favoritesReady,
    persistenceReady,
  });

  useEditorShortcuts({
    applyTransaction,
    deleteSelectedNodes,
    duplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedNodes,
    onPasteImageFile: handleImageFile,
    redo,
    reorderSelectedNode,
    selectParentNode,
    selectedNodes,
    selectAllNodes,
    setActiveTool,
    undo,
    ungroupSelectedNode,
  });

  return {
    actions: {
      applyTransaction,
      deleteFavorite,
      deleteNode,
      renameFavorite,
      recolorFavorite,
      reorderFavorite,
      deleteSelectedNodes,
      dispatch,
      duplicateSelectedNodes,
      groupSelectedNodes,
      handleExport,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject,
      handleSave,
      nudgeSelectedNodes,
      redo,
      reorderSelectedNode,
      saveSelectionAsFavorite,
      selectParentNode,
      selectAllNodes,
      selectSingleNode,
      setActiveTool,
      setCanvasSize,
      insertFavorite,
      toggleSelectedNode,
      toggleSelectedNodes,
      undo,
      ungroupSelectedNode,
      updateSelectedGroup,
      updateSelectedItem: handleSelectedItemUpdate,
      updateSelectedItems: handleSelectedItemsUpdate,
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
      selectedNode,
      selectedNodeIds,
      selectedNodes,
      favorites,
    },
  };
}
