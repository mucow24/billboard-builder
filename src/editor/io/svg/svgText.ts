import type { TextCanvasItem } from '../../document/documentTypes';
import { parseRichText } from '../../document/richText';
import type { RichTextRun } from '../../document/richText';
import { computeGradientEndpoints } from '../../rendering/geometry/gradientGeometry';
import { layoutRichText } from '../../rendering/richTextLayout';
import { alignedLineLeft, textBlockTop, withoutTrailingSpaces } from '../../rendering/textLineBreaking';
import { getRenderBox } from '../../rendering/transformGeometry';
import { graphemeIndexOfCodePoints, graphemes } from '../../rendering/graphemes';
import { drawnRichTextRuns, layoutWrappedText, richTextRunItem } from '../../rendering/textMeasurement';
import { TEXT_STROKE_JOIN, textStrokeOf } from '../../rendering/textStroke';
import type { TextStrokePaint } from '../../rendering/textStroke';
import { paintAttrs, toSvgPaint } from './svgColor';
import { fmt } from './svgEscape';
import { glyphsPath, lineGlyphs } from './svgTextGlyphs';
import type { DrawnGlyphs } from './svgTextGlyphs';
import {
  TEXT_SHADOW_BLUR_TO_STDDEV,
  gradientOrSolidFill,
  itemFilterDef,
  linearGradientDef,
  wrapItem,
} from './svgPrimitives';
import type {
  GlyphPathStyle,
  OutlineFont,
  OutlineResult,
  SvgExportDeps,
  SvgExportWarning,
  SyntheticFontStyle,
  TextMeasurer,
} from './svgExportTypes';
import { SYNTHETIC_OBLIQUE_SLANT, syntheticBoldFor, type SyntheticBold } from './syntheticFontStyle';

/**
 * Serialize a text item as glyph outlines (`<path>`). Layout — wrap, glyph
 * positions, baseline — comes entirely from the injected measurer (canvas
 * `measureText`, the source Pixi renders with); opentype supplies only glyph
 * shapes. When no outline font is available the item is omitted and a warning is
 * recorded (the controller then blocks the export).
 *
 * Bold and italic that the font file lacks, and the browser therefore fakes on
 * the canvas, are faked here the same way (see syntheticFontStyle): italic by
 * leaning the outlines, bold by a stroke or by smeared copies of them.
 *
 * Characters the item's font has no glyph for, and the emoji fallback has, are
 * outlined from the fallback (`lookup.fallback`, see `lineGlyphs`), as the canvas
 * draws them. Their bold and italic are faked by what the fallback lacks, in a
 * path of their own.
 */
