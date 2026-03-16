import type { TextCanvasItem } from '../document/documentTypes';

export type CombinedFontStyle = 'normal' | 'bold' | 'italic' | 'bold italic';

function quoteFontFamily(fontFamily: string): string {
  return JSON.stringify(fontFamily);
}

export function getCombinedFontStyle(
  fontStyle: TextCanvasItem['fontStyle'],
  fontWeight: TextCanvasItem['fontWeight']
): CombinedFontStyle {
  if (fontWeight === 'bold' && fontStyle === 'italic') {
    return 'bold italic';
  }
  if (fontWeight === 'bold') {
    return 'bold';
  }
  if (fontStyle === 'italic') {
    return 'italic';
  }
  return 'normal';
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
  const cssWeight = weight === 'bold' ? '700' : '400';
  const cssStyle = style === 'italic' ? 'italic' : 'normal';
  return fonts.check(`${cssStyle} ${cssWeight} 16px ${quoteFontFamily(family)}`);
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

export function getCanvasFontDeclaration(item: TextCanvasItem): string {
  const parts: string[] = [];
  if (item.fontStyle !== 'normal') parts.push(item.fontStyle);
  if (item.fontWeight !== 'normal') parts.push(item.fontWeight);
  parts.push(`${item.fontSize}px`);
  parts.push(quoteFontFamily(item.fontFamily));
  return parts.join(' ');
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
