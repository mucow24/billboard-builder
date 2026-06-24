import type { TextCanvasItem } from '../../document/documentTypes';
import { parseOutlineFont } from './glyphOutline';
import type { OutlineResult } from './svgExportTypes';

export type FontKind = 'system' | 'bundled' | 'uploaded';

/** Stable key for a text item's resolved font variant (family + weight + style). */
export function fontVariantKey(item: Pick<TextCanvasItem, 'fontFamily' | 'fontWeight' | 'fontStyle'>): string {
  return `${item.fontFamily}|${item.fontWeight}|${item.fontStyle}`;
}

/**
 * Decide a text item's outline availability from its font kind and (for embeddable
 * fonts) its bytes. System fonts have no obtainable bytes; bundled/uploaded fonts
 * are parsed and may still fail. This is the tested core of the browser provider;
 * the async byte-loading is assembled in `exportToSvg`.
 */
export function resolveOutline(kind: FontKind, bytes: ArrayBuffer | null): OutlineResult {
  if (kind === 'system') return { ok: false, reason: 'system-font' };
  if (!bytes) return { ok: false, reason: 'no-bytes' };
  const font = parseOutlineFont(bytes);
  return font ? { ok: true, font } : { ok: false, reason: 'parse-failed' };
}
