import type { ProjectDocument, TextCanvasItem } from '../../document/documentTypes';
import { parseRichText } from '../../document/richText';
import { isCanvasItemNode, visitNodes } from '../../document/sceneGraph';
import { drawnText, isInEmojiFallbackRange } from '../../fonts/emojiFallback';
import { richTextRunItem } from '../../rendering/textMeasurement';
import { documentToSvg } from './documentToSvg';
import { emojiFallbackOutline, hasGlyphsFor } from './svgTextGlyphs';
import { fontVariantKey, resolveOutline, type FontKind } from './fontOutlineProvider';
import type {
  FontOutlineProvider,
  NodeRasterizer,
  OutlineResult,
  SvgExportResult,
  SyntheticFontStyle,
  TextMeasurer,
} from './svgExportTypes';

export interface FontBytes {
  kind: FontKind;
  bytes: ArrayBuffer | null;
  /** What the browser fakes when it draws the item with these bytes; nothing when left out. */
  synthetic?: SyntheticFontStyle;
}

export interface ExportToSvgDeps {
  /** Resolve a text item's font kind and bytes. Async byte loading (fetch/IndexedDB) lives here. */
  loadFontBytes: (item: TextCanvasItem) => Promise<FontBytes>;
  /**
   * The same for the emoji fallback the canvas draws a text item's missing
   * characters with (see `fonts/emojiFallback`). Asked only for items that have
   * such characters. Without it, they are outlined from the item's own font.
   */
  loadFallbackFontBytes?: (item: TextCanvasItem) => Promise<FontBytes>;
  measurer: TextMeasurer;
  rasterizer: NodeRasterizer;
}

/**
 * Browser entry point: pre-resolve every distinct text font (the only async part)
 * into a synchronous lookup, then run the pure serializer. Returns the SVG plus
 * any unvectorizable-text warnings for the controller's block decision.
 */
export async function exportToSvg(doc: ProjectDocument, deps: ExportToSvgDeps): Promise<SvgExportResult> {
  const fontOutlines = await resolveFontOutlines(collectTextItems(doc), deps);

  return documentToSvg(doc, {
    fontOutlines,
    measurer: deps.measurer,
    rasterizer: deps.rasterizer,
  });
}

/**
 * The outline fonts of `items`, the items of `textItemsOf`: every distinct font
 * among them loaded and parsed (the only async part), as a synchronous lookup.
 */
export async function resolveFontOutlines(
  items: TextCanvasItem[],
  deps: Pick<ExportToSvgDeps, 'loadFontBytes' | 'loadFallbackFontBytes'>,
): Promise<FontOutlineProvider> {
  const resolved = new Map<string, OutlineResult>();
  // Font variants whose fallback has been asked for, whether it came or not.
  const fallbackAsked = new Set<string>();
  for (const item of items) {
    const key = fontVariantKey(item);
    let outline = resolved.get(key);
    if (!outline) {
      const { kind, bytes, synthetic } = await deps.loadFontBytes(item);
      const own = resolveOutline(kind, bytes);
      outline = own.ok && synthetic ? { ...own, synthetic } : own;
      resolved.set(key, outline);
    }

    // The fallback is resolved per font variant, as the item's own font is, and
    // only once an item in that variant turns out to lack a character the
    // fallback could be used for.
    if (!outline.ok || !deps.loadFallbackFontBytes || fallbackAsked.has(key)) continue;
    if (hasGlyphsFor(outline.font, [...drawnText(item.text)].filter(isInEmojiFallbackRange).join(''))) continue;
    fallbackAsked.add(key);
    const { kind, bytes, synthetic } = await deps.loadFallbackFontBytes(item);
    const fallback = resolveOutline(kind, bytes);
    if (fallback.ok) {
      resolved.set(key, {
        ...outline,
        fallback: { font: emojiFallbackOutline(fallback.font), ...(synthetic ? { synthetic } : {}) },
      });
    }
  }

  return {
    getOutlineFont: (item) => resolved.get(fontVariantKey(item)) ?? { ok: false, reason: 'no-bytes' },
  };
}

/** The items of `textItemsOf` for every text item of `doc`. */
function collectTextItems(doc: ProjectDocument): TextCanvasItem[] {
  const items: TextCanvasItem[] = [];
  visitNodes(doc.nodes, (node) => {
    if (isCanvasItemNode(node) && node.kind === 'text') items.push(...textItemsOf(node));
  });
  return items;
}

/**
 * A text item as its fonts are resolved for: itself, or for one with tags (see
 * `document/richText`) the item in the style of each of its runs, with that
 * run's text. A bold run needs the family's bold file, and the emoji fallback
 * where its own text calls for it.
 */
export function textItemsOf(item: TextCanvasItem): TextCanvasItem[] {
  const rich = parseRichText(item.text);
  if (!rich.hasMarkup) return [item];
  return rich.runs.map((run) => ({ ...richTextRunItem(item, run), text: run.text }));
}