export function textSvg(
  item: TextCanvasItem,
  effectiveOpacity: number,
  deps: SvgExportDeps,
  defs: string[],
  warnings: SvgExportWarning[],
): string {
  // Text with tags has a layout of its own; text without is untouched by them.
  const rich = parseRichText(item.text);
  if (rich.hasMarkup) return richTextSvg(item, rich.runs, effectiveOpacity, deps, defs, warnings);

  const lookup = outlineFontOf(item, item, deps, warnings);
  if (!lookup) return '';
  const box = getRenderBox(item);
  const contentWidth = Math.max(1, box.width - item.padding.left - item.padding.right);
  const measure = (text: string) => deps.measurer.measureWidth(item, text);
  const widths = (text: string) => ({ advance: measure(text), ink: deps.measurer.measureInkWidth?.(item, text) ?? 0 });

  const lines = layoutWrappedText(item, contentWidth, widths).map((tokens) =>
    drawnLine(tokens.join(''), item, deps.measurer),
  );
  const lineHeight = item.fontSize * item.lineHeight;
  const measuredHeight = lines.length * lineHeight;
  const textTop = textBlockTop(item, box.height, measuredHeight);
  const firstBaseline = deps.measurer.firstBaseline(item);

  // What is drawn at each character of each line, and from which font: the
  // item's own, or the emoji fallback for what its own font lacks. Each font has
  // its own glyph group, as the browser fakes bold and italic for each apart.
  const shapedLines = lines.map((line) => ({
    text: line.text,
    advance: line.advance,
    glyphs: lineGlyphs(lookup.font, lookup.fallback?.font, line.text, item.letterSpacing),
  }));
  const groups = glyphGroups(item, lookup, shapedLines, deps.measurer);

  const alignWidth = Math.max(contentWidth, ...lines.map((line) => line.width));
  // The lines' left and right ends, with the box's own included.
  let inkLeft = 0;
  let inkRight = box.width;

  lines.forEach((line, lineIndex) => {
    if (line.text.length === 0) return;

    const baselineY = textTop + lineIndex * lineHeight + firstBaseline;
    const lineLeft = alignedLineLeft(item, alignWidth, line.width);
    inkLeft = Math.min(inkLeft, lineLeft);
    inkRight = Math.max(inkRight, lineLeft + line.width);
    placeGlyphs(item, shapedLines[lineIndex], lineLeft, baselineY, groups, measure);
  });

  if (!hasGlyphPaths(groups)) return '';

  const fillAttr = gradientOrSolidFill(item, defs, box.width, box.height);
  // Room around the lines for ink that leaves them, the stroke included.
  const room = item.fontSize;
  const top = Math.min(0, textTop) - room;
  const bottom = Math.max(box.height, textTop + measuredHeight) + room;
  const area = { x: inkLeft - room, y: top, width: inkRight - inkLeft + 2 * room, height: bottom - top };
  const pathEls = glyphGroupElements(groups, item, fillAttr, area, defs, `bold-${item.id}`);
  // The outline goes under the fill, and the shadow is cast from both.
  const stroke = textStrokeOf(item);
  const strokeEls = stroke ? strokeLayer(strokeElements(groups, stroke), stroke) : '';
  const filterAttr = pushTextFilter(item, defs);
  return wrapItem(item, effectiveOpacity, strokeEls + pathEls.join(''), filterAttr);
}

type OutlineFonts = Extract<OutlineResult, { ok: true }>;

/**
 * The outline fonts `fontItem` is drawn with: `item`, or `item` in the style of
 * one of its rich text runs. Null when there are none, with a warning recorded
 * against `item` (the controller then blocks the export).
 */
function outlineFontOf(
  item: TextCanvasItem,
  fontItem: TextCanvasItem,
  deps: SvgExportDeps,
  warnings: SvgExportWarning[],
): OutlineFonts | null {
  const lookup = deps.fontOutlines.getOutlineFont(fontItem);
  if (lookup.ok) return lookup;
  warnings.push({
    kind: 'unvectorizable-text',
    itemId: item.id,
    itemName: item.name,
    fontFamily: item.fontFamily,
    reason: lookup.reason,
  });
  return null;
}

/** The glyphs of a text item that one font draws, and how the browser fakes bold and italic with it. */
interface GlyphGroup {
  font: OutlineFont;
  /** Faked bold, when the browser fakes it with this font. */
  bold: SyntheticBold | null;
  /** A smeared glyph is drawn once at each of these distances right of its pen position. */
  penOffsets: readonly number[];
  glyphStyle: GlyphPathStyle;
  /** The SVG path data of the glyphs, as they are drawn. */
  paths: string[];
}

/**
 * The glyph group of `font`, which draws the characters `text` of `item`, with
 * `synthetic` as what the browser fakes when it draws them.
 */
function glyphGroup(
  item: TextCanvasItem,
  font: OutlineFont,
  synthetic: SyntheticFontStyle | undefined,
  text: string,
  measurer: TextMeasurer,
): GlyphGroup {
  const bold = synthetic?.bold ? syntheticBoldFor(item, text, measurer) : null;
  return {
    font,
    bold,
    penOffsets: bold?.kind === 'smear' ? bold.offsets : [0],
    // Stroked outlines need their contours closed, or the stroke has gaps.
    glyphStyle: {
      slant: synthetic?.italic ? SYNTHETIC_OBLIQUE_SLANT : 0,
      closed: bold?.kind === 'stroke' || textStrokeOf(item) !== null,
    },
    paths: [],
  };
}

/** A line of text, or a fragment of one, with what the canvas draws at each of its characters (`lineGlyphs`). */
interface ShapedLine {
  /** Without the spaces the canvas takes off its end. */
  text: string;
  /** Measured width of `text`: kerning included, letter spacing left out. */
  advance: number;
  glyphs: DrawnGlyphs[];
}

