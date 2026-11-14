import { useEffect, useRef, type RefObject } from 'react';
import { Container, Rectangle } from 'pixi.js';

import { FocusVeilFilter, type FocusVeilHole } from './focusVeilFilter';

/** How long the veil takes to fade fully in or out. */
export const FOCUS_VEIL_FADE_MS = 160;

// CSS `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)), solved for y at time x.
function cssEase(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bezier = (t: number, p1: number, p2: number) =>
    3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, 0.25, 0.25) < x) lo = mid;
    else hi = mid;
  }
  return bezier((lo + hi) / 2, 0.1, 1);
}

interface UseFocusVeilOptions {
  active: boolean;
  /** The canvas on screen, in the stage's CSS pixels. */
  canvasRect: FocusVeilHole;
  /** The layer the veil filters; it must sit at the stage's origin, unscaled. */
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
  const progressRef = useRef(0);
  const holeRef = useRef(canvasRect);
  holeRef.current = canvasRect;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const { left, top, right, bottom } = canvasRect;
  useEffect(() => {
    filterRef.current?.setHole({ left, top, right, bottom });
    const layer = layerRef.current;
    if (layer instanceof Container && layer.filters && filterRef.current) {
      layer.filterArea = new Rectangle(0, 0, size.width, size.height);
    }
  }, [left, top, right, bottom, size.width, size.height, layerRef]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!(layer instanceof Container)) return;

    const setProgress = (progress: number) => {
      progressRef.current = progress;
      if (progress <= 0) {
        if (layer.filters) layer.filters = null;
        return;
      }
      let filter = filterRef.current;
      if (!filter) {
        filter = new FocusVeilFilter();
        filterRef.current = filter;
      }
      filter.setHole(holeRef.current);
      filter.progress = progress;
      if (!layer.filters) {
        layer.filterArea = new Rectangle(0, 0, sizeRef.current.width, sizeRef.current.height);
        layer.filters = [filter];
      }
    };

    const from = progressRef.current;
    const target = active ? 1 : 0;
    const duration = FOCUS_VEIL_FADE_MS * Math.abs(target - from);
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const t = duration > 0 ? Math.min(1, (performance.now() - start) / duration) : 1;
      setProgress(from + (target - from) * cssEase(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [active, layerRef, rendererReady]);

  useEffect(
    () => () => {
      filterRef.current?.destroy();
      filterRef.current = null;
    },
    [],
  );
}
