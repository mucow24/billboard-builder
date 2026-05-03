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

export async function copyCanvasToClipboard(
  handle: CanvasRendererHandle,
  contentWidth: number,
  contentHeight: number,
  pixelRatio: number,
) {
  const dataUrl = await handle.exportToDataURL({
    contentWidth,
    contentHeight,
    pixelRatio,
    mimeType: 'image/png',
  });
  const blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