/** The glyph groups of a text: its own font's, and the emoji fallback's where it has one. */
interface GlyphGroups {
  own: GlyphGroup;
  fallback: GlyphGroup | null;
}

/**
 * The glyph groups that draw `lines` with the fonts of `lookup`, each told how
 * the browser fakes bold and italic for `fontItem` from the characters it draws.
 */
function glyphGroups(
  fontItem: TextCanvasItem,
  lookup: OutlineFonts,
  lines: readonly ShapedLine[],
  measurer: TextMeasurer,
): GlyphGroups {
  const textFrom = (fallback: boolean) =>
    lines
      .flatMap(({ text, glyphs }) => [...text].filter((_, index) => glyphs[index].fallback === fallback))
      .join('');
  return {
    own: glyphGroup(fontItem, lookup.font, lookup.synthetic, textFrom(false), measurer),
    fallback: lookup.fallback
      ? glyphGroup(fontItem, lookup.fallback.font, lookup.fallback.synthetic, textFrom(true), measurer)
      : null,
  };
}

/**
 * Add the glyphs of `line` to their groups, the line starting at `left` on the
 * baseline `baselineY`. Each character goes where the canvas draws it (see
 * `kernedOffsets`); `measure` is the width of a text in the line's font.
 */
function placeGlyphs(
  item: Pick<TextCanvasItem, 'fontSize' | 'letterSpacing'>,
  line: ShapedLine,
  left: number,
  baselineY: number,
  groups: GlyphGroups,
  measure: (text: string) => number,
): void {
  // Pixi adds letter spacing once per grapheme, so every code point of one
  // gets as much of it as the grapheme's first.
  const spacingsBefore = graphemeIndexOfCodePoints(line.text);
  // Ligatures and other glyphs the fonts put in place of characters; see svgTextGlyphs.
  kernedOffsets(line.text, line.advance, measure).forEach(({ offset }, index) => {
    const { fallback: fromFallback, drawn } = line.glyphs[index];
    const group = fromFallback && groups.fallback ? groups.fallback : groups.own;
    const penX = left + offset + spacingsBefore[index] * item.letterSpacing;
    for (const penOffset of group.penOffsets) {
      const path = glyphsPath(group.font, drawn, item.fontSize, penX + penOffset, baselineY, group.glyphStyle);
      if (path) group.paths.push(path);
    }
  });
}

function hasGlyphPaths(groups: GlyphGroups): boolean {
  return groups.own.paths.length > 0 || (groups.fallback?.paths.length ?? 0) > 0;
}

/**
 * The elements that draw the glyph groups, the text's own font first: a `<path>`
 * each, grown into faked bold where the group fakes it by a stroke (see
 * `strokedBoldPath`). `fillAttr` paints them, with the colours of `paint`;
 * `area` has to contain all of their ink; `maskId` is unique in the document.
 */
function glyphGroupElements(
  groups: GlyphGroups,
  paint: { fill: string; secondaryFill: string },
  fillAttr: string,
  area: { x: number; y: number; width: number; height: number },
  defs: string[],
  maskId: string,
): string[] {
  return [groups.own, ...(groups.fallback ? [groups.fallback] : [])]
    .filter((group) => group.paths.length > 0)
    .map((group) => {
      const d = group.paths.join(' ');
      if (group.bold?.kind !== 'stroke') return `<path d="${d}" ${fillAttr}/>`;
      const id = group === groups.own ? maskId : `${maskId}-fallback`;
      return strokedBoldPath(paint, d, fillAttr, group.bold.width, area, defs, id);
    });
}

/**
 * The elements that draw the outline of a text (see `rendering/textStroke`)
 * around the glyphs of `groups`: a stroked `<path>` each, to go under the
 * elements that fill them. Round joins and caps, as on the canvas.
 *
 * Where a group's bold is faked by a stroke, the canvas outlines the glyphs as
 * that bold has grown them, so the stroke here is wider by as much: its outer
 * edge is then where the canvas has it. Its inner edge reaches further into the
 * glyph than on the canvas, which shows only through a see-through fill.
 */
