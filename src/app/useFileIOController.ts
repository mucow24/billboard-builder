import type Konva from 'konva';

import { downloadStageAsPng } from '../editor/io/exportPng';
import { importImageFile } from '../editor/io/images';
import { downloadProject, readProjectFile } from '../editor/io/projectFile';
import { createImageItem } from '../editor/document/documentDefaults';
import type { ProjectDocument } from '../editor/document/documentTypes';

function getPointerCenteredPosition(x: number, y: number) {
  return {
    x: Math.max(16, x - 120),
    y: Math.max(16, y - 60),
  };
}

import { getErrorMessage } from './errorUtils';

interface UseFileIOControllerParams {
  document: ProjectDocument;
  addImageItem: (item: ReturnType<typeof createImageItem>) => void;
  loadDocument: (document: ProjectDocument) => void;
  resetDocument: () => void;
  setActiveTool: (tool: 'select') => void;
  setErrorMessage: (message: string | null) => void;
}

export function useFileIOController({
  document,
  addImageItem,
  loadDocument,
  resetDocument,
  setActiveTool,
  setErrorMessage,
}: UseFileIOControllerParams) {
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
    handleImageFile,
    handleImageUpload,
    handleOpenProject,
    handleNewProject,
    handleExport,
    handleSave,
  };
}
