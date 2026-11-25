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
 * `configure(zoom, baseResolution, target)` writes every zoom-dependent
 * setting of one filter. `baseResolution` is the resolution of the surface
 * being drawn to: the device pixel ratio on screen, the export's pixel ratio
 * in a file. `target` says which of the two it is: the screen is drawn again
 * on every frame, so a filter may do less work there wherever that does not
 * show; a file is written once, exactly.
 */
export type FilterTarget = 'screen' | 'export';
export type ZoomScaledFilterConfigure = (
  zoom: number,
  baseResolution: number,
  target: FilterTarget,
) => void;

const configureByFilter = new WeakMap<Filter, ZoomScaledFilterConfigure>();

/**
 * Remember how `filter` is configured for a zoom. It is not configured yet:
 * `configureZoomScaledFilter` does that, before the filter is first drawn and
 * whenever the zoom changes.
 */
export function registerZoomScaledFilter<T extends Filter>(
  filter: T,
  configure: ZoomScaledFilterConfigure,
): T {
  configureByFilter.set(filter, configure);
  return filter;
}

/** Configure one registered filter for `zoom`. Returns whether it was registered. */
export function configureZoomScaledFilter(
  filter: Filter,
  zoom: number,
  baseResolution: number,
  target: FilterTarget = 'screen',
): boolean {
  const configure = configureByFilter.get(filter);
  if (!configure) return false;
  configure(zoom, baseResolution, target);
  return true;
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
  target: FilterTarget = 'screen',
): number {
  let count = 0;
  const visit = (container: Container) => {
    for (const filter of filtersOf(container)) {
      if (configureZoomScaledFilter(filter, zoom, baseResolution, target)) count += 1;
    }
    for (const child of container.children) visit(child);
  };
  visit(root);
  return count;
}