function strokeElements(groups: GlyphGroups, stroke: TextStrokePaint): string[] {
  return [groups.own, ...(groups.fallback ? [groups.fallback] : [])]
    .filter((group) => group.paths.length > 0)
    .map((group) => {
      const width = stroke.width + (group.bold?.kind === 'stroke' ? group.bold.width : 0);
      return (
        `<path d="${group.paths.join(' ')}" fill="none" stroke="${stroke.color}" ` +
        `stroke-width="${fmt(width)}" stroke-linejoin="${TEXT_STROKE_JOIN}" stroke-linecap="${TEXT_STROKE_JOIN}"/>`
      );
    });
}

/**
 * The outline of a whole text item: `elements` (see `strokeElements`) painted
 * opaque and, where the outline's colour is see-through, made see-through
 * together, so that strokes that overlap do not come out darker there.
 */
function strokeLayer(elements: string[], stroke: TextStrokePaint): string {
  if (elements.length === 0) return '';
  if (stroke.alpha >= 1) return elements.join('');
  return `<g opacity="${fmt(stroke.alpha)}">${elements.join('')}</g>`;
}

/**
 * The glyph outlines `d` grown into faked bold: filled, and stroked `strokeWidth`
 * wide in the same paint. Mitered joins (limit 4) are what the browser's own
 * faked bold has.
 *
 * Where the paint is see-through, stroke and fill must not both show in the band
 * where they overlap, or that band comes out darker than the rest. A solid colour
 * is therefore painted opaque and the element made see-through as a whole. A
 * gradient with a see-through stop cannot be: it is painted through a mask of the
 * grown outlines instead, over `area`, which has to contain all of the text's ink.
 *
 * Known limit: the stroke is a live attribute. A program that shows the SVG as a
 * picture scales it with everything else, but one that converts the SVG into
 * shapes of its own (Illustrator, Figma) may keep the stroke's width when the
 * shapes are resized, which thins or thickens the bold. Baking the stroke into
 * the outlines would avoid that, at the cost of a path-offsetting dependency.
 */
function strokedBoldPath(
  paint: { fill: string; secondaryFill: string },
  d: string,
  fillAttr: string,
  strokeWidth: number,
  area: { x: number; y: number; width: number; height: number },
  defs: string[],
  /** The id of the mask, where one is needed: unique in the document. */
  id: string,
): string {
  const outline = ` stroke-width="${fmt(strokeWidth)}" stroke-linejoin="miter" stroke-miterlimit="4"`;

  if (!fillAttr.startsWith('fill="url(')) {
    const { hex, alpha } = toSvgPaint(paint.fill);
    const opacity = alpha < 1 ? ` opacity="${fmt(alpha)}"` : '';
    return `<path d="${d}" fill="${hex}" stroke="${hex}"${outline}${opacity}/>`;
  }

  const opaque = toSvgPaint(paint.fill).alpha >= 1 && toSvgPaint(paint.secondaryFill).alpha >= 1;
  if (opaque) {
    return `<path d="${d}" ${fillAttr} ${fillAttr.replace('fill=', 'stroke=')}${outline}/>`;
  }

  const rect = `x="${fmt(area.x)}" y="${fmt(area.y)}" width="${fmt(area.width)}" height="${fmt(area.height)}"`;
  defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" ${rect}>` +
      `<path d="${d}" fill="#fff" stroke="#fff"${outline}/></mask>`,
  );
  return `<rect ${rect} ${fillAttr} mask="url(#${id})"/>`;
}

/**
 * Serialize a text item with tags (see `document/richText`): the glyph outlines
 * of each fragment, a piece of one run on one line, as elements of their own.
 *
 * The fragments and their positions come from `layoutRichText`, the layout the
 * canvas draws from, measured here with the same measurer. A fragment is drawn
 * as a line of plain text is (`placeGlyphs`, `glyphGroupElements`), with the
 * fonts of its run's own weight and style, and filled with its run's paint: a
 * colour, a gradient across the fragment's own box, or else the item's fill.
 * One filter around them all casts the shadow, so no fragment's shadow falls on
 * another.
 */
