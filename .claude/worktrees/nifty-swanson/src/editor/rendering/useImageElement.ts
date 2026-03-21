import { useEffect, useState } from 'react';

export function useImageElement(src: string) {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let isActive = true;
    const image = new Image();
    setImageElement(null);
    image.onload = () => {
      if (isActive) {
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
