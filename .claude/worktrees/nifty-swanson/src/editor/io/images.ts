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
    if (item.kind !== 'file' || !item.type.startsWith('image/')) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) {
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
