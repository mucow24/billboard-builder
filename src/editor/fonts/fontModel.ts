import type { DocumentFontReference, UploadedFont } from '../document/documentTypes';

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
