import type { TextCanvasItem } from '../../document/documentTypes';
import { getRenderBox } from '../../rendering/transformGeometry';
import { graphemeIndexOfCodePoints, graphemes } from '../../rendering/graphemes';
import { layoutWrappedText } from '../../rendering/textMeasurement';
import { toSvgPaint } from './svgColor';
import { fmt } from './svgEscape';
import { glyphsPath, lineGlyphs } from './svgTextGlyphs';
import {
  TEXT_SHADOW_BLUR_TO_STDDEV,
  gradientOrSolidFill,
  itemFilterDef,
  wrapItem,
} from './svgPrimitives';
import type {
  GlyphPathStyle,
  OutlineFont,
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
  const lookup = deps.fontOutlines.getOutlineFont(item);
  if (!lookup.ok) {
    warnings.push({
      kind: 'unvectorizable-text',
      itemId: item.id,
      itemName: item.name,
      fontFamily: item.fontFamily,
      reason: lookup.reason,
    });
    return '';
  }
  const box = getRenderBox(item);
  const contentWidth = Math.max(1, box.width - item.padding.left - item.padding.right);
  const measure = (text: string) => deps.measurer.measureWidth(item, text);

  const lines = layoutWrappedText(item, contentWidth, measure).map((tokens) =>
    drawnLine(tokens.join(''), item, deps.measurer),
  );
  const lineHeight = item.fontSize * item.lineHeight;
  const measuredHeight = lines.length * lineHeight;
  const contentHeight = box.height - item.padding.top - item.padding.bottom;

  let textTop = item.padding.top;
  if (item.verticalAlign === 'middle') {
    textTop += Math.max(0, (contentHeight - measuredHeight) / 2);
  } else if (item.verticalAlign === 'bottom') {
    textTop += Math.max(0, contentHeight - measuredHeight);
  }

  const firstBaseline = deps.measurer.firstBaseline(item);

  // What is drawn at each character of each line, and from which font: the
  // item's own, or the emoji fallback for what its own font lacks. Each font has
  // its own glyph group, as the browser fakes bold and italic for each apart.
  const drawnGlyphs = lines.map((line) =>
    lineGlyphs(lookup.font, lookup.fallback?.font, line.text, item.letterSpacing),
  );
  const textFrom = (fallback: boolean) =>
    lines
      .flatMap((line, lineIndex) => [...line.text].filter((_, index) => drawnGlyphs[lineIndex][index].fallback === fallback))
      .join('');
  const own = glyphGroup(item, lookup.font, lookup.synthetic, textFrom(false), deps.measurer);
  const fallback = lookup.fallback
    ? glyphGroup(item, lookup.fallback.font, lookup.fallback.synthetic, textFrom(true), deps.measurer)
    : null;

  // Pixi aligns lines inside the box, or inside the widest line when one does not
  // fit the box (`alignWidth` in `CanvasTextGenerator._renderTextToCanvas`): the
  // widest line then starts at the box's left edge whatever the alignment.
  const alignWidth = Math.max(contentWidth, ...lines.map((line) => line.width));
  // The lines' left and right ends, with the box's own included.
  let inkLeft = 0;
  let inkRight = box.width;

  lines.forEach((line, lineIndex) => {
    if (line.text.length === 0) return;

    const baselineY = textTop + lineIndex * lineHeight + firstBaseline;

    let lineLeft = item.padding.left;
    if (item.align === 'center') {
      lineLeft += (alignWidth - line.width) / 2;
    } else if (item.align === 'right') {
      lineLeft += alignWidth - line.width;
    }

    inkLeft = Math.min(inkLeft, lineLeft);
    inkRight = Math.max(inkRight, lineLeft + line.width);

    // Pixi adds letter spacing once per grapheme, so every code point of one
    // gets as much of it as the grapheme's first.
    const spacingsBefore = graphemeIndexOfCodePoints(line.text);
    // Ligatures and other glyphs the fonts put in place of characters; see svgTextGlyphs.
    kernedOffsets(line.text, line.advance, measure).forEach(({ offset }, index) => {
      const { fallback: fromFallback, drawn } = drawnGlyphs[lineIndex][index];
      const group = fromFallback && fallback ? fallback : own;
      const penX = lineLeft + offset + spacingsBefore[index] * item.letterSpacing;
      for (const penOffset of group.penOffsets) {
        const path = glyphsPath(group.font, drawn, item.fontSize, penX + penOffset, baselineY, group.glyphStyle);
        if (path) group.paths.push(path);
      }
    });
  });

  const groups = [own, ...(fallback ? [fallback] : [])].filter((group) => group.paths.length > 0);
  if (groups.length === 0) return '';

  const fillAttr = gradientOrSolidFill(item, defs, box.width, box.height);
  const pathEls = groups.map((group) => {
    const d = group.paths.join(' ');
    if (group.bold?.kind !== 'stroke') return `<path d="${d}" ${fillAttr}/>`;
    // Room around the lines for ink that leaves them, the stroke included.
    const room = item.fontSize;
    const top = Math.min(0, textTop) - room;
    const bottom = Math.max(box.height, textTop + measuredHeight) + room;
    const area = { x: inkLeft - room, y: top, width: inkRight - inkLeft + 2 * room, height: bottom - top };
    const maskId = group === own ? `bold-${item.id}` : `bold-${item.id}-fallback`;
    return strokedBoldPath(item, d, fillAttr, group.bold.width, area, defs, maskId);
  });
  const filterAttr = pushTextFilter(item, defs);
  return wrapItem(item, effectiveOpacity, pathEls.join(''), filterAttr);
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
    glyphStyle: { slant: synthetic?.italic ? SYNTHETIC_OBLIQUE_SLANT : 0, closed: bold?.kind === 'stroke' },
    paths: [],
  };
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
  item: TextCanvasItem,
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
    const { hex, alpha } = toSvgPaint(item.fill);
    const opacity = alpha < 1 ? ` opacity="${fmt(alpha)}"` : '';
    return `<path d="${d}" fill="${hex}" stroke="${hex}"${outline}${opacity}/>`;
  }

  const opaque = toSvgPaint(item.fill).alpha >= 1 && toSvgPaint(item.secondaryFill).alpha >= 1;
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
 * The spaces Pixi takes off the end of a line, by character code: the characters
 * it breaks lines at (`BREAKING_SPACES` in pixi.js
 * `scene/text/canvas/utils/textTokenization`). No-break spaces (U+00A0, U+2007,
 * U+202F) are not among them, so they stay on the line and keep their width.
 */
const BREAKING_SPACES = new Set([
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

function withoutTrailingSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && BREAKING_SPACES.has(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

/**
 * Turn a line as `layoutWrappedText` laid it out into the line the canvas draws
 * and aligns.
 *
 * `layoutWrappedText` keeps the space a line wraps at on that line, along with
 * any spaces the text has before a line break or at its end. Pixi (`wordWrap` in
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
