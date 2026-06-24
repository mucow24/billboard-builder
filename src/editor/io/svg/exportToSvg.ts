import type { ProjectDocument, TextCanvasItem } from '../../document/documentTypes';
import { isCanvasItemNode, visitNodes } from '../../document/sceneGraph';
import { documentToSvg } from './documentToSvg';
import { fontVariantKey, resolveOutline, type FontKind } from './fontOutlineProvider';
import type {
  FontOutlineProvider,
  NodeRasterizer,
  OutlineResult,
  SvgExportResult,
  TextMeasurer,
} from './svgExportTypes';

export interface FontBytes {
  kind: FontKind;
  bytes: ArrayBuffer | null;
}

export interface ExportToSvgDeps {
  /** Resolve a text item's font kind and bytes. Async byte loading (fetch/IndexedDB) lives here. */
  loadFontBytes: (item: TextCanvasItem) => Promise<FontBytes>;
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
  for (const item of collectTextItems(doc)) {
    const key = fontVariantKey(item);
    if (resolved.has(key)) continue;
    const { kind, bytes } = await deps.loadFontBytes(item);
    resolved.set(key, resolveOutline(kind, bytes));
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
