import { useEffect, useState } from 'react';

/** How long the zoom has to hold still before content is drawn again for it. */
export const ZOOM_SETTLE_MS = 150;

/**
 * The zoom that content is rasterised for: text, SVG images and generators,
 * which are drawn into textures as large as the zoom shows them.
 *
 * It is `zoom` once `zoom` has held still for `ZOOM_SETTLE_MS`, and the zoom
 * from before the change until then. Drawing those textures again is the
 * costly part of a zoom step, and a turn of the wheel or a pinch is many
 * steps in a row: in between, the textures that are there are scaled, which
 * costs nothing, and they are drawn once for the zoom the gesture ends on.
 * Until then zoomed-in content is a little soft.
 */
export function useSettledZoom(zoom: number): number {
  const [settledZoom, setSettledZoom] = useState(zoom);
  useEffect(() => {
    if (zoom === settledZoom) return undefined;
    const timer = window.setTimeout(() => setSettledZoom(zoom), ZOOM_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [zoom, settledZoom]);
  return settledZoom;
}
