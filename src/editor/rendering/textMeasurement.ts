import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';
import type { TextCanvasItem } from '../document/documentTypes';

export function measureWordWrappedTextHeight(
  item: TextCanvasItem,
  width: number
) {
  const safeWidth = Math.max(1, width);
  const fallbackLineHeight = Math.ceil(item.fontSize * item.lineHeight);
  const paragraphs = item.text.split('\n');
  const isJsdom =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  const context =
    typeof document !== 'undefined' && !isJsdom
      ? document.createElement('canvas').getContext('2d')
      : null;

  if (!context) {
    const estimatedCharsPerLine = Math.max(
      1,
      Math.floor(safeWidth / (item.fontSize * 0.6))
    );
    const estimatedLineCount = paragraphs.reduce((total, paragraph) => {
      const length = Math.max(paragraph.length, 1);
      return total + Math.max(1, Math.ceil(length / estimatedCharsPerLine));
    }, 0);
    return Math.max(item.height, estimatedLineCount * fallbackLineHeight);
  }

  context.font = getRenderableCanvasFontDeclaration(item);
  const spaceWidth = context.measureText(' ').width + item.letterSpacing;
  let lineCount = 0;

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lineCount += 1;
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);
    let currentLineWidth = 0;
    let currentLineHasContent = false;

    for (const word of words) {
      const nextWidth =
        context.measureText(word).width +
        Math.max(word.length - 1, 0) * item.letterSpacing;
      const candidateWidth = currentLineHasContent
        ? currentLineWidth + spaceWidth + nextWidth
        : nextWidth;

      if (currentLineHasContent && candidateWidth > safeWidth) {
        lineCount += 1;
        currentLineWidth = nextWidth;
        currentLineHasContent = true;
        continue;
      }

      currentLineWidth = candidateWidth;
      currentLineHasContent = true;
    }

    if (currentLineHasContent) {
      lineCount += 1;
    }
  }

  return Math.max(1, Math.ceil(lineCount * item.fontSize * item.lineHeight));
}
