import type { UploadedFont } from '../document/documentTypes';
import {
  createBundledFont,
  createUploadedFont,
  parseFontSourceName,
  type ParsedFontMetadata,
  type PersistedUploadedFont,
} from './fontModel';

const bundledFontUrls = import.meta.glob('../../assets/fonts/*.{ttf,otf,woff,woff2}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type FontRegistrationMetadata = ParsedFontMetadata;

function toRuntimeFont(
  metadata: FontRegistrationMetadata,
  kind: UploadedFont['kind'],
): UploadedFont {
  const parsedMetadata: ParsedFontMetadata = {
    family: metadata.family,
    sourceName: metadata.sourceName,
    weight: metadata.weight,
    style: metadata.style,
  };
  return kind === 'bundled'
    ? createBundledFont(parsedMetadata)
    : createUploadedFont(parsedMetadata);
}

async function registerFontSource(
  metadata: FontRegistrationMetadata,
  source: ArrayBuffer | string,
  kind: UploadedFont['kind']
): Promise<UploadedFont> {
  const fontFace =
    typeof source === 'string'
      ? new FontFace(metadata.family, `url(${source})`, {
          weight: metadata.weight,
          style: metadata.style,
        })
      : new FontFace(metadata.family, source, {
          weight: metadata.weight,
          style: metadata.style,
        });
  await fontFace.load();
  document.fonts.add(fontFace);
  return toRuntimeFont(metadata, kind);
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
