import { useCallback, useEffect, useState } from 'react';

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
} from '../editor/core/selectors';
import { flattenLayerRows } from '../editor/document/sceneGraph';
import { useEditorStore } from '../editor/state/store';
import type { InspectorTab } from '../editor/ui/inspector/types';

export interface InspectorPanelState {
  tab: InspectorTab;
  collapsed: boolean;
}

export function useEditorController() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingCollapsedGroupIds, setPendingCollapsedGroupIds] = useState<string[]>([]);
  const [inspectorPanel, setInspectorPanel] = useState<InspectorPanelState>({
    tab: 'properties',
    collapsed: false,
  });

  const toggleInspectorTab = useCallback((tab: InspectorTab) => {
    setInspectorPanel((current) =>
      current.tab === tab
        ? { tab, collapsed: !current.collapsed }
        : { tab, collapsed: false },
    );
  }, []);

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
    moveNode,
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
    updateSelectionItems,
  } = useEditorStore();

  const wrappedDuplicateSelectedNodes = useCallback(() => {
    const groupIds = duplicateSelectedNodes();
    if (groupIds.length > 0) {
      setPendingCollapsedGroupIds(groupIds);
    }
  }, [duplicateSelectedNodes]);

  const clearPendingCollapsedGroupIds = useCallback(() => {
    setPendingCollapsedGroupIds([]);
  }, []);

  const { document, history, session } = editor;
  const {
    activeTool,
    availableFonts,
    missingFontFamilies,
    selectedNodeIds,
  } = session;
  const selectedNode = selectSelectedNode(document, editor) ?? null;
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
    handleSelectionItemChange,
  } = useFontController({
    availableFonts,
    dispatch,
    registerAvailableFont,
    setErrorMessage,
    updateSelectionItems,
  });

  const {
    handleImageFile,
    handleImageUpload,
    handleOpenProject,
    handleNewProject,
    handleExport,
    handleExportSvg,
    handleExportToClipboard,
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
    duplicateSelectedNodes: wrappedDuplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedNodes,
    onPasteImageFile: handleImageFile,
    redo,
    reorderSelectedNode,
    selectParentNode,
    selectAllNodes,
    setActiveTool,
    toggleInspectorTab,
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
      clearPendingCollapsedGroupIds,
      duplicateSelectedNodes: wrappedDuplicateSelectedNodes,
      groupSelectedNodes,
      handleExport,
      handleExportSvg,
      handleExportToClipboard,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject,
      handleSave,
      moveNode,
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
      toggleInspectorTab,
      toggleSelectedNode,
      toggleSelectedNodes,
      undo,
      ungroupSelectedNode,
      updateSelectedGroup,
      updateSelectionItems: handleSelectionItemChange,
    },
    state: {
      activeTool,
      availableFonts,
      canRedo,
      canUndo,
      document,
      errorMessage,
      inspectorPanel,
      layerRows,
      pendingCollapsedGroupIds,
      missingFontFamilies,
      selectedGroup,
      selectedItem,
      selectedItems,
      selectedNode,
      selectedNodeIds,
      favorites,
    },
  };
}
