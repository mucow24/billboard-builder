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

/**
 * The font file a family renders with at the given weight and style — the choice
 * the browser's CSS font matching makes among the family's registered faces, so
 * callers that need the file itself (SVG export) agree with what is on the canvas.
 *
 * Preference order: the exact variant; then the requested style at the other
 * weight; then the other style, requested weight first. Style outranks weight, so
 * bold italic falls back italic → bold → regular, the same order as
 * `getRenderableCombinedFontStyle`. A family is never left without a file while
 * it has one.
 *
 * `fonts` must be in registration order: when several files share a weight and
 * style, the one registered last wins, as it does in the browser.
 */
export function findFontForVariant(
  fonts: readonly UploadedFont[],
  family: string,
  weight: UploadedFont['weight'],
  style: UploadedFont['style']
): UploadedFont | undefined {
  const otherWeight = weight === '700' ? '400' : '700';
  const otherStyle = style === 'italic' ? 'normal' : 'italic';
  const preferences = [
    [weight, style],
    [otherWeight, style],
    [weight, otherStyle],
    [otherWeight, otherStyle],
  ] as const;

  for (const [candidateWeight, candidateStyle] of preferences) {
    for (let index = fonts.length - 1; index >= 0; index -= 1) {
      const font = fonts[index];
      if (
        font.family === family &&
        font.weight === candidateWeight &&
        font.style === candidateStyle
      ) {
        return font;
      }
    }
  }
  return undefined;
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
