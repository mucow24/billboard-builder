import type { DocumentFontReference, UploadedFont } from '../document/documentTypes';

export function familySupportsWeight(
  fonts: UploadedFont[],
  family: string,
  weight: UploadedFont['weight']
): boolean {
  return fonts.some((font) => font.family === family && font.weight === weight);
}

export function familySupportsStyle(
  fonts: UploadedFont[],
  family: string,
  style: UploadedFont['style']
): boolean {
  return fonts.some((font) => font.family === family && font.style === style);
}

export function familySupportsVariant(
  fonts: UploadedFont[],
  family: string,
  weight: UploadedFont['weight'],
  style: UploadedFont['style']
): boolean {
  return fonts.some(
    (font) => font.family === family && font.weight === weight && font.style === style
  );
}

export function findMissingFonts(
  fonts: DocumentFontReference[],
  availableFonts: UploadedFont[]
): string[] {
  return fonts
    .filter((font) => font.kind !== 'system')
    .filter(
      (font) =>
        !availableFonts.some(
          (availableFont) =>
            availableFont.family === font.family && availableFont.kind === font.kind
        )
    )
    .map((font) => font.family)
    .filter((family, index, list) => list.indexOf(family) === index);
}
