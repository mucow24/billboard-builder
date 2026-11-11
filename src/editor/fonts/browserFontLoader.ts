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

async function registerFontSource(
  metadata: ParsedFontMetadata,
  source: ArrayBuffer | string,
  kind: UploadedFont['kind']
): Promise<UploadedFont> {
  const fontFace = new FontFace(metadata.family, typeof source === 'string' ? `url(${source})` : source, {
    weight: metadata.weight,
    style: metadata.style,
  });
  await fontFace.load();
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
 * It is not filename order. Bundled fonts load in parallel and join
 * `document.fonts` as each finishes, so which of two same-variant files (e.g.
 * "Futura Bold Italic.otf" and "Futura Bold Oblique.otf") comes last differs
 * from one page load to the next. Resolve against this list, not a sorted one,
 * to get the file the canvas is actually using.
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
  const arrayBuffer = await file.arrayBuffer();
  return registerFontSource(parseFontSourceName(file.name), arrayBuffer, 'uploaded');
}

export async function registerUploadedFontBytes(
  record: PersistedUploadedFont,
): Promise<UploadedFont> {
  return registerFontSource(record, record.bytes, 'uploaded');
}

export async function loadFontEntries(
  fontEntries: Array<[string, string]>
): Promise<UploadedFont[]> {
  const loadedFonts = await Promise.allSettled(
    fontEntries.map(async ([path, url]) => {
      const sourceName = path.split('/').at(-1) ?? 'Bundled Font';
      return registerFontSource(parseFontSourceName(sourceName), url, 'bundled');
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
