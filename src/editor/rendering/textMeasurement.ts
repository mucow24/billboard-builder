import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';
import type { TextCanvasItem } from '../document/documentTypes';

function getTextContentWidth(item: TextCanvasItem, width: number): number {
  return Math.max(1, width - item.padding.left - item.padding.right);
}

/**
 * Word-wrap `item.text` into lines (each a list of tokens) using the same
 * tokenization and wrap rule Pixi renders with. `measure` returns a token's width
 * EXCLUDING letterSpacing; this function adds letterSpacing internally so callers
 * (height measurement here, glyph positioning in the SVG exporter) stay in lockstep
 * with Pixi's wrap boundaries.
 */
export function layoutWrappedText(
  item: TextCanvasItem,
  contentWidth: number,
  measure: (text: string) => number,
): string[][] {
  const measureToken = (token: string): number =>
    measure(token) + Math.max(token.length - 1, 0) * item.letterSpacing;

  const lines: string[][] = [];
  for (const paragraph of item.text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push([]);
      continue;
    }

    // Runs of whitespace and runs of non-whitespace, so consecutive spaces are
    // preserved (matches Pixi `whiteSpace: 'pre-wrap'`).
    const tokens = paragraph.match(/\s+|\S+/g) ?? [];
    let current: string[] = [];
    let currentWidth = 0;
    let hasContent = false;

    for (const token of tokens) {
      const tokenWidth = measureToken(token);
      const isWhitespace = /^\s/.test(token);

      if (!isWhitespace && hasContent && currentWidth + tokenWidth > contentWidth) {
        lines.push(current);
        current = [token];
        currentWidth = tokenWidth;
        hasContent = true;
        continue;
      }

      current.push(token);
      currentWidth += tokenWidth;
      hasContent = true;
    }

    if (hasContent) lines.push(current);
  }

  return lines;
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
  const measuringContext = context;
  const lineCount = layoutWrappedText(
    item,
    safeWidth,
    (text) => measuringContext.measureText(text).width,
  ).length;

  return Math.max(1, Math.ceil(verticalPadding + lineCount * item.fontSize * item.lineHeight));
}
