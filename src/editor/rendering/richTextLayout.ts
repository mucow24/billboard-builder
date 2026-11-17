/**
 * Layout of rich text (see `document/richText`): which pieces of which runs go
 * on which line, and where along the line each piece starts.
 *
 * A piece of one run on one line is a fragment. The canvas, auto-height and the
 * SVG export all place fragments by the numbers worked out here. Text without
 * tags is not laid out here: Pixi wraps it.
 *
 * Lines break where they would if the text had no tags, so that tagging a text
 * does not re-wrap it: the text of all the runs together is cut into Pixi's
 * tokens (`tokenizeLikePixi`) and broken into lines by the same port of Pixi's
 * `wordWrap` that breaks plain text (`breakLinesLikePixi`), with the same blank
 * line after a line break that ends the text (`withBlankLastParagraph`). A token
 * that spans runs, such as a word that changes style part-way
 * ("un<b>believable</b>"), stays in one piece, as the word would.
 */
import type { RichTextRun } from '../document/richText';
import { graphemes } from './graphemes';
import {
  breakLinesLikePixi,
  pixiTokenKind,
  pixiTokenWidth,
  tokenizeLikePixi,
  withBlankLastParagraph,
  withoutTrailingSpaces,
} from './textLineBreaking';
import type { TextWidths } from './textLineBreaking';

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

/** Both widths of `text` set in the style of `run`, letter spacing left out. */
export type RichTextMeasure = (text: string, run: RichTextRun) => TextWidths;

/** Some of the text of one run. */
interface Piece {
  text: string;
  run: RichTextRun;
}

/** One of Pixi's tokens, cut where the runs it spans meet. */
interface Token {
  text: string;
  pieces: Piece[];
}

/**
 * The text of `runs`, cut into the tokens Pixi would cut it into if it had no
 * tags: the tokens of the whole text, each split into the pieces of the runs it
 * spans.
 */
function tokenizeRuns(runs: RichTextRun[]): Token[] {
  const tokens: Token[] = [];
  let runIndex = 0;
  let offsetInRun = 0;
  for (const text of tokenizeLikePixi(runs.map((run) => run.text).join(''))) {
    const pieces: Piece[] = [];
    let rest = text.length;
    while (rest > 0) {
      const run = runs[runIndex];
      const take = Math.min(rest, run.text.length - offsetInRun);
      if (take > 0) pieces.push({ text: run.text.slice(offsetInRun, offsetInRun + take), run });
      rest -= take;
      offsetInRun += take;
      if (offsetInRun === run.text.length) {
        runIndex += 1;
        offsetInRun = 0;
      }
    }
    tokens.push({ text, pieces });
  }
  return tokens;
}

/**
 * Whether two runs are set in the same font. Only bold and italic pick a run's
 * font (`richTextRunItem` in `textMeasurement`); colours and gradients do not.
 */
function sameFont(a: RichTextRun, b: RichTextRun): boolean {
  return a.bold === b.bold && a.italic === b.italic;
}

/** Neighbouring pieces of one run, or of runs in one font, joined. */
function joinPieces(pieces: Piece[], belongTogether: (a: RichTextRun, b: RichTextRun) => boolean): Piece[] {
  const joined: Piece[] = [];
  for (const piece of pieces) {
    const last = joined[joined.length - 1];
    if (last && belongTogether(last.run, piece.run)) last.text += piece.text;
    else joined.push({ ...piece });
  }
  return joined;
}

export function layoutRichText(
  runs: RichTextRun[],
  contentWidth: number,
  letterSpacing: number,
  measure: RichTextMeasure,
): RichTextLine[] {
  // How much of a line a token takes up. A token in one font is measured as a
  // whole, exactly as Pixi measures it in text without tags, so tags that change
  // only the colour move no line break. One that changes font part-way is drawn
  // as several texts: each but the last takes up its advance, letter spacing
  // after each grapheme included, and the last what Pixi gives a token.
  const widthOf = (token: Token): number => {
    const parts = joinPieces(token.pieces, sameFont);
    return parts.reduce((total, { text, run }, index) => {
      const widths = measure(text, run);
      const count = graphemes(text).length;
      return (
        total +
        (index === parts.length - 1
          ? pixiTokenWidth(widths, count, letterSpacing)
          : widths.advance + count * letterSpacing)
      );
    }, 0);
  };

  const toLine = (tokens: Token[]): RichTextLine => {
    // Neighbouring pieces of one run become one fragment, measured as a whole,
    // so letters kern inside it as they do when it is drawn.
    const merged = joinPieces(
      tokens.flatMap((token) => token.pieces),
      (a, b) => a === b,
    );
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
      const width = measure(text, run).advance + Math.max(graphemes(text).length - 1, 0) * letterSpacing;
      fragments.push({ text, run, x, width });
      x += width + letterSpacing;
    }
    return { fragments, width: fragments.length > 0 ? x - letterSpacing : 0 };
  };

  const wrap = breakLinesLikePixi(
    tokenizeRuns(runs),
    contentWidth,
    letterSpacing,
    (token) => pixiTokenKind(token.text),
    widthOf,
  );
  return withBlankLastParagraph(wrap).map(toLine);
}
