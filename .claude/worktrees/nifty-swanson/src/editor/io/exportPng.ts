import type Konva from 'konva';

const EXPORT_EXCLUDE_SELECTOR = '.export-exclude';
const EXPORT_ROOT_SELECTOR = '.export-root';

export function downloadStageAsPng(
  stage: Konva.Stage,
  pixelRatio: number,
  fileName = 'billboard-export.png'
) {
  const exportRoot = stage.findOne(EXPORT_ROOT_SELECTOR);
  if (!exportRoot) {
    const dataUrl = stage.toDataURL({
      pixelRatio,
      mimeType: 'image/png',
    });
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.click();
    return;
  }

  const excludedNodes = stage.find(EXPORT_EXCLUDE_SELECTOR);
  const visibilitySnapshot = excludedNodes.map((node) => ({
    node,
    visible: node.visible(),
    listening: node.listening(),
  }));
  const transformSnapshot = {
    x: typeof exportRoot.x === 'function' ? exportRoot.x() : 0,
    y: typeof exportRoot.y === 'function' ? exportRoot.y() : 0,
    scaleX: typeof exportRoot.scaleX === 'function' ? exportRoot.scaleX() : 1,
    scaleY: typeof exportRoot.scaleY === 'function' ? exportRoot.scaleY() : 1,
  };
  const width = typeof exportRoot.width === 'function' ? exportRoot.width() : stage.width();
  const height = typeof exportRoot.height === 'function' ? exportRoot.height() : stage.height();

  try {
    excludedNodes.forEach((node) => {
      node.visible(false);
      node.listening(false);
    });
    exportRoot.position({ x: 0, y: 0 });
    exportRoot.scale({ x: 1, y: 1 });
    stage.batchDraw();

    const dataUrl = stage.toDataURL({
      x: 0,
      y: 0,
      width,
      height,
      pixelRatio,
      mimeType: 'image/png',
    });
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.click();
  } finally {
    visibilitySnapshot.forEach(({ node, visible, listening }) => {
      node.visible(visible);
      node.listening(listening);
    });
    exportRoot.position({ x: transformSnapshot.x, y: transformSnapshot.y });
    exportRoot.scale({ x: transformSnapshot.scaleX, y: transformSnapshot.scaleY });
    stage.batchDraw();
  }
}