function richTextSvg(
  item: TextCanvasItem,
  parsedRuns: RichTextRun[],
  effectiveOpacity: number,
  deps: SvgExportDeps,
  defs: string[],
  warnings: SvgExportWarning[],
): string {
  // The runs as the canvas is given them (see `drawnRichTextRuns`).
  const runs = drawnRichTextRuns(parsedRuns);

  interface RunFont {
    item: TextCanvasItem;
    lookup: OutlineFonts;
  }
  const runFonts = new Map<RichTextRun, RunFont>();
  for (const run of runs) {
    const runItem = richTextRunItem(item, run);
    const lookup = outlineFontOf(item, runItem, deps, warnings);
    if (!lookup) return '';
    runFonts.set(run, { item: runItem, lookup });
  }
  const fontOf = (run: RichTextRun): RunFont => runFonts.get(run) as RunFont;

  const box = getRenderBox(item);
  const contentWidth = Math.max(1, box.width - item.padding.left - item.padding.right);
  const lineHeight = item.fontSize * item.lineHeight;

  const lines = layoutRichText(runs, contentWidth, item.letterSpacing, (text, run) => {
    const runItem = fontOf(run).item;
    return {
      advance: deps.measurer.measureWidth(runItem, text),
      ink: deps.measurer.measureInkWidth?.(runItem, text) ?? 0,
    };
  });
  const textTop = textBlockTop(item, box.height, lines.length * lineHeight);
  const alignWidth = Math.max(contentWidth, ...lines.map((line) => line.width));
  // Every fragment stands on the baseline of the item's own font.
  const firstBaseline = deps.measurer.firstBaseline(item);

  // The item's own fill, defined once however many fragments take it.
  let itemFill: string | null = null;
  const itemFillAttr = () => (itemFill ??= gradientOrSolidFill(item, defs, box.width, box.height));

  const elements: string[] = [];
  // The outline of every fragment, under the fill of every fragment.
  const stroke = textStrokeOf(item);
  const strokeEls: string[] = [];
  // Fragments written so far: numbers the ids of this one's gradient and mask.
  let written = 0;
  lines.forEach((line, lineIndex) => {
    const lineTop = textTop + lineIndex * lineHeight;
    const lineLeft = alignedLineLeft(item, alignWidth, line.width);

    for (const fragment of line.fragments) {
      const { item: runItem, lookup } = fontOf(fragment.run);
      const measure = (text: string) => deps.measurer.measureWidth(runItem, text);
      const left = lineLeft + fragment.x;

      // The canvas draws each fragment as a text of its own.
      const shaped: ShapedLine = {
        text: fragment.text,
        advance: measure(fragment.text),
        glyphs: lineGlyphs(lookup.font, lookup.fallback?.font, fragment.text, item.letterSpacing),
      };
      const groups = glyphGroups(runItem, lookup, [shaped], deps.measurer);
      placeGlyphs(item, shaped, left, lineTop + firstBaseline, groups, measure);
      if (!hasGlyphPaths(groups)) continue;

      const fragmentId = `${item.id}-${written}`;
      written += 1;
      const paint = fragment.run.paint;
      let fillAttr: string;
      let colours: { fill: string; secondaryFill: string } = item;
      // Across the fragment's own box: its width, and its line box from top to bottom.
      const endpoints =
        paint?.kind === 'gradient'
          ? computeGradientEndpoints(
              { gradientEnabled: true, gradientAngle: paint.angle },
              fragment.width,
              lineHeight,
            )
          : null;
      if (paint?.kind === 'gradient' && endpoints) {
        const id = `grad-${fragmentId}`;
        defs.push(
          linearGradientDef(
            id,
            {
              x0: endpoints.x0 + left,
              y0: endpoints.y0 + lineTop,
              x1: endpoints.x1 + left,
              y1: endpoints.y1 + lineTop,
            },
            paint.start,
            paint.end,
          ),
        );
        fillAttr = `fill="url(#${id})"`;
        colours = { fill: paint.start, secondaryFill: paint.end };
      } else if (paint) {
        const color = paint.kind === 'color' ? paint.color : paint.start;
        fillAttr = paintAttrs('fill', color);
        colours = { fill: color, secondaryFill: color };
      } else {
        fillAttr = itemFillAttr();
      }

      // Room around the fragment for ink that leaves it, the stroke included.
      const room = item.fontSize;
      const area = {
        x: left - room,
        y: lineTop - room,
        width: fragment.width + 2 * room,
        height: lineHeight + 2 * room,
      };
      elements.push(...glyphGroupElements(groups, colours, fillAttr, area, defs, `bold-${fragmentId}`));
      if (stroke) strokeEls.push(...strokeElements(groups, stroke));
    }
  });

  if (elements.length === 0) return '';
  const inner = (stroke ? strokeLayer(strokeEls, stroke) : '') + elements.join('');
  return wrapItem(item, effectiveOpacity, inner, pushTextFilter(item, defs));
}

