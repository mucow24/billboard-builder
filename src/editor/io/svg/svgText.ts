import type { TextCanvasItem } from '../../document/documentTypes';
import { getRenderBox } from '../../rendering/transformGeometry';
import { layoutWrappedText } from '../../rendering/textMeasurement';
import {
  TEXT_SHADOW_BLUR_TO_STDDEV,
  gradientOrSolidFill,
  itemFilterDef,
  wrapItem,
} from './svgPrimitives';
import type { SvgExportDeps, SvgExportWarning } from './svgExportTypes';

/**
 * Serialize a text item as glyph outlines (`<path>`). Layout — wrap, glyph
 * positions, baseline — comes entirely from the injected measurer (canvas
 * `measureText`, the source Pixi renders with); opentype supplies only glyph
 * shapes. When no outline font is available the item is omitted and a warning is
 * recorded (the controller then blocks the export).
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
  const font = lookup.font;

  const box = getRenderBox(item);
  const contentWidth = Math.max(1, box.width - item.padding.left - item.padding.right);
  const measure = (text: string) => deps.measurer.measureWidth(item, text);

  const lines = layoutWrappedText(item, contentWidth, measure);
  const lineHeight = item.fontSize * item.lineHeight;
  const measuredHeight = lines.length * lineHeight;
  const contentHeight = box.height - item.padding.top - item.padding.bottom;

  let textTop = item.padding.top;
  if (item.verticalAlign === 'middle') {
    textTop += Math.max(0, (contentHeight - measuredHeight) / 2);
  } else if (item.verticalAlign === 'bottom') {
    textTop += Math.max(0, contentHeight - measuredHeight);
  }

  const ascent = deps.measurer.fontAscent(item);
  const glyphPaths: string[] = [];

  lines.forEach((tokens, lineIndex) => {
    const lineText = tokens.join('');
    if (lineText.length === 0) return;

    const baselineY = textTop + lineIndex * lineHeight + ascent;
    const textWidth = measure(lineText);
    const lineWidth = textWidth + Math.max(lineText.length - 1, 0) * item.letterSpacing;

    let lineLeft = item.padding.left;
    if (item.align === 'center') {
      lineLeft += (contentWidth - lineWidth) / 2;
    } else if (item.align === 'right') {
      lineLeft += contentWidth - lineWidth;
    }

    kernedOffsets(lineText, textWidth, measure).forEach(({ ch, offset }, index) => {
      const penX = lineLeft + offset + index * item.letterSpacing;
      const path = font.glyphPath(ch, item.fontSize, penX, baselineY);
      if (path) glyphPaths.push(path);
    });
  });

  if (glyphPaths.length === 0) return '';

  const fillAttr = gradientOrSolidFill(item, defs, box.width, box.height);
  const pathEl = `<path d="${glyphPaths.join(' ')}" ${fillAttr}/>`;
  const filterAttr = pushTextFilter(item, defs);
  return wrapItem(item, effectiveOpacity, pathEl, filterAttr);
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
 * The rule covers kerning only: where the browser joins letters into a ligature
 * (letterSpacing 0), the export still draws the separate letters.
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
