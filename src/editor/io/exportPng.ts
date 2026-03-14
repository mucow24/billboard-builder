import type Konva from 'konva';

export function downloadStageAsPng(
  stage: Konva.Stage,
  pixelRatio: number,
  fileName = 'billboard-export.png'
) {
  const dataUrl = stage.toDataURL({
    pixelRatio,
    mimeType: 'image/png',
  });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
}
