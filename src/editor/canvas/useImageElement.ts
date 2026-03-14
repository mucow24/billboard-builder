import { useEffect, useState } from 'react';

export function useImageElement(src: string) {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImageElement(image);
    image.src = src;
  }, [src]);

  return imageElement;
}
