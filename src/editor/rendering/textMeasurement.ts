import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';
import type { TextCanvasItem } from '../document/documentTypes';

function getTextContentWidth(item: TextCanvasItem, width: number): number {
  return Math.max(1, width - item.padding.left - item.padding.right);
}

export function measureWordWrappedTextHeight(
  item: TextCanvasItem,
  width: number
) {
  const safeWidth = getTextContentWidth(item, width);
  const verticalPadding = item.padding.top + item.padding.bottom;
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
    return Math.max(item.height, verticalPadding + estimatedLineCount * fallbackLineHeight);
  }

  context.font = getRenderableCanvasFontDeclaration(item);
  let lineCount = 0;

  const measureToken = (token: string): number =>
    context.measureText(token).width +
    Math.max(token.length - 1, 0) * item.letterSpacing;

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lineCount += 1;
      continue;
    }

    // Tokenize into runs of whitespace and runs of non-whitespace so consecutive
    // spaces are preserved (matches Pixi `whiteSpace: 'pre-wrap'` rendering).
    const tokens = paragraph.match(/\s+|\S+/g) ?? [];
    let currentLineWidth = 0;
    let currentLineHasContent = false;

    for (const token of tokens) {
      const isWhitespace = /^\s/.test(token);
      const tokenWidth = measureToken(token);

      if (isWhitespace) {
        currentLineWidth += tokenWidth;
        currentLineHasContent = true;
        continue;
      }

      if (currentLineHasContent && currentLineWidth + tokenWidth > safeWidth) {
        lineCount += 1;
        currentLineWidth = tokenWidth;
        currentLineHasContent = true;
        continue;
      }

      currentLineWidth += tokenWidth;
      currentLineHasContent = true;
    }

    if (currentLineHasContent) {
      lineCount += 1;
    }
  }

  return Math.max(1, Math.ceil(verticalPadding + lineCount * item.fontSize * item.lineHeight));
}
