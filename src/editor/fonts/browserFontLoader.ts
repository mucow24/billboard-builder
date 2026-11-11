import type { UploadedFont } from '../document/documentTypes';
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
  return font;
}

/**
 * Every bundled and uploaded font file registered so far, in `document.fonts`
 * order. That is the order the browser matches faces in: among faces with the
 * same family, weight and style, the last one added is the one text renders with.
 *
 * Bundled files are listed in the order `loadFontEntries` was given them
 * (filename order), whatever order their loads finished in. So of two
 * same-variant files (e.g. "Futura Bold Italic.otf" and "Futura Bold
 * Oblique.otf") the same one comes last, and is rendered with, on every page
 * load. Uploaded files are listed where they were registered, which at startup
 * is after the bundled ones. Resolve against this list to get the file the
 * canvas is actually using.
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
  // The fonts load in parallel, and finish in a different order on every page load.
  const loads = await Promise.allSettled(
    fontEntries.map(async ([path, url]) => {
      const sourceName = path.split('/').at(-1) ?? 'Bundled Font';
      const metadata = parseFontSourceName(sourceName);
      return { metadata, fontFace: await loadFontFace(metadata, url) };
    })
  );

  // So no face is registered until every load has settled, and then they are
  // registered in entry order: where two files share a family, weight and style,
  // the same one is added last, and so rendered with, every time.
  const fonts: UploadedFont[] = [];
  for (const load of loads) {
    if (load.status === 'fulfilled') {
      fonts.push(registerFontFace(load.value.fontFace, load.value.metadata, 'bundled'));
    } else {
      console.warn('Skipping bundled font that failed to load.', load.reason);
    }
  }
  return fonts;
}

export async function loadBundledFonts(): Promise<UploadedFont[]> {
  // Vite emits the glob's files sorted by path, so entry order is filename order.
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
