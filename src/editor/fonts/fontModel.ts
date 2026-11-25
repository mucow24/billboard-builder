import type { DocumentFontReference, UploadedFont } from '../document/documentTypes';
import { isEmojiFallbackFamily } from './emojiFallback';

export interface ParsedFontMetadata {
  family: string;
  sourceName: string;
  weight: UploadedFont['weight'];
  style: UploadedFont['style'];
}

export interface PersistedUploadedFont extends UploadedFont {
  bytes: ArrayBuffer;
  kind: 'uploaded';
}

const WEIGHT_TOKENS = new Set(['bold']);
// A word that turns the "Bold" after it into another weight: "SemiBold", "Extra Bold".
const BOLD_MODIFIER_TOKENS = new Set(['semi', 'demi', 'extra', 'ultra']);
const ITALIC_TOKENS = new Set(['italic', 'oblique']);
const NORMAL_TOKENS = new Set(['regular', 'roman', 'book']);

function splitFontTokens(fileName: string): string[] {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function parseFontSourceName(fileName: string): ParsedFontMetadata {
  const tokens = splitFontTokens(fileName);
  let style: UploadedFont['style'] = 'normal';
  let weight: UploadedFont['weight'] = '400';
  const familyTokens: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (WEIGHT_TOKENS.has(lower)) {
      const modifier = familyTokens.at(-1);
      if (modifier && BOLD_MODIFIER_TOKENS.has(modifier.toLowerCase())) {
        // Not the bold of the family but a weight of its own, which the editor
        // lists as a separate regular-weight entry: the two tokens go back
        // together as one word of the name ("Roboto SemiBold").
        familyTokens[familyTokens.length - 1] = modifier + token;
        continue;
      }
      weight = '700';
      continue;
    }
    if (ITALIC_TOKENS.has(lower)) {
      style = 'italic';
      continue;
    }
    if (NORMAL_TOKENS.has(lower)) {
      continue;
    }
    familyTokens.push(token);
  }

  return {
    family: familyTokens.join(' ').trim() || 'Uploaded Font',
    sourceName: fileName,
    weight,
    style,
  };
}

/**
 * Every font-list entry a font file is registered as.
 *
 * A Bold file is two: the bold face of the family's own entry ("Roboto" at
 * weight 700, which the Bold button and documents from before Bold was a
 * weight of its own use), and an entry of its own, "Roboto Bold" at weight
 * 400, which the font menu lists among the family's weights like "Roboto
 * Light". The menu leaves out the first, and the plain "Roboto" altogether
 * where the family has no other upright file, so that a family is never
 * offered as a plain "Roboto" that draws bold (see `buildFontOptions`). The emoji fallback's family gets no
 * second entry: it draws no letters of its own, and is not listed anyway.
 *
 * Derived from the file's own metadata wherever a file is registered (the font
 * loader, which adds a face for each entry, and the font list), so fonts
 * stored before Bold had an entry of its own get one too, and only the file's
 * own metadata is ever stored.
 */
export function fontEntriesForFile<T extends ParsedFontMetadata>(metadata: T): T[] {
  if (metadata.weight !== '700' || isEmojiFallbackFamily(metadata.family)) {
    return [metadata];
  }
  return [metadata, { ...metadata, family: `${metadata.family} Bold`, weight: '400' }];
}

export function fontFamilyFromSourceName(fileName: string): string {
  return parseFontSourceName(fileName).family;
}

export function createBundledFont(metadata: ParsedFontMetadata): UploadedFont {
  return { ...metadata, kind: 'bundled' };
}

export function createUploadedFont(metadata: ParsedFontMetadata): UploadedFont {
  return { ...metadata, kind: 'uploaded' };
}

export function toFontReference(font: UploadedFont): DocumentFontReference {
  return {
    family: font.family,
    sourceName: font.sourceName,
    kind: font.kind,
  };
}
