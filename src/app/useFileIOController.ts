import type { CanvasRendererHandle } from '../editor/rendering/renderer/canvasRendererTypes';

import { copyCanvasToClipboard, downloadCanvasAsPng } from '../editor/io/exportPng';
import { runSvgExport } from '../editor/io/svg/browserSvgExport';
import { downloadSvg } from '../editor/io/svg/downloadSvg';
import type { SvgExportWarning } from '../editor/io/svg/svgExportTypes';
import { sanitizeBasename } from '../editor/io/filename';
import { importImageFile } from '../editor/io/images';
import { downloadProject, readProjectFile } from '../editor/io/projectFile';
import { createImageItem, DEFAULT_CANVAS_NAME } from '../editor/document/documentDefaults';
import type { ProjectDocument } from '../editor/document/documentTypes';

function getPointerCenteredPosition(x: number, y: number) {
  return {
    x: Math.max(16, x - 120),
    y: Math.max(16, y - 60),
  };
}

function formatSvgExportWarnings(warnings: SvgExportWarning[]): string {
  const layers = warnings.map((w) => `“${w.itemName}” (${w.fontFamily})`).join(', ');
  return `Can't export to SVG: ${layers} use system fonts with no embeddable outlines. Switch them to a bundled font to include them.`;
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

  function handleExport(handle: CanvasRendererHandle | null) {
    if (!handle) {
      return;
    }
    const basename = sanitizeBasename(document.name, DEFAULT_CANVAS_NAME);
    void downloadCanvasAsPng(handle, document.canvas.width, document.canvas.height, 1, `${basename}.png`);
  }

  async function handleExportToClipboard(handle: CanvasRendererHandle | null): Promise<boolean> {
    if (!handle) {
      return false;
    }
    try {
      await copyCanvasToClipboard(handle, document.canvas.width, document.canvas.height, 1);
      setErrorMessage(null);
      return true;
    } catch (error) {
      setErrorMessage(`Failed to copy to clipboard: ${getErrorMessage(error, 'Unknown error.')}`);
      return false;
    }
  }

  // SVG export works from the document model (not the renderer handle). If any
  // text layer can't be vectorized we block the export and name the layers,
  // rather than ship a degraded file.
  async function handleExportSvg(): Promise<boolean> {
    try {
      const { svg, warnings } = await runSvgExport(document);
      if (warnings.length > 0) {
        setErrorMessage(formatSvgExportWarnings(warnings));
        return false;
      }
      const basename = sanitizeBasename(document.name, DEFAULT_CANVAS_NAME);
      downloadSvg(svg, `${basename}.svg`);
      setErrorMessage(null);
      return true;
    } catch (error) {
      setErrorMessage(`Failed to export SVG: ${getErrorMessage(error, 'Unknown error.')}`);
      return false;
    }
  }

  function handleSave() {
    const basename = sanitizeBasename(document.name, DEFAULT_CANVAS_NAME);
    downloadProject(document, `${basename}.json`);
  }

  return {
    handleImageFile,
    handleImageUpload,
    handleOpenProject,
    handleNewProject,
    handleExport,
    handleExportToClipboard,
    handleExportSvg,
    handleSave,
  };
}
