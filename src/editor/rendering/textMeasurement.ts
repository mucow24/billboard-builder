import { drawnText } from '../fonts/emojiFallback';
import { graphemes } from './graphemes';
import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';
import type { TextCanvasItem } from '../document/documentTypes';

function getTextContentWidth(item: TextCanvasItem, width: number): number {
  return Math.max(1, width - item.padding.left - item.padding.right);
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
 * The characters Pixi starts a new line at, by character code (`NEWLINES` in
 * pixi.js `scene/text/canvas/utils/textTokenization`). A carriage return
 * followed by a line feed is one line break.
 */
const NEWLINES = new Set([
  0x000a, // line feed
  0x000d, // carriage return
]);
const CARRIAGE_RETURN = String.fromCharCode(0x000d);
const LINE_FEED = String.fromCharCode(0x000a);

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

/** Whether `text` starts with a breaking space; a space token is one. */
function isBreakingSpace(text: string | undefined): boolean {
  return text !== undefined && BREAKING_SPACES.has(text.charCodeAt(0));
}

/** Whether `text` starts with a line break; a line-break token is one. */
function isNewline(text: string | undefined): boolean {
  return text !== undefined && NEWLINES.has(text.charCodeAt(0));
}

/**
 * Split a text into the tokens Pixi wraps (`tokenize` in pixi.js
 * `scene/text/canvas/utils/textTokenization`): each breaking space and each
 * line break on its own, a carriage return followed by a line feed being one,
 * and the text between them, which is also split after each hyphen or dash that
 * has more of the word behind it. "Double-click" is "Double-" and "click", so a
 * line can end at the hyphen.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let word = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (isBreakingSpace(char) || isNewline(char)) {
      if (word.length > 0) tokens.push(word);
      word = '';
      if (char === CARRIAGE_RETURN && next === LINE_FEED) {
        tokens.push(char + next);
        index += 1;
      } else {
        tokens.push(char);
      }
      continue;
    }
    word += char;
    if (BREAK_AFTER_CHARS.has(char.charCodeAt(0)) && next !== undefined && !isBreakingSpace(next) && !isNewline(next)) {
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

/** The two widths of a text, letter spacing left out, that Pixi wraps it by. */
export interface TextWidths {
  /** How far the text advances the pen: canvas `measureText(text).width`. */
  advance: number;
  /** How wide its ink is: `inkWidthOf(measureText(text))`. */
  ink: number;
}

/**
 * Break `item.text`, as it is drawn (`drawnText`), into the lines the canvas
 * draws, each a list of tokens. This is a port of Pixi's `wordWrap` (pixi.js
 * `scene/text/canvas/utils/wordWrap`) for the style `PixiItemLayer` draws text
 * with: `whiteSpace: 'pre'` and no `breakWords`. The comparison test in
 * `textMeasurement.test.ts` runs both on the same texts and expects the same
 * lines; keep them in step on a Pixi upgrade or a change of that style.
 *
 * `measure` gives the advance and the ink width of a token, letter spacing left
 * out. As in `CanvasTextMetrics._measureText`, a token takes up the larger of
 * the two, so a word whose last letter leans past its advance takes up its ink,
 * plus one letter spacing per grapheme, after its last one too; and a line may
 * run to the wrap width plus one letter spacing. A line therefore fits when it
 * fits as drawn, spacing between all its graphemes included.
 *
 * A line keeps the spaces it ends with (Pixi takes them off before it measures
 * and draws it, and so must callers), except one that would have run past the
 * box: Pixi drops those, as it drops the spaces a wrapped line would start with.
 */
export function layoutWrappedText(
  item: TextCanvasItem,
  contentWidth: number,
  measure: (text: string) => TextWidths,
): string[][] {
  const { letterSpacing } = item;
  const tokenWidths = new Map<string, number>();
  const widthOf = (token: string): number => {
    let width = tokenWidths.get(token);
    if (width === undefined) {
      const { advance, ink } = measure(token);
      // `CanvasTextMetrics._measureText` adds the spacing between graphemes only
      // to a text that advances at all; `wordWrap` adds the one after the last.
      const between = advance > 0 ? (graphemes(token).length - 1) * letterSpacing : 0;
      width = Math.max(advance + between, ink + between) + letterSpacing;
      tokenWidths.set(token, width);
    }
    return width;
  };
  const wrapWidth = contentWidth + letterSpacing;

  const lines: string[][] = [];
  let line: string[] = [];
  let width = 0;
  // Under `whiteSpace: 'pre'` a paragraph keeps the spaces it starts with; a
  // line that wrapping starts does not.
  let canPrependSpaces = true;
  const endLine = () => {
    lines.push(line);
    line = [];
    width = 0;
  };

  for (const token of tokenize(drawnText(item.text))) {
    if (isNewline(token)) {
      endLine();
      canPrependSpaces = true;
      continue;
    }

    const tokenWidth = widthOf(token);
    if (tokenWidth > wrapWidth) {
      // Wider than the box: a line of its own, as Pixi breaks no word here. Even
      // a line break right after it then starts an empty line.
      if (line.length > 0) endLine();
      lines.push([token]);
      canPrependSpaces = false;
      continue;
    }

    if (tokenWidth + width > wrapWidth) {
      canPrependSpaces = false;
      endLine();
    }
    if (line.length > 0 || !isBreakingSpace(token) || canPrependSpaces) {
      line.push(token);
      width += tokenWidth;
    }
  }

  // Pixi keeps the last line only if there is more on it than spaces, so text
  // that ends in a line break has no empty line after it; and text with nothing
  // to draw is one empty line.
  if (!line.every(isBreakingSpace)) lines.push(line);
  return lines.length > 0 ? lines : [[]];
}

export function measureWordWrappedTextHeight(
  item: TextCanvasItem,
  width: number
) {
  const safeWidth = getTextContentWidth(item, width);
  const verticalPadding = item.padding.top + item.padding.bottom;
  const fallbackLineHeight = Math.ceil(item.fontSize * item.lineHeight);
  const isJsdom =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  const context =
    typeof document !== 'undefined' && !isJsdom
      ? document.createElement('canvas').getContext('2d')
      : null;

  if (!context) {
    // A rough estimate where there is no canvas to measure with: its paragraphs
    // split where the canvas starts a new line, with no line after a line break
    // that ends the text (see `layoutWrappedText`).
    const paragraphs = drawnText(item.text).split(/\r\n|\r|\n/);
    if (paragraphs.length > 1 && [...paragraphs[paragraphs.length - 1]].every(isBreakingSpace)) {
      paragraphs.pop();
    }
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
    return { advance: metrics.width, ink: inkWidthOf(metrics) };
  }).length;

  return Math.max(1, Math.ceil(verticalPadding + lineCount * item.fontSize * item.lineHeight));
}
