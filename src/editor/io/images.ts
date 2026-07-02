import { isSvgImageFile, normalizeSvgForImport, svgTextToDataUrl } from './svgImageImport';

export interface ImportedImageAsset {
  src: string;
  mimeType: string;
  width: number;
  height: number;
  sourceName: string;
}

export function getFirstImageFileFromClipboardData(data: DataTransfer | null): File | null {
  if (!data) {
    return null;
  }

  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file') {
      continue;
    }
    // SVG files dragged from some file managers arrive with an empty type, so
    // fall back to the extension check on the materialized file.
    if (!item.type.startsWith('image/') && item.type !== '') {
      continue;
    }

    const file = item.getAsFile();
    if (file && (file.type.startsWith('image/') || isSvgImageFile(file))) {
      return file;
    }
  }

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/') || isSvgImageFile(file)) {
      return file;
    }
  }

  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error('Failed to load image preview'));
    image.src = src;
  });
}

export async function importImageFile(file: File): Promise<ImportedImageAsset> {
  if (isSvgImageFile(file)) {
    return importSvgImageFile(file);
  }

  const src = await readFileAsDataUrl(file);
  const dimensions = await getImageDimensions(src);

  return {
    src,
    mimeType: file.type || 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    sourceName: file.name,
  };
}

// SVG sizing comes from parsing the markup, not from the browser-reported
// natural size — files without explicit dimensions report browser-dependent
// (or zero) natural sizes. The Image load stays as a renderability check.
async function importSvgImageFile(file: File): Promise<ImportedImageAsset> {
  const normalized = normalizeSvgForImport(await readFileAsText(file));
  const src = svgTextToDataUrl(normalized.svgText);
  await getImageDimensions(src);

  return {
    src,
    mimeType: 'image/svg+xml',
    width: normalized.width,
    height: normalized.height,
    sourceName: file.name,
  };
}
