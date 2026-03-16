import type { UploadedFont } from '../document/documentTypes';
import {
  createBundledFont,
  createUploadedFont,
  parseFontSourceName,
} from './fontModel';

const bundledFontUrls = import.meta.glob('../../assets/fonts/*.{ttf,otf,woff,woff2}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

async function registerFontSource(
  sourceName: string,
  source: ArrayBuffer | string,
  kind: UploadedFont['kind']
): Promise<UploadedFont> {
  const parsed = parseFontSourceName(sourceName);
  const fontFace =
    typeof source === 'string'
      ? new FontFace(parsed.family, `url(${source})`, {
          weight: parsed.weight,
          style: parsed.style,
        })
      : new FontFace(parsed.family, source, {
          weight: parsed.weight,
          style: parsed.style,
        });
  await fontFace.load();
  document.fonts.add(fontFace);
  return kind === 'bundled' ? createBundledFont(parsed) : createUploadedFont(parsed);
}

export async function registerFontFile(file: File): Promise<UploadedFont> {
  const arrayBuffer = await file.arrayBuffer();
  return registerFontSource(file.name, arrayBuffer, 'uploaded');
}

export async function loadFontEntries(
  fontEntries: Array<[string, string]>
): Promise<UploadedFont[]> {
  const loadedFonts = await Promise.allSettled(
    fontEntries.map(async ([path, url]) => {
      const sourceName = path.split('/').at(-1) ?? 'Bundled Font';
      return registerFontSource(sourceName, url, 'bundled');
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
