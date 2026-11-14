import type { Container, Filter } from 'pixi.js';

/**
 * Filters whose settings depend on the viewport zoom.
 *
 * Pixi filters work in screen space: a blur strength or a shadow offset is a
 * distance on the render target, not in the item's own coordinates. The item
 * layer therefore multiplies those settings by the zoom. Anything that draws
 * the same display objects at another scale (the PNG export draws the canvas
 * at 1:1) has to set them again for that scale, and put them back afterwards.
 *
 * `configure(zoom, baseResolution)` writes every zoom-dependent setting of one
 * filter. `baseResolution` is the resolution of the surface being drawn to:
 * the device pixel ratio on screen, the export's pixel ratio in a file.
 */
export type ZoomScaledFilterConfigure = (zoom: number, baseResolution: number) => void;

const configureByFilter = new WeakMap<Filter, ZoomScaledFilterConfigure>();

/** Configure `filter` for `zoom` now and remember how, for later re-scaling. */
export function registerZoomScaledFilter<T extends Filter>(
  filter: T,
  zoom: number,
  baseResolution: number,
  configure: ZoomScaledFilterConfigure,
): T {
  configureByFilter.set(filter, configure);
  configure(zoom, baseResolution);
  return filter;
}

function filtersOf(container: Container): readonly Filter[] {
  const filters = container.filters as Filter | readonly Filter[] | null | undefined;
  if (!filters) return [];
  return Array.isArray(filters) ? (filters as readonly Filter[]) : [filters as Filter];
}

/**
 * Re-configure every registered filter on `root` and its descendants for
 * `zoom`. Returns how many filters were changed.
 */
export function configureZoomScaledFilters(
  root: Container,
  zoom: number,
  baseResolution: number,
): number {
  let count = 0;
  const visit = (container: Container) => {
    for (const filter of filtersOf(container)) {
      const configure = configureByFilter.get(filter);
      if (configure) {
        configure(zoom, baseResolution);
        count += 1;
      }
    }
    for (const child of container.children) visit(child);
  };
  visit(root);
  return count;
}
