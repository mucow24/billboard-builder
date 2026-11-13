import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDocumentLibrarySession } from './documentLibrarySession';
import { useCanvasPersistence } from './useCanvasPersistence';
import { useDocumentLibraryController } from './useDocumentLibraryController';
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
import type { ProjectDocument } from '../editor/document/documentTypes';
import { flattenLayerRows } from '../editor/document/sceneGraph';
import { captureDocumentPreview } from '../editor/io/documentPreview';
import type { CanvasRendererHandle } from '../editor/rendering/renderer/canvasRendererTypes';
import { useEditorStore } from '../editor/state/store';
import type { InspectorTab } from '../editor/ui/inspector/types';

export interface InspectorPanelState {
  tab: InspectorTab;
  collapsed: boolean;
}

interface UseEditorControllerArgs {
  /**
   * Every bundled font has been registered or has failed to load. Until then a
   * font the document references may simply not have arrived yet.
   */
  fontsReady: boolean;
  /** The renderer showing the canvas, used to draw library previews. Without one, documents are saved without a preview. */
  getRendererHandle?: () => CanvasRendererHandle | null;
}

/**
 * The editor's state and actions. Mount it only once startup has put the saved
 * canvas in the store and read the library (`useEditorStartup`): from its first
 * render the document is autosaved, and stored fonts that nothing references
 * are deleted.
 */
export function useEditorController({ fontsReady, getRendererHandle }: UseEditorControllerArgs) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
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
    moveNode,
    nudgeSelectedNodes,
    redo,
    registerAvailableFont,
    reorderSelectedNode,
    selectAllNodes,
    selectParentNode,
    selectSingleNode,
    setActiveTool,
    setCanvasSize,
    setMissingFontFamilies,
    setSelectionLocked,
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

  const { handleFontUpload } = useFontController({
    registerAvailableFont,
    setErrorMessage,
  });

  const {
    handleImageFile,
    handleImageUpload,
    handleExport,
    handleExportJson,
    handleExportSvg,
    handleExportToClipboard,
  } = useFileIOController({
    document,
    addImageItem,
    setActiveTool,
    setErrorMessage,
  });

  const capturePreview = useCallback(
    (previewDocument: ProjectDocument) =>
      captureDocumentPreview(getRendererHandle?.() ?? null, previewDocument.canvas),
    [getRendererHandle],
  );
  const { actions: library, state: libraryState } = useDocumentLibraryController({
    document,
    capturePreview,
    setErrorMessage,
  });
  const libraryEntriesKnown = useDocumentLibrarySession((state) => state.entriesKnown);
  const libraryFonts = useMemo(
    () => libraryState.entries.flatMap((entry) => entry.fonts),
    [libraryState.entries],
  );

  const handleSave = useCallback(() => {
    void library.saveDocument();
  }, [library]);
  const handleRevert = useCallback(() => {
    void library.revertDocument();
  }, [library]);
  const handleNewProject = useCallback(async () => {
    await library.newDocument();
  }, [library]);
  const openLibrary = useCallback(() => setLibraryOpen(true), []);
  const closeLibrary = useCallback(() => setLibraryOpen(false), []);

  useEffect(() => {
    if (!fontsReady) {
      return;
    }
    setMissingFontFamilies(findMissingFonts(document.fonts, availableFonts));
  }, [availableFonts, document.fonts, fontsReady, setMissingFontFamilies]);

  useCanvasPersistence({ document, documentId: libraryState.documentId });
  useUploadedFontPersistence({
    documentFonts: document.fonts,
    favorites,
    favoritesReady,
    libraryFonts,
    libraryReady: libraryEntriesKnown,
  });

  useEditorShortcuts({
    applyTransaction,
    deleteSelectedNodes,
    duplicateSelectedNodes: wrappedDuplicateSelectedNodes,
    groupSelectedNodes,
    nudgeSelectedNodes,
    onPasteImageFile: handleImageFile,
    onSave: handleSave,
    suspended: libraryOpen || libraryState.busy,
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
      handleExportJson,
      handleExportSvg,
      handleExportToClipboard,
      handleFontUpload,
      handleImageUpload,
      handleNewProject,
      handleOpenProject: library.importProjectFile,
      handleRevert,
      handleSave,
      openLibrary,
      closeLibrary,
      openLibraryDocument: library.openLibraryDocument,
      renameLibraryDocument: library.renameLibraryDocument,
      deleteLibraryDocument: library.deleteLibraryDocument,
      exportLibraryDocument: library.exportLibraryDocument,
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
      setSelectionLocked,
      insertFavorite,
      toggleInspectorTab,
      toggleSelectedNode,
      toggleSelectedNodes,
      undo,
      ungroupSelectedNode,
      updateSelectedGroup,
      updateSelectionItems,
    },
    state: {
      activeTool,
      availableFonts,
      canRedo,
      canRevert: libraryState.canRevert,
      canUndo,
      document,
      documentId: libraryState.documentId,
      errorMessage,
      hasUnsavedChanges: libraryState.hasUnsavedChanges,
      inspectorPanel,
      libraryBusy: libraryState.busy,
      libraryEntries: libraryState.entries,
      libraryOpen,
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
