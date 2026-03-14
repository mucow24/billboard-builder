import type { DocumentFontReference, UploadedFont } from '../model/types';

const bundledFontUrls = import.meta.glob('../assets/fonts/*.{ttf,otf,woff,woff2}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function fontFamilyFromSourceName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim() || 'Uploaded Font';
}

async function registerFontSource(
  family: string,
  sourceName: string,
  source: ArrayBuffer | string
): Promise<UploadedFont> {
  const fontFace =
    typeof source === 'string'
      ? new FontFace(family, `url(${source})`)
      : new FontFace(family, source);
  await fontFace.load();
  document.fonts.add(fontFace);
  return {
    family,
    sourceName,
  };
}

export async function registerFontFile(file: File): Promise<UploadedFont> {
  const arrayBuffer = await file.arrayBuffer();
  const family = fontFamilyFromSourceName(file.name);
  return registerFontSource(family, file.name, arrayBuffer);
}

export async function loadBundledFonts(): Promise<UploadedFont[]> {
  const fontEntries = Object.entries(bundledFontUrls);
  const fonts = await Promise.all(
    fontEntries.map(async ([path, url]) => {
      const sourceName = path.split('/').at(-1) ?? 'Bundled Font';
      return registerFontSource(fontFamilyFromSourceName(sourceName), sourceName, url);
    })
  );

  return fonts;
}

export function toFontReference(font: UploadedFont): DocumentFontReference {
  return {
    ...font,
    kind: 'uploaded',
  };
}

export function findMissingFonts(
  fonts: DocumentFontReference[],
  availableFonts: UploadedFont[]
): string[] {
  return fonts
    .filter((font) => font.kind === 'uploaded')
    .filter(
      (font) =>
        !availableFonts.some(
          (availableFont) =>
            availableFont.family === font.family &&
            availableFont.sourceName === font.sourceName
        )
    )
    .map((font) => font.family);
}
