import type { CanvasSize } from '../document/documentTypes';
import type { CanvasRendererHandle } from '../rendering/renderer/canvasRendererTypes';

/** The longer side of a library preview, in pixels: about twice the size it is shown at. */
const PREVIEW_MAX_DIMENSION = 480;

/**
 * A small image of the canvas the renderer is showing, as a PNG data URL, or
 * null when there is no renderer to draw it.
 */
export async function captureDocumentPreview(
  handle: CanvasRendererHandle | null,
  canvas: CanvasSize,
): Promise<string | null> {
  if (!handle) {
    return null;
  }
  const dataUrl = await handle.exportToDataURL({
    contentWidth: canvas.width,
    contentHeight: canvas.height,
    pixelRatio: Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(canvas.width, canvas.height)),
    mimeType: 'image/png',
  });
  return dataUrl.startsWith('data:image/') ? dataUrl : null;
}
