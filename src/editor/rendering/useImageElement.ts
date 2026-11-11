import { useEffect, useState } from 'react';

const loadedImageCache = new Map<string, HTMLImageElement>();

// An SVG rendered through an `<img>` evaluates `prefers-color-scheme` against
// its rendering context — for a detached image, the user's OS/browser dark-mode
// setting. So an imported SVG carrying `@media (prefers-color-scheme: dark)`
// rules (common in design-tool and logo exports) paints its dark variant when
// the user is in dark mode — frequently a solid black fill, i.e. a black
// rectangle. Setting `color-scheme` on the SVG root does NOT help: that property
// controls UA-styled colors, not what the media query evaluates to. Attaching
// the element under an explicitly light-schemed ancestor DOES override the
// evaluation, so we load SVG <img> elements inside a hidden light-schemed host —
// rasterizing imports deterministically at their default (light) appearance
// regardless of the viewer's theme. The scheme is captured when `src` is
// assigned and reused when the browser re-rasterizes on redraw, so the element
// must both load and stay attached here.
let lightRasterHost: HTMLElement | null = null;
function getLightRasterHost(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (lightRasterHost?.isConnected) return lightRasterHost;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'color-scheme:light;position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(host);
  lightRasterHost = host;
  return host;
}

function isSvgDataUrl(src: string): boolean {
  return src.startsWith('data:image/svg+xml');
}

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
    // SVGs must rasterize under a forced-light color scheme; assigning `src`
    // while attached to the light host is what captures that scheme.
    const isSvg = isSvgDataUrl(src);
    if (isSvg) {
      getLightRasterHost()?.appendChild(image);
    }
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
      // A failed SVG never enters the cache; detach the orphan from the host.
      if (isSvg) {
        image.remove();
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
