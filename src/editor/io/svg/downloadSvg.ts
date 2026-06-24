/** Trigger a browser download of an SVG string as a `.svg` file (mirrors downloadCanvasAsPng). */
export function downloadSvg(svg: string, fileName = 'billboard-export.svg') {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
