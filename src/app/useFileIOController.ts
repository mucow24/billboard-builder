import type { CanvasRendererHandle } from '../editor/rendering/renderer/canvasRendererTypes';

import { copyCanvasToClipboard, downloadCanvasAsPng } from '../editor/io/exportPng';
import { runSvgExport } from '../editor/io/svg/browserSvgExport';
import { downloadSvg } from '../editor/io/svg/downloadSvg';
import type { SvgExportWarning } from '../editor/io/svg/svgExportTypes';
import { sanitizeBasename } from '../editor/io/filename';
import { importImageFile } from '../editor/io/images';
import { downloadProject } from '../editor/io/projectFile';
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
  setActiveTool: (tool: 'select') => void;
  setErrorMessage: (message: string | null) => void;
}

/**
 * Bringing images in and getting the canvas out as a file. Opening, starting
 * and saving documents is the library's business: `useDocumentLibraryController`.
 */
export function useFileIOController({
  document,
  addImageItem,
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

  /** Export > JSON: downloads the document as it is in the editor, unsaved changes included. */
  function handleExportJson() {
    const basename = sanitizeBasename(document.name, DEFAULT_CANVAS_NAME);
    downloadProject(document, `${basename}.json`);
  }

  return {
    handleImageFile,
    handleImageUpload,
    handleExport,
    handleExportToClipboard,
    handleExportSvg,
    handleExportJson,
  };
}