/** One line of a text item, as the canvas draws it. */
interface DrawnLine {
  /** The line without the spaces the canvas takes off its end. */
  text: string;
  /** Measured width of `text`: kerning included, letter spacing left out. */
  advance: number;
  /** The width the canvas aligns the line by. */
  width: number;
}

/**
 * Turn a line as `layoutWrappedText` laid it out into the line the canvas draws
 * and aligns.
 *
 * A line from `layoutWrappedText` can end in spaces: the one it wraps at, and
 * any the text has before a line break or at its end. Pixi (`wordWrap` in
 * pixi.js `scene/text/canvas/utils`) takes the spaces off the end of every line
 * before it measures and draws it. Spaces at the start of a paragraph stay: the
 * canvas text style sets `whiteSpace: 'pre'`, under which Pixi keeps them.
 *
 * Pixi then aligns the line by the larger of its advance width and its ink
 * width, plus the letter spacing between its characters
 * (`CanvasTextMetrics._measureText`). The ink is the wider one when a glyph at
 * either end reaches past its advance, as slanted and swashed glyphs do.
 */
function drawnLine(laidOutText: string, item: TextCanvasItem, measurer: TextMeasurer): DrawnLine {
  const text = withoutTrailingSpaces(laidOutText);
  const advance = measurer.measureWidth(item, text);
  const ink = measurer.measureInkWidth?.(item, text) ?? 0;
  const spacing = Math.max(graphemes(text).length - 1, 0) * item.letterSpacing;
  return { text, advance, width: Math.max(advance, ink) + spacing };
}

/**
 * Where each character of a line starts, measured from the line's left edge and
 * leaving letter spacing aside: the width of the line minus the width of the text
 * from that character on.
 *
 * This is where the canvas puts it. Pixi (`CanvasTextGenerator._drawLetterSpacing`)
 * draws a line with letterSpacing 0 in one `fillText` call, so the browser kerns
 * neighbouring glyphs; with any other letterSpacing it draws character by
 * character and moves the pen by how much narrower the remaining text measures
 * once the character is taken off. Both come to the rule above. Adding up
 * single-character widths leaves the kerning out, and the width of the text
 * before a character leaves out the kerning between it and its predecessor.
 *
 * The rule gives positions only. Which glyph is drawn at a character is
 * `lineSubstitutions`' part: where the browser joins letters into a ligature
 * (letterSpacing 0), that one glyph is drawn at the first of them and nothing at
 * the others.
 */
function kernedOffsets(
  lineText: string,
  textWidth: number,
  measure: (text: string) => number,
): { ch: string; offset: number }[] {
  const offsets: { ch: string; offset: number }[] = [];
  let rest = lineText;
  let restWidth = textWidth;
  for (const ch of lineText) {
    offsets.push({ ch, offset: textWidth - restWidth });
    rest = rest.slice(ch.length);
    restWidth = rest.length > 0 ? measure(rest) : 0;
  }
  return offsets;
}

/** Text filter combines blurRadius with a text-tuned drop shadow (Pixi renders text shadow via the text style). */
function pushTextFilter(item: TextCanvasItem, defs: string[]): string {
  const id = `fx-${item.id}`;
  const def = itemFilterDef(id, item, {
    includeShadow: true,
    shadowStdDevFactor: TEXT_SHADOW_BLUR_TO_STDDEV,
  });
  if (!def) return '';
  defs.push(def);
  return ` filter="url(#${id})"`;
}
