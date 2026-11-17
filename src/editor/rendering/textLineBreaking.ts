/**
 * Where a line of text may break and what a line ends in, as Pixi has it. Plain
 * text (`textMeasurement`), rich text (`richTextLayout`) and the SVG export
 * (`io/svg/svgText`) all go by these, so that each wraps and trims lines as the
 * canvas does.
 */
import type { TextCanvasItem } from '../document/documentTypes';

/**
 * The characters Pixi may break a line after, by character code
 * (`BREAK_AFTER_CHARS` in pixi.js `scene/text/canvas/utils/textTokenization`).
 */
export const BREAK_AFTER_CHARS: ReadonlySet<number> = new Set([
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
export function splitAfterHyphens(token: string): string[] {
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
 * The spaces Pixi takes off the end of a line, by character code: the characters
 * it breaks lines at (`BREAKING_SPACES` in pixi.js
 * `scene/text/canvas/utils/textTokenization`). No-break spaces (U+00A0, U+2007,
 * U+202F) are not among them, so they stay on the line and keep their width.
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
