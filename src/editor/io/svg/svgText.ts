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
 * Serialize a text item as glyph outlines (`<path>`). Layout — wrap, per-glyph
 * advance, baseline — comes entirely from the injected measurer (canvas
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
    const lineWidth = measure(lineText) + Math.max(lineText.length - 1, 0) * item.letterSpacing;

    let penX = item.padding.left;
    if (item.align === 'center') {
      penX += (contentWidth - lineWidth) / 2;
    } else if (item.align === 'right') {
      penX += contentWidth - lineWidth;
    }

    for (const ch of lineText) {
      const path = font.glyphPath(ch, item.fontSize, penX, baselineY);
      if (path) glyphPaths.push(path);
      penX += measure(ch) + item.letterSpacing;
    }
  });

  if (glyphPaths.length === 0) return '';

  const fillAttr = gradientOrSolidFill(item, defs, box.width, box.height);
  const pathEl = `<path d="${glyphPaths.join(' ')}" ${fillAttr}/>`;
  const filterAttr = pushTextFilter(item, defs);
  return wrapItem(item, effectiveOpacity, pathEl, filterAttr);
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
