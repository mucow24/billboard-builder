import { useEffect, useState } from 'react';

const loadedImageCache = new Map<string, HTMLImageElement>();

export function resetImageElementCacheForTests() {
  loadedImageCache.clear();
}

export function useImageElement(src: string) {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    () => (src ? loadedImageCache.get(src) ?? null : null),
  );

  useEffect(() => {
    if (!src) {
      setImageElement(null);
      return;
    }

    const cachedImage = loadedImageCache.get(src) ?? null;
    if (cachedImage) {
      setImageElement(cachedImage);
      return;
    }

    let isActive = true;
    const image = new Image();
    setImageElement(null);
    image.onload = () => {
      if (isActive) {
        loadedImageCache.set(src, image);
        setImageElement(image);
      }
    };
    image.onerror = () => {
      if (isActive) {
        setImageElement(null);
      }
    };
    image.src = src;

    return () => {
      isActive = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  return imageElement;
}
