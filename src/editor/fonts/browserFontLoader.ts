import type { UploadedFont } from '../document/documentTypes';
import {
  parseFontSourceName,
  type ParsedFontMetadata,
  type PersistedUploadedFont,
} from './fontModel';

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
  return {
    family: metadata.family,
    sourceName: metadata.sourceName,
    weight: metadata.weight,
    style: metadata.style,
    kind,
  };
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
