import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { Container, Rectangle } from 'pixi.js';

import { FocusVeilFilter, type FocusVeilHole } from './focusVeilFilter';

/** How long the veil takes to fade fully in or out. */
export const FOCUS_VEIL_FADE_MS = 160;

// Eases the fade in and out; close enough to CSS `ease` to look the same.
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

interface UseFocusVeilOptions {
  active: boolean;
  /** The canvas on screen, in the stage's CSS pixels. */
  canvasRect: FocusVeilHole;
  /**
   * The layer the veil filters. It must sit at the stage's origin, unscaled:
   * the filter places the hole relative to the filtered area, which this hook
   * pins to (0, 0, width, height).
   */
  layerRef: RefObject<Container | null>;
  rendererReady: boolean;
  size: { width: number; height: number };
}

/**
 * Fades the canvas-focus veil (see FocusVeilFilter) in and out on `layerRef`.
 * The filter is attached only while the veil is at least partly visible, so
 * an inactive veil costs nothing.
 */
export function useFocusVeil({ active, canvasRect, layerRef, rendererReady, size }: UseFocusVeilOptions) {
  const filterRef = useRef<FocusVeilFilter | null>(null);
  // The layer the filter is attached to, kept for unmount: by then React has
  // already cleared layerRef.
  const attachedLayerRef = useRef<Container | null>(null);
  const progressRef = useRef(0);
  const holeRef = useRef(canvasRect);
  holeRef.current = canvasRect;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // A layout effect, so the hole moves in the same commit as the pan and
  // zoom it is computed from, and never trails the canvas by a frame.
  const { left, top, right, bottom } = canvasRect;
  useLayoutEffect(() => {
    filterRef.current?.setHole({ left, top, right, bottom });
    const layer = attachedLayerRef.current;
    if (layer && !layer.destroyed) {
      layer.filterArea = new Rectangle(0, 0, size.width, size.height);
    }
  }, [left, top, right, bottom, size.width, size.height]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!(layer instanceof Container)) return;

    const setProgress = (progress: number) => {
      progressRef.current = progress;
      if (progress <= 0) {
        if (layer.filters) layer.filters = null;
        attachedLayerRef.current = null;
        return;
      }
      let filter = filterRef.current;
      if (!filter) {
        filter = new FocusVeilFilter();
        filterRef.current = filter;
      }
      filter.setHole(holeRef.current);
      filter.progress = progress;
      // Compare with the filter itself, not just "has filters": after a
      // remount the layer may still hold a filter that has been destroyed.
      if (layer.filters?.[0] !== filter) {
        layer.filterArea = new Rectangle(0, 0, sizeRef.current.width, sizeRef.current.height);
        layer.filters = [filter];
      }
      attachedLayerRef.current = layer;
    };

    const from = progressRef.current;
    const target = active ? 1 : 0;
    const duration = FOCUS_VEIL_FADE_MS * Math.abs(target - from);
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const t = duration > 0 ? Math.min(1, (performance.now() - start) / duration) : 1;
      setProgress(from + (target - from) * smoothstep(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [active, layerRef, rendererReady]);

  useEffect(
    () => () => {
      const layer = attachedLayerRef.current;
      if (layer && !layer.destroyed) layer.filters = null;
      attachedLayerRef.current = null;
      filterRef.current?.destroy();
      filterRef.current = null;
    },
    [],
  );
}
