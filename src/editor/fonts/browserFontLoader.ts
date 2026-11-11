import type { UploadedFont } from '../document/documentTypes';
import { announceFontRegistration } from './fontRegistrations';
import {
  parseFontSourceName,
  type ParsedFontMetadata,
  type PersistedUploadedFont,
} from './fontModel';

/**
 * The font file behind each face this module added to `document.fonts`. A
 * `FontFace` does not expose its source, so this is the only way back from a face
 * to its file.
 */
const registeredFontFiles = new WeakMap<FontFace, UploadedFont>();

const bundledFontUrls = import.meta.glob('../../assets/fonts/*.{ttf,otf,woff,woff2}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * Serialize a font URL as a quoted CSS `url("…")` for use as a `FontFace` source.
 *
 * The unquoted `url(…)` form cannot contain parentheses, quotes or whitespace: a file
 * such as `Elite Hacker (Corroded).ttf` would make the whole source unparseable, and
 * the font would be skipped. Inside the quotes only `"`, `\` and line breaks need
 * escaping.
 */
function toCssUrl(url: string): string {
  const escaped = url
    .replace(/["\\]/g, '\\$&')
    .replace(/[\n\r\f]/g, (lineBreak) => `\\${lineBreak.charCodeAt(0).toString(16)} `);
  return `url("${escaped}")`;
}

/** Create the `FontFace` for a font source and wait for it to load. The browser cannot render with it yet. */
async function loadFontFace(
  metadata: ParsedFontMetadata,
  source: ArrayBuffer | string
): Promise<FontFace> {
  const fontFace = new FontFace(metadata.family, typeof source === 'string' ? toCssUrl(source) : source, {
    weight: metadata.weight,
    style: metadata.style,
  });
  await fontFace.load();
  return fontFace;
}

/**
 * Add a loaded face to `document.fonts`, which is what lets text render with it,
 * and remember its file. The order of these calls matters: among faces with the
 * same family, weight and style, text renders with the one added last.
 */
function registerFontFace(
  fontFace: FontFace,
  metadata: ParsedFontMetadata,
  kind: UploadedFont['kind']
): UploadedFont {
  document.fonts.add(fontFace);
  const font: UploadedFont = {
    family: metadata.family,
    sourceName: metadata.sourceName,
    weight: metadata.weight,
    style: metadata.style,
    kind,
  };
  registeredFontFiles.set(fontFace, font);
  // Text already on the canvas in this family was drawn without this face.
  announceFontRegistration(metadata.family);
  return font;
}

/**
 * Every bundled and uploaded font file registered so far, in `document.fonts`
 * order. That is the order the browser matches faces in: among faces with the
 * same family, weight and style, the last one added is the one text renders with.
 *
 * It is not filename order. Bundled fonts load in parallel and join
 * `document.fonts` as each finishes, so the order differs from one page load to
 * the next. The exception is files with the same family, weight and style (e.g.
 * "Futura Bold Italic.otf" and "Futura Bold Oblique.otf"): `loadFontEntries`
 * registers those in filename order, so the same one comes last, and is rendered
 * with, on every page load. Resolve against this list, not a sorted one, to get
 * the file the canvas is actually using.
 */
export function listRegisteredFonts(): UploadedFont[] {
  if (typeof document === 'undefined' || !document.fonts) {
    return [];
  }
  const fonts: UploadedFont[] = [];
  for (const fontFace of document.fonts) {
    const font = registeredFontFiles.get(fontFace);
    if (font) {
      fonts.push(font);
    }
  }
  return fonts;
}

export async function registerFontFile(file: File): Promise<UploadedFont> {
  const metadata = parseFontSourceName(file.name);
  const fontFace = await loadFontFace(metadata, await file.arrayBuffer());
  return registerFontFace(fontFace, metadata, 'uploaded');
}

export async function registerUploadedFontBytes(
  record: PersistedUploadedFont,
): Promise<UploadedFont> {
  return registerFontFace(await loadFontFace(record, record.bytes), record, 'uploaded');
}

export async function loadFontEntries(
  fontEntries: Array<[string, string]>
): Promise<UploadedFont[]> {
  // The fonts load in parallel and each is registered as soon as it is ready, so
  // a slow font never keeps the others from being used. The loads finish in a
  // different order on every page load, though, and where several files share a
  // family, weight and style, text renders with the one registered last. Those
  // files therefore wait for each other: each is registered only after the
  // entries before it for the same variant have been registered or have failed,
  // which makes the last such entry the one in use every time.
  const registrationsByVariant = new Map<string, Array<Promise<UploadedFont>>>();
  const loadedFonts = await Promise.allSettled(
    fontEntries.map(([path, url]) => {
      const sourceName = path.split('/').at(-1) ?? 'Bundled Font';
      const metadata = parseFontSourceName(sourceName);
      const variant = JSON.stringify([metadata.family, metadata.weight, metadata.style]);
      const earlierRegistrations = registrationsByVariant.get(variant) ?? [];
      const registration = (async () => {
        const fontFace = await loadFontFace(metadata, url);
        await Promise.allSettled(earlierRegistrations);
        return registerFontFace(fontFace, metadata, 'bundled');
      })();
      registrationsByVariant.set(variant, [...earlierRegistrations, registration]);
      return registration;
    })
  );

  return loadedFonts.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [result.value];
    }
    console.warn('Skipping bundled font that failed to load.', result.reason);
    return [];
  });
}

export async function loadBundledFonts(): Promise<UploadedFont[]> {
  // Vite emits the glob's files sorted by path, so entry order is filename order:
  // of several files for one family, weight and style, the last by name is used.
  return loadFontEntries(Object.entries(bundledFontUrls));
}

/** Resolve a bundled font file's served URL by its source filename, for re-fetching its raw bytes (e.g. SVG export). */
export function getBundledFontUrl(sourceName: string): string | null {
  for (const [path, url] of Object.entries(bundledFontUrls)) {
    if (path === sourceName || path.endsWith(`/${sourceName}`)) {
      return url;
    }
  }
  return null;
}
