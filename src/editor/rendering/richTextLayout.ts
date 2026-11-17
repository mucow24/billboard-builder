/**
 * Layout of rich text (see `document/richText`): which pieces of which runs go
 * on which line, and where along the line each piece starts.
 *
 * A piece of one run on one line is a fragment. The canvas draws each fragment
 * as a text of its own, placed by the numbers worked out here, so this layout
 * is what rich text looks like; there is no other renderer for it to agree
 * with. Text without tags is not laid out here.
 *
 * Words wrap as they do in plain text: at spaces, and after a hyphen or dash.
 * A word that changes style part-way ("un<b>believable</b>") stays in one piece.
 */
import type { RichTextRun } from '../document/richText';

export interface RichTextFragment {
  text: string;
  /** The run the fragment is a piece of; its style is the run's. */
  run: RichTextRun;
  /** Start of the fragment, from the start of its line. */
  x: number;
  /** Advance width of the fragment, letter spacing between its characters included. */
  width: number;
}

export interface RichTextLine {
  fragments: RichTextFragment[];
  /** From the start of the first fragment to the end of the last. */
  width: number;
}

/** Width of `text` set in the style of `run`, letter spacing left out. */
export type RichTextMeasure = (text: string, run: RichTextRun) => number;

/** Characters a line may break after (as in plain text; see `textMeasurement`). */
const BREAK_AFTER_CHARS = new Set([0x002d, 0x2010, 0x2013, 0x2014, 0x00ad]);

/** The spaces taken off the end of a line (as in plain text; see `io/svg/svgText`). */
const BREAKING_SPACES = new Set([
  0x0009, 0x0020, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2008, 0x2009, 0x200a,
  0x205f, 0x3000,
]);

interface Token {
  text: string;
  run: RichTextRun;
  isSpace: boolean;
  /** Part of the same word as the token before it: no line break between the two. */
  joined: boolean;
}

function splitAfterHyphens(word: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let index = 0; index < word.length - 1; index += 1) {
    if (BREAK_AFTER_CHARS.has(word.charCodeAt(index))) {
      pieces.push(word.slice(start, index + 1));
      start = index + 1;
    }
  }
  pieces.push(word.slice(start));
  return pieces;
}

function tokenize(pieces: { text: string; run: RichTextRun }[]): Token[] {
  const tokens: Token[] = [];
  for (const piece of pieces) {
    let firstOfPiece = true;
    for (const chunk of piece.text.match(/\s+|\S+/g) ?? []) {
      const isSpace = /^\s/.test(chunk);
      for (const text of isSpace ? [chunk] : splitAfterHyphens(chunk)) {
        const previous = tokens[tokens.length - 1];
        // Only a change of style can leave two tokens in one word; within a
        // run they are apart because of a space or a hyphen.
        const joined =
          firstOfPiece &&
          !isSpace &&
          previous !== undefined &&
          !previous.isSpace &&
          !BREAK_AFTER_CHARS.has(previous.text.charCodeAt(previous.text.length - 1));
        tokens.push({ text, run: piece.run, isSpace, joined });
        firstOfPiece = false;
      }
    }
  }
  return tokens;
}

function withoutTrailingSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && BREAKING_SPACES.has(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

/** The runs cut at line breaks: one list of pieces per paragraph. */
function splitParagraphs(runs: RichTextRun[]): { text: string; run: RichTextRun }[][] {
  const paragraphs: { text: string; run: RichTextRun }[][] = [[]];
  for (const run of runs) {
    run.text.split('\n').forEach((text, index) => {
      if (index > 0) paragraphs.push([]);
      if (text.length > 0) paragraphs[paragraphs.length - 1].push({ text, run });
    });
  }
  return paragraphs;
}

export function layoutRichText(
  runs: RichTextRun[],
  contentWidth: number,
  letterSpacing: number,
  measure: RichTextMeasure,
): RichTextLine[] {
  // A token's advance: its width, with letter spacing after every character.
  // A line of tokens is then as wide as their advances less one letter spacing.
  const advanceOf = (token: Token): number =>
    measure(token.text, token.run) + token.text.length * letterSpacing;

  const toLine = (tokens: Token[]): RichTextLine => {
    // Neighbouring tokens of one run become one fragment, measured as a whole,
    // so letters kern inside it as they do when it is drawn.
    const merged: { text: string; run: RichTextRun }[] = [];
    for (const token of tokens) {
      const last = merged[merged.length - 1];
      if (last && last.run === token.run) last.text += token.text;
      else merged.push({ text: token.text, run: token.run });
    }
    // The spaces a line ends in are not part of it.
    while (merged.length > 0) {
      const last = merged[merged.length - 1];
      last.text = withoutTrailingSpaces(last.text);
      if (last.text.length > 0) break;
      merged.pop();
    }

    const fragments: RichTextFragment[] = [];
    let x = 0;
    for (const { text, run } of merged) {
      const width = measure(text, run) + Math.max(text.length - 1, 0) * letterSpacing;
      fragments.push({ text, run, x, width });
      x += width + letterSpacing;
    }
    return { fragments, width: fragments.length > 0 ? x - letterSpacing : 0 };
  };

  const lines: RichTextLine[] = [];
  for (const pieces of splitParagraphs(runs)) {
    const tokens = tokenize(pieces);
    let current: Token[] = [];
    let currentAdvance = 0;

    for (let index = 0; index < tokens.length; ) {
      // A word and the tokens joined to it.
      let end = index + 1;
      while (end < tokens.length && tokens[end].joined) end += 1;
      const word = tokens.slice(index, end);
      const wordAdvance = word.reduce((total, token) => total + advanceOf(token), 0);

      const overflows = currentAdvance + wordAdvance - letterSpacing > contentWidth;
      if (!word[0].isSpace && current.length > 0 && overflows) {
        lines.push(toLine(current));
        current = [];
        currentAdvance = 0;
      }
      current.push(...word);
      currentAdvance += wordAdvance;
      index = end;
    }
    lines.push(toLine(current));
  }
  return lines;
}
