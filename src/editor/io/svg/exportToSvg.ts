import type { ProjectDocument, TextCanvasItem } from '../../document/documentTypes';
import { isCanvasItemNode, visitNodes } from '../../document/sceneGraph';
import { drawnText } from '../../fonts/emojiFallback';
import { documentToSvg } from './documentToSvg';
import { hasGlyphsFor } from './svgTextGlyphs';
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
  const resolved = new Map<string, OutlineResult>();
  // Font variants whose fallback has been asked for, whether it came or not.
  const fallbackAsked = new Set<string>();
  for (const item of collectTextItems(doc)) {
    const key = fontVariantKey(item);
    let outline = resolved.get(key);
    if (!outline) {
      const { kind, bytes, synthetic } = await deps.loadFontBytes(item);
      const own = resolveOutline(kind, bytes);
      outline = own.ok && synthetic ? { ...own, synthetic } : own;
      resolved.set(key, outline);
    }

    // The fallback is resolved per font variant, as the item's own font is, and
    // only once an item in that variant turns out to need it.
    if (!outline.ok || !deps.loadFallbackFontBytes || fallbackAsked.has(key)) continue;
    if (hasGlyphsFor(outline.font, drawnText(item.text))) continue;
    fallbackAsked.add(key);
    const { kind, bytes, synthetic } = await deps.loadFallbackFontBytes(item);
    const fallback = resolveOutline(kind, bytes);
    if (fallback.ok) {
      resolved.set(key, { ...outline, fallback: { font: fallback.font, ...(synthetic ? { synthetic } : {}) } });
    }
  }

  const fontOutlines: FontOutlineProvider = {
    getOutlineFont: (item) => resolved.get(fontVariantKey(item)) ?? { ok: false, reason: 'no-bytes' },
  };

  return documentToSvg(doc, {
    fontOutlines,
    measurer: deps.measurer,
    rasterizer: deps.rasterizer,
  });
}

function collectTextItems(doc: ProjectDocument): TextCanvasItem[] {
  const items: TextCanvasItem[] = [];
  visitNodes(doc.nodes, (node) => {
    if (isCanvasItemNode(node) && node.kind === 'text') items.push(node);
  });
  return items;
}
