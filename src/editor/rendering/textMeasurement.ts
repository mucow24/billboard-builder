import { drawnText } from '../fonts/emojiFallback';
import { graphemes } from './graphemes';
import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';
import type { TextCanvasItem } from '../document/documentTypes';
import { parseRichText } from '../document/richText';
import type { RichTextRun } from '../document/richText';
import { layoutRichText } from './richTextLayout';
import type { RichTextLine } from './richTextLayout';

function getTextContentWidth(item: TextCanvasItem, width: number): number {
  return Math.max(1, width - item.padding.left - item.padding.right);
}

/**
 * The characters Pixi may break a line after, by character code
 * (`BREAK_AFTER_CHARS` in pixi.js `scene/text/canvas/utils/textTokenization`).
 */
const BREAK_AFTER_CHARS = new Set([
  0x002d, // hyphen-minus
  0x2010, // hyphen
  0x2013, // en dash
  0x2014, // em dash
  0x00ad, // soft hyphen
]);

/**
 * Split a word into the pieces Pixi wraps separately: after each hyphen or dash
 * that has more of the word behind it. "Double-click" is "Double-" and "click",
 * so a line can end at the hyphen.
 */
function splitAfterHyphens(token: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let index = 0; index < token.length - 1; index += 1) {
    if (BREAK_AFTER_CHARS.has(token.charCodeAt(index))) {
      pieces.push(token.slice(start, index + 1));
      start = index + 1;
    }
  }
  pieces.push(token.slice(start));
  return pieces;
}

/**
 * Word-wrap `item.text`, as it is drawn (`drawnText`), into lines (each a list of tokens) using the same
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
  // Pixi adds letter spacing once per grapheme (see `graphemes`).
  const measureToken = (token: string): number =>
    measure(token) + Math.max(graphemes(token).length - 1, 0) * item.letterSpacing;

  const lines: string[][] = [];
  for (const paragraph of drawnText(item.text).split('\n')) {
    if (paragraph.length === 0) {
      lines.push([]);
      continue;
    }

    // Runs of whitespace and runs of non-whitespace, so consecutive spaces are
    // preserved (matches Pixi `whiteSpace: 'pre-wrap'`).
    const tokens = (paragraph.match(/\s+|\S+/g) ?? []).flatMap(splitAfterHyphens);
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

/** `item` in the style of one of its rich text runs: bold and italic where a tag asks for them. */
export function richTextRunItem(item: TextCanvasItem, run: RichTextRun): TextCanvasItem {
  if (!run.bold && !run.italic) return item;
  return {
    ...item,
    fontWeight: run.bold ? 'bold' : item.fontWeight,
    fontStyle: run.italic ? 'italic' : item.fontStyle,
  };
}

/**
 * Rich text runs with their text as the canvas is given it (`drawnText`), as
 * plain text is: everything that lays out, measures or draws the runs takes
 * them from here. A run left with no text is dropped.
 */
export function drawnRichTextRuns(runs: RichTextRun[]): RichTextRun[] {
  return runs
    .map((run) => {
      const text = drawnText(run.text);
      return text === run.text ? run : { ...run, text };
    })
    .filter((run) => run.text.length > 0);
}

/**
 * Lay out the rich text `runs` of `item`, as they are drawn (`drawnRichTextRuns`),
 * in a box `contentWidth` wide, measuring with `context`: the 2D canvas the text
 * is rasterised with.
 */
export function layoutRichTextRuns(
  item: TextCanvasItem,
  runs: RichTextRun[],
  contentWidth: number,
  context: CanvasRenderingContext2D,
): RichTextLine[] {
  const fonts = new Map<RichTextRun, string>();
  return layoutRichText(drawnRichTextRuns(runs), contentWidth, item.letterSpacing, (text, run) => {
    let font = fonts.get(run);
    if (font === undefined) {
      font = getRenderableCanvasFontDeclaration(richTextRunItem(item, run));
      fonts.set(run, font);
    }
    context.font = font;
    return context.measureText(text).width;
  });
}

export function measureWordWrappedTextHeight(
  item: TextCanvasItem,
  width: number
) {
  const safeWidth = getTextContentWidth(item, width);
  const verticalPadding = item.padding.top + item.padding.bottom;
  const fallbackLineHeight = Math.ceil(item.fontSize * item.lineHeight);
  const rich = parseRichText(item.text);
  const paragraphs = drawnText(rich.plain).split('\n');
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
  const lineCount = rich.hasMarkup
    ? layoutRichTextRuns(item, rich.runs, safeWidth, measuringContext).length
    : layoutWrappedText(item, safeWidth, (text) => measuringContext.measureText(text).width).length;

  return Math.max(1, Math.ceil(verticalPadding + lineCount * item.fontSize * item.lineHeight));
}
