/**
 * Shows text in a Google font that has not been imported.
 *
 * Google's stylesheet service cuts a font down to the letters it is asked for
 * (`text=`): a family's name set in the family is a file of two or three
 * kilobytes, which is what lets a list of suggestions show each family in its
 * own typeface without downloading any of them. The service needs no API key.
 *
 * The cut-down faces are registered under names of their own
 * (`gf-preview-…`), never under the family's name, so no text on the canvas can
 * come to be drawn with one, and they are all removed again with
 * `releaseGoogleFontPreviews`.
 */
import type { GoogleFontVariant } from './googleFontVariants';

const STYLESHEET_ENDPOINT = 'https://fonts.googleapis.com/css2';
/** Where Google serves font files from. No face is loaded from anywhere else. */
const FONT_FILE_ORIGIN = 'https://fonts.gstatic.com';

export interface GoogleFontCssFace {
  weight: number;
  italic: boolean;
  /** The address of the font file. */
  source: string;
}

/**
 * The address of the stylesheet for the given styles of `family`, each cut down
 * to the characters of `text`.
 */
export function buildGoogleFontCssUrl(
  family: string,
  variants: readonly GoogleFontVariant[],
  text: string,
): string {
  // The service wants the styles in order: upright before italic, then by weight.
  const styles = [
    ...new Set(
      variants
        .slice()
        .sort(
          (left, right) =>
            Number(left.italic) - Number(right.italic) || left.weight - right.weight,
        )
        .map((variant) => `${variant.italic ? 1 : 0},${variant.weight}`),
    ),
  ];
  const characters = [...new Set(text)].join('');
  return (
    `${STYLESHEET_ENDPOINT}?family=${encodeURIComponent(family)}:ital,wght@${styles.join(';')}` +
    `&text=${encodeURIComponent(characters)}`
  );
}

/** The faces a stylesheet from the service declares. A face whose file is not Google's is left out. */
export function parseGoogleFontCss(css: string): GoogleFontCssFace[] {
  const faces: GoogleFontCssFace[] = [];
  for (const [, block] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const source = /src:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/.exec(block)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const style = /font-style:\s*([a-z]+)/.exec(block)?.[1];
    if (!source || !source.startsWith(`${FONT_FILE_ORIGIN}/`)) {
      continue;
    }
    faces.push({
      weight: weight === undefined ? 400 : Number(weight),
      italic: style === 'italic',
      source,
    });
  }
  return faces;
}

export interface GoogleFontPreviewRequest {
  /** Names this preview among the others; asking for the same one again gives the one there is. */
  id: string;
  family: string;
  variants: readonly GoogleFontVariant[];
  /** The text the preview will be used for: only its characters are loaded. */
  text: string;
  /**
   * Register the face as a regular one whatever its real weight and style, so
   * that plain text set in the preview's name is drawn with it. For previews of
   * a single style.
   */
  asRegular?: boolean;
}

export interface GoogleFontPreview {
  /** The CSS font family to set the previewed text in. */
  cssFamily: string;
}

const previews = new Map<string, Promise<GoogleFontPreview>>();
const previewFaces = new Set<FontFace>();
// Goes up with every release: a preview still loading then is not registered.
let generation = 0;

async function loadPreview(
  request: GoogleFontPreviewRequest,
  startedIn: number,
): Promise<GoogleFontPreview> {
  const response = await fetch(buildGoogleFontCssUrl(request.family, request.variants, request.text));
  if (!response.ok) {
    throw new Error(`Google Fonts has no preview of ${request.family} (${response.status}).`);
  }
  const faces = parseGoogleFontCss(await response.text());
  if (faces.length === 0) {
    throw new Error(`Google Fonts has no preview of ${request.family}.`);
  }
  const cssFamily = `gf-preview-${request.id}`;
  const fontFaces = await Promise.all(
    faces.map(async (face) => {
      const fontFace = new FontFace(
        cssFamily,
        `url(${JSON.stringify(face.source)})`,
        request.asRegular
          ? {}
          : { weight: String(face.weight), style: face.italic ? 'italic' : 'normal' },
      );
      await fontFace.load();
      return fontFace;
    }),
  );
  if (startedIn !== generation) {
    throw new Error('The preview is no longer wanted.');
  }
  for (const fontFace of fontFaces) {
    document.fonts.add(fontFace);
    previewFaces.add(fontFace);
  }
  return { cssFamily };
}

/**
 * Loads the faces to preview `request.family` with, and resolves to the CSS
 * family that draws with them. Rejects when the preview cannot be had; the
 * caller then shows the text in an ordinary font.
 */
export function loadGoogleFontPreview(request: GoogleFontPreviewRequest): Promise<GoogleFontPreview> {
  const existing = previews.get(request.id);
  if (existing) {
    return existing;
  }
  const preview = loadPreview(request, generation);
  previews.set(request.id, preview);
  return preview;
}

/** Removes every preview face from the page. */
export function releaseGoogleFontPreviews(): void {
  generation += 1;
  for (const fontFace of previewFaces) {
    document.fonts.delete(fontFace);
  }
  previewFaces.clear();
  previews.clear();
}
