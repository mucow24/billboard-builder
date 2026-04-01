import type { TextCanvasItem } from '../document/documentTypes';

export type CombinedFontStyle = 'normal' | 'bold' | 'italic' | 'bold italic';

const fontVariantSupportCache = new WeakMap<FontFaceSet, Map<string, boolean>>();
const subscribedFontSets = new WeakSet<FontFaceSet>();

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

export function getRenderableCombinedFontStyle(item: TextCanvasItem): CombinedFontStyle {
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

export function getRenderableCanvasFontDeclaration(item: TextCanvasItem): string {
  const effective = getRenderableCombinedFontStyle(item);
  const parts: string[] = [];
  if (effective.includes('italic')) parts.push('italic');
  if (effective.includes('bold')) parts.push('bold');
  parts.push(`${item.fontSize}px`);
  parts.push(quoteFontFamily(item.fontFamily));
  return parts.join(' ');
}
