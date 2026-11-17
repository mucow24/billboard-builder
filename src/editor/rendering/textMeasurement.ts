import { drawnText } from '../fonts/emojiFallback';
import { graphemes } from './graphemes';
import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';
import type { TextCanvasItem } from '../document/documentTypes';

function getTextContentWidth(item: TextCanvasItem, width: number): number {
  return Math.max(1, width - item.padding.left - item.padding.right);
}

/**
 * The paragraphs of an item's text, as it is drawn (`drawnText`), split where
 * Pixi starts a new line (`tokenize` and `NEWLINE_SPLIT_REGEX` in pixi.js
 * `scene/text/canvas/utils/textTokenization`): at a line feed, at a carriage
 * return, and at a carriage return followed by a line feed, which is one break.
 */
function paragraphsOf(text: string): string[] {
  return drawnText(text).split(/\r\n|\r|\n/);
}

/**
 * The spaces Pixi breaks lines at, by character code (`BREAKING_SPACES` in
 * pixi.js `scene/text/canvas/utils/textTokenization`); it also takes them off
 * the end of every line. No-break spaces (U+00A0, U+2007, U+202F) are not among
 * them: Pixi keeps the words on either side together, and leaves the space on
 * the line, where it keeps its width.
 */
export const BREAKING_SPACES = new Set([
  0x0009, // tab
  0x0020, // space
  0x2000, // en quad
  0x2001, // em quad
  0x2002, // en space
  0x2003, // em space
  0x2004, // three-per-em space
  0x2005, // four-per-em space
  0x2006, // six-per-em space
  0x2008, // punctuation space
  0x2009, // thin space
  0x200a, // hair space
  0x205f, // medium mathematical space
  0x3000, // ideographic space
]);

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
 * Split a paragraph into the tokens Pixi wraps (`tokenize` in pixi.js
 * `scene/text/canvas/utils/textTokenization`): each breaking space on its own,
 * and the text between them, which is also split after each hyphen or dash that
 * has more of the word behind it. "Double-click" is "Double-" and "click", so a
 * line can end at the hyphen.
 */
function tokenize(paragraph: string): string[] {
  const tokens: string[] = [];
  let word = '';
  for (let index = 0; index < paragraph.length; index += 1) {
    const code = paragraph.charCodeAt(index);
    if (BREAKING_SPACES.has(code)) {
      if (word.length > 0) tokens.push(word);
      word = '';
      tokens.push(paragraph[index]);
      continue;
    }
    word += paragraph[index];
    const hasMoreWord = index + 1 < paragraph.length && !BREAKING_SPACES.has(paragraph.charCodeAt(index + 1));
    if (BREAK_AFTER_CHARS.has(code) && hasMoreWord) {
      tokens.push(word);
      word = '';
    }
  }
  if (word.length > 0) tokens.push(word);
  return tokens;
}

/**
 * Width of the ink of a measured text, the way Pixi's
 * `CanvasTextMetrics._measureText` works it out: how far the ink reaches left of
 * the pen (`actualBoundingBoxLeft`, negative when the ink starts right of the
 * pen) plus how far it reaches right of it. A bound the browser does not report
 * counts as 0. Pure so it can be unit-tested without a canvas.
 */
export function inkWidthOf(
  metrics: Pick<TextMetrics, 'actualBoundingBoxLeft' | 'actualBoundingBoxRight'>,
): number {
  const left = Number.isFinite(metrics.actualBoundingBoxLeft) ? metrics.actualBoundingBoxLeft : 0;
  const right = Number.isFinite(metrics.actualBoundingBoxRight) ? metrics.actualBoundingBoxRight : 0;
  return left + right;
}

/**
 * Word-wrap `item.text`, as it is drawn (`drawnText`), into lines (each a list
 * of tokens) using the same tokenization and wrap rule Pixi renders with.
 *
 * `measure` returns how wide Pixi takes a token to be, letter spacing left out:
 * the larger of its advance width and its ink width (`inkWidthOf`), as
 * `CanvasTextMetrics._measureText` measures it. A word whose last letter leans
 * past its advance, as italics do, takes up its ink width. This function adds
 * the letter spacing, so callers (height measurement here, glyph positioning in
 * the SVG exporter) stay in lockstep with Pixi's wrap boundaries.
 */
export function layoutWrappedText(
  item: TextCanvasItem,
  contentWidth: number,
  measure: (text: string) => number,
): string[][] {
  // Pixi (`wordWrap` in pixi.js `scene/text/canvas/utils`) counts a token's
  // letter spacing once per grapheme (see `graphemes`), after its last one too,
  // and lets a line run to the wrap width plus one letter spacing. A line then
  // fits when its width with spacing between all its graphemes does, across the
  // tokens as well as inside them.
  const measureToken = (token: string): number =>
    measure(token) + graphemes(token).length * item.letterSpacing;
  const maxLineWidth = contentWidth + item.letterSpacing;

  const lines: string[][] = [];
  for (const paragraph of paragraphsOf(item.text)) {
    if (paragraph.length === 0) {
      lines.push([]);
      continue;
    }

    let current: string[] = [];
    let currentWidth = 0;
    let hasContent = false;

    for (const token of tokenize(paragraph)) {
      const tokenWidth = measureToken(token);
      const isSpace = BREAKING_SPACES.has(token.charCodeAt(0));

      if (!isSpace && hasContent && currentWidth + tokenWidth > maxLineWidth) {
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

  // Pixi keeps the last line only when there is more on it than breaking spaces
  // (`wordWrap` pushes it only if `trimRight(line)` is not empty), so a text that
  // ends in a line break has no empty line after it. Counting one moved middle-
  // and bottom-aligned text up by half a line and a line. A text with nothing
  // else still has its one line.
  const last = lines[lines.length - 1];
  if (lines.length > 1 && last.every((token) => BREAKING_SPACES.has(token.charCodeAt(0)))) {
    lines.pop();
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
  const paragraphs = paragraphsOf(item.text);
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
  const lineCount = layoutWrappedText(item, safeWidth, (text) => {
    const metrics = measuringContext.measureText(text);
    return Math.max(metrics.width, inkWidthOf(metrics));
  }).length;

  return Math.max(1, Math.ceil(verticalPadding + lineCount * item.fontSize * item.lineHeight));
}
