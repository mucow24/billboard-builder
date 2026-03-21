import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';

import {
  buildDefaultTemplateName,
  instantiateTemplateNodes,
  uniquifyTemplateName,
} from './templateLibrary';
import { useCanvasBootstrap } from './useCanvasBootstrap';
import { useCanvasPersistence } from './useCanvasPersistence';
import { useEditorShortcuts } from './useEditorShortcuts';
import { restoreUploadedFontsForReferences } from './uploadedFontPersistence';
import { useUploadedFontPersistence } from './useUploadedFontPersistence';
import { buildTemplateSelectionPayload } from '../editor/document/templateLibrary';
import { downloadStageAsPng } from '../editor/io/exportPng';
import { findMissingFonts, registerFontFile, toFontReference } from '../editor/fonts';
import { importImageFile } from '../editor/io/images';
import { downloadProject, readProjectFile } from '../editor/io/projectFile';
import { defaultTemplateLibraryService, type StoredTemplate } from '../editor/persistence/templateLibraryService';
import { defaultUploadedFontPersistenceService } from '../editor/persistence/uploadedFontPersistenceService';
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
import type { CanvasItem } from '../editor/document/documentTypes';

function getPointerCenteredPosition(x: number, y: number) {
  return {
    x: Math.max(16, x - 120),
    y: Math.max(16, y - 60),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Response(blob).arrayBuffer();
}

export function useEditorController() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [templatesReady, setTemplatesReady] = useState(false);
  const templateInsertCountsRef = useRef<Record<string, number>>({});

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
  const selectedNodes = selectSelectedNodes(document, editor);
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

  useEffect(() => {
    try {
      setTemplates(defaultTemplateLibraryService.load());
    } catch (error) {
      setErrorMessage(
        `Failed to load template library: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    } finally {
      setTemplatesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!persistenceReady) {
      return;
    }
    setMissingFontFamilies(findMissingFonts(document.fonts, availableFonts));
  }, [availableFonts, document.fonts, persistenceReady, setMissingFontFamilies]);

  useCanvasPersistence({ document, persistenceReady });
  useUploadedFontPersistence({
    documentFonts: document.fonts,
    persistenceReady,
    templates,
    templatesReady,
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
      try {
        await defaultUploadedFontPersistenceService.save(
          uploadedFont,
          await readBlobArrayBuffer(file),
        );
      } catch (error) {
        setErrorMessage(
          `Uploaded font is ready for this session, but failed to persist it: ${getErrorMessage(error, 'Unknown error.')}`,
        );
        return;
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`Failed to register font: ${getErrorMessage(error, 'Unknown error.')}`);
    }
  }

  function registerDocumentFontForFamily(fontFamily: string | undefined) {
    if (typeof fontFamily !== 'string') {
      return;
    }

    const matchingFont = availableFonts.find((font) => font.family === fontFamily);
    if (!matchingFont) {
      return;
    }

    dispatch({
      type: 'register_font',
      font: toFontReference(matchingFont),
    });
  }

  function handleSelectedItemUpdate(changes: Partial<CanvasItem>) {
    updateSelectedItem(changes);
    registerDocumentFontForFamily('fontFamily' in changes ? changes.fontFamily : undefined);
  }

  function handleSelectedItemsUpdate(
    changesById: Array<{ itemId: string; changes: Partial<CanvasItem> }>,
  ) {
    const fontFamilies = new Set(
      changesById.flatMap(({ changes }) =>
        'fontFamily' in changes && typeof changes.fontFamily === 'string'
          ? [changes.fontFamily]
          : [],
      ),
    );

    updateSelectedItems(changesById);

    for (const fontFamily of fontFamilies) {
      registerDocumentFontForFamily(fontFamily);
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

  function persistTemplates(nextTemplates: StoredTemplate[]) {
    defaultTemplateLibraryService.save(nextTemplates);
    setTemplates(nextTemplates);
  }

  function saveSelectionAsTemplate() {
    const payload = buildTemplateSelectionPayload(document, selectedNodeIds);
    if (payload.nodes.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const name = uniquifyTemplateName(
      buildDefaultTemplateName(payload.nodes),
      templates,
    );
    const nextTemplate: StoredTemplate = {
      id: crypto.randomUUID(),
      name,
      nodes: payload.nodes,
      fonts: payload.fonts,
      createdAt: now,
      updatedAt: now,
    };

    try {
      persistTemplates([...templates, nextTemplate]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        `Failed to save template: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    }
  }

  async function insertTemplate(templateId: string) {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }

    await restoreUploadedFontsForReferences({
      references: template.fonts,
      availableFonts,
      registerAvailableFont,
    });

    const nextInsertCount = (templateInsertCountsRef.current[templateId] ?? 0) + 1;
    templateInsertCountsRef.current[templateId] = nextInsertCount;
    const insertedNodes = instantiateTemplateNodes(template.nodes, nextInsertCount);

    applyTransaction([
      {
        family: 'document' as const,
        command: { type: 'insert_nodes' as const, nodes: insertedNodes },
      },
      ...template.fonts.map((font) => ({
        family: 'document' as const,
        command: { type: 'register_font' as const, font },
      })),
      {
        family: 'selection' as const,
        command: {
          type: 'select_nodes' as const,
          nodeIds: insertedNodes.map((node) => node.id),
        },
      },
    ]);
    setErrorMessage(null);
  }

  function deleteTemplate(templateId: string) {
    const nextTemplates = templates.filter((template) => template.id !== templateId);
    if (nextTemplates.length === templates.length) {
      return;
    }

    try {
      persistTemplates(nextTemplates);
      delete templateInsertCountsRef.current[templateId];
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        `Failed to delete template: ${getErrorMessage(error, 'Unknown error.')}`,
      );
    }
  }

  return {
    actions: {
      applyTransaction,
      deleteItem: deleteNode,
      deleteTemplate,
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
      saveSelectionAsTemplate,
      selectAllItems: selectAllNodes,
      selectParentNode,
      selectAllNodes,
      selectSingleItem: selectSingleNode,
      selectSingleNode,
      setActiveTool,
      setCanvasSize,
      insertTemplate,
      toggleSelectedItem: toggleSelectedNode,
      toggleSelectedNode,
      toggleSelectedItems: toggleSelectedNodes,
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
      selectedItemIds: selectedNodeIds,
      selectedNode,
      selectedNodeIds,
      selectedNodes,
      templates,
    },
  };
}
