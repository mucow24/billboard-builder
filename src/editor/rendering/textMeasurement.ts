import { drawnText } from '../fonts/emojiFallback';
import { graphemes } from './graphemes';
import { getRenderableCanvasFontDeclaration } from '../fonts/fontStyles';
import type { TextCanvasItem } from '../document/documentTypes';
import { parseRichText } from '../document/richText';
import type { RichTextRun } from '../document/richText';
import { layoutRichText } from './richTextLayout';
import type { RichTextLine } from './richTextLayout';
import {
  breakLinesLikePixi,
  pixiTokenKind,
  pixiTokenWidth,
  tokenizeLikePixi,
  withBlankLastParagraph,
} from './textLineBreaking';
import type { PixiWrap, TextWidths } from './textLineBreaking';

function getTextContentWidth(item: TextCanvasItem, width: number): number {
  return Math.max(1, width - item.padding.left - item.padding.right);
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

/** Both widths of a text that Pixi wraps it by, from a 2D canvas set to its font. */
function canvasTextWidths(context: CanvasRenderingContext2D, text: string): TextWidths {
  const metrics = context.measureText(text);
  return { advance: metrics.width, ink: inkWidthOf(metrics) };
}

/**
 * Break `item.text`, as it is drawn (`drawnText`), into the lines the canvas
 * draws, each a list of tokens: Pixi's tokens (`tokenizeLikePixi`) broken into
 * lines by the port of its `wordWrap` (`breakLinesLikePixi`). The app lays text
 * out with `layoutWrappedText`, which builds on this.
 *
 * `measure` gives the advance and the ink width of a token, letter spacing left
 * out; `pixiTokenWidth` turns them into the room the token takes up.
 */
export function wrapLikePixi(
  item: TextCanvasItem,
  contentWidth: number,
  measure: (text: string) => TextWidths,
): PixiWrap {
  const { letterSpacing } = item;
  // Pixi measures each distinct token once (`CanvasTextMetrics.getFromCache`).
  const tokenWidths = new Map<string, number>();
  const widthOf = (token: string): number => {
    let width = tokenWidths.get(token);
    if (width === undefined) {
      width = pixiTokenWidth(measure(token), graphemes(token).length, letterSpacing);
      tokenWidths.set(token, width);
    }
    return width;
  };
  return breakLinesLikePixi(
    tokenizeLikePixi(drawnText(item.text)),
    contentWidth,
    letterSpacing,
    pixiTokenKind,
    widthOf,
  );
}

/**
 * Break `item.text` into the lines the app lays it out in, each a list of
 * tokens: the lines the canvas draws (`wrapLikePixi`, which see for `measure`),
 * and a blank line after a line break that ends the text
 * (`withBlankLastParagraph`). The canvas (through the height) and SVG export
 * (through these lines) place the text by the same count.
 *
 * Everything that is not Pixi itself, the measured height and SVG export,
 * breaks text without tags into lines through this function; text with tags
 * goes through `layoutRichText`, which breaks lines by the same rule.
 */
export function layoutWrappedText(
  item: TextCanvasItem,
  contentWidth: number,
  measure: (text: string) => TextWidths,
): string[][] {
  return withBlankLastParagraph(wrapLikePixi(item, contentWidth, measure));
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
    return canvasTextWidths(context, text);
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
  const isJsdom =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  const context =
    typeof document !== 'undefined' && !isJsdom
      ? document.createElement('canvas').getContext('2d')
      : null;

  if (!context) {
    // A rough estimate where there is no canvas to measure with: its paragraphs,
    // split where the canvas starts a new line, at least a line each, the one
    // after a line break that ends the text included (see `withBlankLastParagraph`).
    const paragraphs = drawnText(rich.plain).split(/\r\n|\r|\n/);
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
    : layoutWrappedText(item, safeWidth, (text) => canvasTextWidths(measuringContext, text)).length;

  return Math.max(1, Math.ceil(verticalPadding + lineCount * item.fontSize * item.lineHeight));
}
