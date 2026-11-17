/**
 * Where a line of text breaks and what a line ends in, as Pixi has it. Plain
 * text (`textMeasurement`), rich text (`richTextLayout`) and the SVG export
 * (`io/svg/svgText`) all go by these, so that each wraps and trims lines as the
 * canvas does, and tagging a text does not re-wrap it.
 */
import type { TextCanvasItem } from '../document/documentTypes';

/**
 * The spaces Pixi breaks lines at, by character code (`BREAKING_SPACES` in
 * pixi.js `scene/text/canvas/utils/textTokenization`); it also takes them off
 * the end of every line. No-break spaces (U+00A0, U+2007, U+202F) are not among
 * them: Pixi keeps the words on either side together, and leaves the space on
 * the line, where it keeps its width.
 */
export const BREAKING_SPACES: ReadonlySet<number> = new Set([
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
const NEWLINES: ReadonlySet<number> = new Set([
  0x000a, // line feed
  0x000d, // carriage return
]);
const CARRIAGE_RETURN = String.fromCharCode(0x000d);
const LINE_FEED = String.fromCharCode(0x000a);

/**
 * The characters Pixi may break a line after, by character code
 * (`BREAK_AFTER_CHARS` in pixi.js `scene/text/canvas/utils/textTokenization`).
 */
const BREAK_AFTER_CHARS: ReadonlySet<number> = new Set([
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
 * line can end at the hyphen. The tokens, joined, are the text.
 */
export function tokenizeLikePixi(text: string): string[] {
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

/** What a token from `tokenizeLikePixi` is to the line breaker. */
export type PixiTokenKind = 'newline' | 'space' | 'word';

export function pixiTokenKind(token: string): PixiTokenKind {
  if (isNewline(token)) return 'newline';
  if (isBreakingSpace(token)) return 'space';
  return 'word';
}

/** The two widths of a text, letter spacing left out, that Pixi wraps it by. */
export interface TextWidths {
  /** How far the text advances the pen: canvas `measureText(text).width`. */
  advance: number;
  /** How wide its ink is: `inkWidthOf(measureText(text))` (`textMeasurement`). */
  ink: number;
}

/**
 * How much of a line Pixi's `wordWrap` takes a token of `graphemeCount`
 * graphemes to fill, given its widths. As in `CanvasTextMetrics._measureText`
 * it is the larger of the advance and the ink width, so a word whose last letter
 * leans past its advance takes up its ink, plus the letter spacing between its
 * graphemes, which is added only to a token that advances at all; `wordWrap`
 * adds one more letter spacing, after the last grapheme.
 */
export function pixiTokenWidth(widths: TextWidths, graphemeCount: number, letterSpacing: number): number {
  const between = widths.advance > 0 ? (graphemeCount - 1) * letterSpacing : 0;
  return Math.max(widths.advance, widths.ink) + between + letterSpacing;
}

/** What `breakLinesLikePixi` returns. */
export interface PixiWrap<T = string> {
  /** The lines Pixi draws, each a list of tokens. */
  lines: T[][];
  /**
   * The tokens of the last paragraph when the text has a line break before it,
   * the paragraph has nothing on it but spaces, and Pixi therefore drew no line
   * for it (it drops such a last line); otherwise null.
   */
  blankLastParagraph: T[] | null;
}

/**
 * Break a text, cut into Pixi's tokens (`tokenizeLikePixi`), into the lines the
 * canvas draws, each a list of tokens. This is a port of Pixi's `wordWrap`
 * (pixi.js `scene/text/canvas/utils/wordWrap`) for the style `PixiItemLayer`
 * draws text with: `whiteSpace: 'pre'` and no `breakWords`. The comparison test
 * in `textMeasurement.test.ts` runs it, through `wrapLikePixi`, and Pixi's own
 * `wordWrap` on the same texts and expects the same lines; keep them in step on
 * a Pixi upgrade or a change of that style.
 *
 * The tokens may be anything that `kindOf` can tell apart; `widthOf` gives how
 * much of a line a token takes up, letter spacing included (`pixiTokenWidth`).
 * A line may run to `contentWidth` plus one letter spacing, so it fits when it
 * fits as drawn, spacing between all its graphemes included.
 *
 * A line keeps the spaces it ends with (Pixi takes them off before it measures
 * and draws it, and so must callers), except one that would have run past the
 * box: Pixi drops those, as it drops the spaces a wrapped line would start with.
 */
export function breakLinesLikePixi<T>(
  tokens: Iterable<T>,
  contentWidth: number,
  letterSpacing: number,
  kindOf: (token: T) => PixiTokenKind,
  widthOf: (token: T) => number,
): PixiWrap<T> {
  const wrapWidth = contentWidth + letterSpacing;
  const lines: T[][] = [];
  let line: T[] = [];
  let width = 0;
  // Under `whiteSpace: 'pre'` a paragraph keeps the spaces it starts with; a
  // line that wrapping starts does not.
  let canPrependSpaces = true;
  // For `blankLastParagraph`: whether a line break came before the paragraph
  // being laid out, and whether wrapping has ended a line inside it.
  let afterLineBreak = false;
  let paragraphHasLine = false;
  const endLine = () => {
    lines.push(line);
    line = [];
    width = 0;
  };

  for (const token of tokens) {
    const kind = kindOf(token);
    if (kind === 'newline') {
      endLine();
      canPrependSpaces = true;
      afterLineBreak = true;
      paragraphHasLine = false;
      continue;
    }

    const tokenWidth = widthOf(token);
    if (tokenWidth > wrapWidth) {
      // Wider than the box: a line of its own, as Pixi breaks no word here. Even
      // a line break right after it then starts an empty line.
      if (line.length > 0) endLine();
      lines.push([token]);
      canPrependSpaces = false;
      paragraphHasLine = true;
      continue;
    }

    if (tokenWidth + width > wrapWidth) {
      canPrependSpaces = false;
      endLine();
      paragraphHasLine = true;
    }
    if (line.length > 0 || kind !== 'space' || canPrependSpaces) {
      line.push(token);
      width += tokenWidth;
    }
  }

  // Pixi keeps the last line only if there is more on it than spaces, so text
  // that ends in a line break has no empty line after it; and text with nothing
  // to draw is one empty line.
  const blankLastLine = line.every((token) => kindOf(token) === 'space');
  if (!blankLastLine) lines.push(line);
  return {
    lines: lines.length > 0 ? lines : [[]],
    blankLastParagraph: blankLastLine && afterLineBreak && !paragraphHasLine ? line : null,
  };
}

/**
 * The lines the app lays a text out in: the lines the canvas draws
 * (`breakLinesLikePixi`), and one difference on purpose. A line break at the end
 * of the text, followed by nothing but spaces, still starts a line, a blank one
 * that Pixi does not draw. The measured height counts it, so middle- and
 * bottom-aligned text that ends in a line break sits that blank line higher, as
 * it always has, and the box keeps room for it. Plain text (`layoutWrappedText`)
 * and tagged text (`layoutRichText`) both take their lines from here.
 */
export function withBlankLastParagraph<T>({ lines, blankLastParagraph }: PixiWrap<T>): T[][] {
  return blankLastParagraph ? [...lines, blankLastParagraph] : lines;
}

export function withoutTrailingSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && BREAKING_SPACES.has(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

/**
 * Top of the first line box of a text item's lines, from the top of the item's
 * box: below the padding, and further down where the item's vertical alignment
 * puts lines `textHeight` tall in a box `boxHeight` tall. Lines taller than the
 * box start at the top whatever the alignment.
 */
export function textBlockTop(
  item: Pick<TextCanvasItem, 'padding' | 'verticalAlign'>,
  boxHeight: number,
  textHeight: number,
): number {
  const spare = boxHeight - item.padding.top - item.padding.bottom - textHeight;
  if (item.verticalAlign === 'middle') return item.padding.top + Math.max(0, spare / 2);
  if (item.verticalAlign === 'bottom') return item.padding.top + Math.max(0, spare);
  return item.padding.top;
}

/**
 * Left end of a line `lineWidth` wide, from the left of the item's box: after
 * the padding, and further right where the item's alignment puts it in
 * `alignWidth`. Pixi aligns lines inside the box, or inside the widest line when
 * one does not fit the box (`alignWidth` in
 * `CanvasTextGenerator._renderTextToCanvas`), so `alignWidth` is the larger of
 * the content width and the widest line.
 */
export function alignedLineLeft(
  item: Pick<TextCanvasItem, 'padding' | 'align'>,
  alignWidth: number,
  lineWidth: number,
): number {
  if (item.align === 'center') return item.padding.left + (alignWidth - lineWidth) / 2;
  if (item.align === 'right') return item.padding.left + alignWidth - lineWidth;
  return item.padding.left;
}
