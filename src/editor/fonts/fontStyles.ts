import type { TextCanvasItem, UploadedFont } from '../document/documentTypes';
import { inBoldFont, resolveBoldFont } from './boldWeight';
import { listRegisteredFonts } from './browserFontLoader';
import { textFontFamilies } from './emojiFallback';
import { subscribeToFontRegistrations } from './fontRegistrations';

export type CombinedFontStyle = 'normal' | 'bold' | 'italic' | 'bold italic';

const fontVariantSupportCache = new WeakMap<FontFaceSet, Map<string, boolean>>();
const subscribedFontSets = new WeakSet<FontFaceSet>();

// The font set's own `loadingdone` covers faces that load while they are in the
// set. This app adds its faces already loaded, which fires no event, so the font
// loader's announcement is what says a cached answer may be out of date.
subscribeToFontRegistrations(() => {
  if (typeof document !== 'undefined' && document.fonts) {
    fontVariantSupportCache.get(document.fonts)?.clear();
  }
});

function quoteFontFamily(fontFamily: string): string {
  return JSON.stringify(fontFamily);
}

function getFontVariantCacheKey(
  family: string,
  weight: TextCanvasItem['fontWeight'],
  style: TextCanvasItem['fontStyle']
) {
  return `${family}::${weight}::${style}`;
}

function ensureFontVariantCache(fonts: FontFaceSet) {
  let cache = fontVariantSupportCache.get(fonts);
  if (!cache) {
    cache = new Map<string, boolean>();
    fontVariantSupportCache.set(fonts, cache);
  }

  if (!subscribedFontSets.has(fonts) && typeof fonts.addEventListener === 'function') {
    const clearCache = () => {
      cache?.clear();
    };
    fonts.addEventListener('loadingdone', clearCache);
    fonts.addEventListener('loadingerror', clearCache);
    subscribedFontSets.add(fonts);
  }

  return cache;
}

function canUseFontVariant(
  family: string,
  weight: TextCanvasItem['fontWeight'],
  style: TextCanvasItem['fontStyle']
): boolean {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return true;
  }
  const fonts = document.fonts as FontFaceSet;
  if (typeof fonts.check !== 'function') {
    return true;
  }
  const cache = ensureFontVariantCache(fonts);
  const cacheKey = getFontVariantCacheKey(family, weight, style);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const cssWeight = weight === 'bold' ? '700' : '400';
  const cssStyle = style === 'italic' ? 'italic' : 'normal';
  const supported = fonts.check(`${cssStyle} ${cssWeight} 16px ${quoteFontFamily(family)}`);
  cache.set(cacheKey, supported);
  return supported;
}

/** The registered font files, or none where the browser's font set cannot be listed (as `canUseFontVariant` is permissive there). */
function registeredFonts(): UploadedFont[] {
  const fonts = typeof document === 'undefined' ? undefined : (document.fonts as Partial<FontFaceSet> | undefined);
  return typeof fonts?.[Symbol.iterator] === 'function' ? listRegisteredFonts() : [];
}

const drawnBoldFonts = new Map<string, ReturnType<typeof resolveBoldFont>>();

// A file registered for any weight of a typeface may be what its bold text is now drawn with.
subscribeToFontRegistrations(() => drawnBoldFonts.clear());

/**
 * `item` as the browser is asked to draw it: itself, or, where it is bold and
 * its typeface has a heavier weight registered, the same text in that weight's
 * family (see `drawnFontOf` in `boldWeight`). Kept by family and style until
 * the next font is registered, since every measurement of a text comes here.
 */
export function getDrawnFontItem<T extends Pick<TextCanvasItem, 'fontFamily' | 'fontWeight' | 'fontStyle'>>(
  item: T,
): T {
  if (item.fontWeight !== 'bold') return item;
  const key = `${item.fontFamily}::${item.fontStyle}`;
  let bold = drawnBoldFonts.get(key);
  if (bold === undefined) {
    bold = resolveBoldFont(item.fontFamily, item.fontStyle, registeredFonts());
    drawnBoldFonts.set(key, bold);
  }
  return inBoldFont(item, bold);
}

/**
 * The style `item` is drawn in, of the styles the browser can draw its family
 * in. `item` is the text as drawn (`getDrawnFontItem`): its family is the one
 * the browser is asked for.
 */
function renderableCombinedFontStyleOf(
  item: Pick<TextCanvasItem, 'fontFamily' | 'fontWeight' | 'fontStyle'>,
): CombinedFontStyle {
  const wantsBold = item.fontWeight === 'bold';
  const wantsItalic = item.fontStyle === 'italic';

  if (wantsBold && wantsItalic) {
    if (canUseFontVariant(item.fontFamily, 'bold', 'italic')) {
      return 'bold italic';
    }
    if (canUseFontVariant(item.fontFamily, 'normal', 'italic')) {
      return 'italic';
    }
    if (canUseFontVariant(item.fontFamily, 'bold', 'normal')) {
      return 'bold';
    }
    return 'normal';
  }

  if (wantsBold) {
    return canUseFontVariant(item.fontFamily, 'bold', 'normal') ? 'bold' : 'normal';
  }

  if (wantsItalic) {
    return canUseFontVariant(item.fontFamily, 'normal', 'italic') ? 'italic' : 'normal';
  }

  return 'normal';
}

/**
 * The bold and italic the browser is asked for when it draws `item`. Bold that
 * a heavier weight of the typeface draws is not among them: that text is drawn
 * in the heavier weight's family, in its regular weight (`getDrawnFontItem`).
 */
export function getRenderableCombinedFontStyle(item: TextCanvasItem): CombinedFontStyle {
  return renderableCombinedFontStyleOf(getDrawnFontItem(item));
}

/**
 * The canvas `font` that `item` is drawn with: its renderable style, its size,
 * and the family it is drawn in (`getDrawnFontItem`) followed by the emoji
 * fallback (see `textFontFamilies`), the same font Pixi draws it with.
 */
export function getRenderableCanvasFontDeclaration(item: TextCanvasItem): string {
  const drawn = getDrawnFontItem(item);
  const effective = renderableCombinedFontStyleOf(drawn);
  const parts: string[] = [];
  if (effective.includes('italic')) parts.push('italic');
  if (effective.includes('bold')) parts.push('bold');
  parts.push(`${item.fontSize}px`);
  parts.push(textFontFamilies(drawn.fontFamily).map(quoteFontFamily).join(', '));
  return parts.join(' ');
}
