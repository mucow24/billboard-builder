import type { CanvasRendererHandle } from '../rendering/renderer/canvasRendererTypes';

export async function downloadCanvasAsPng(
  handle: CanvasRendererHandle,
  contentWidth: number,
  contentHeight: number,
  pixelRatio: number,
  fileName = 'billboard-export.png',
) {
  const dataUrl = await handle.exportToDataURL({
    contentWidth,
    contentHeight,
    pixelRatio,
    mimeType: 'image/png',
  });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}
