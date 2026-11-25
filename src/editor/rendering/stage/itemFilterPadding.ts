/**
 * How far the blur and drop-shadow filters of an item reach, as the padding
 * Pixi is given for them, in pixels of the surface drawn to at `zoom`.
 *
 * A filter covers its object's bounds, cut to what is in view, plus its
 * padding. A filter nested inside these (an image's colour adjustments) has to
 * cover as much as they read, or its output ends where the view does while
 * the blur or the shadow around it goes on reading: see `itemFilterPadding`.
 */

export interface ItemShadow {
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

/**
 * The padding of an item's blur filter. With sample clamping in place, padding
 * determines where the visible blur halo ends. Pixi's auto-padding
 * (strength*2) cuts the Gaussian tail off mid-falloff; the optimized 4-pass
 * kernel reaches ~5x strength, so pad to 6x for a smooth fadeout.
 */
export function blurFilterPadding(blurRadius: number, zoom: number): number {
  return blurRadius * zoom * 6;
}

/** Whether a shadow shows at all: only then does the item get a shadow filter. */
export function hasVisibleShadow<T extends ItemShadow>(shadow: T | null | undefined): shadow is T {
  return Boolean(
    shadow && (shadow.blur > 0 || shadow.offsetX !== 0 || shadow.offsetY !== 0) && shadow.opacity > 0,
  );
}

/**
 * The padding of an item's drop-shadow filter. DropShadowFilter wraps a Kawase
 * blur whose reach scales with blur x quality. Auto-padding (offset + blur*2 +
 * quality*4) clips the tail; extend it the same way as the blur filter's.
 */
export function shadowFilterPadding(shadow: ItemShadow, zoom: number): number {
  const shadowBlur = (shadow.blur / 2) * zoom;
  return (
    Math.max(Math.abs(shadow.offsetX * zoom), Math.abs(shadow.offsetY * zoom)) + shadowBlur * 6 + 32
  );
}

/**
 * The padding of all the filters on an item's container together, which is
 * how far past the view Pixi draws the item for them: 0 for an item with
 * neither blur nor shadow. Text casts its shadow itself, without a filter.
 *
 * A filter inside the container is given this much padding, rounded up to a
 * whole pixel as Pixi cuts paddings down to one, so that it is drawn
 * everywhere the outer filters read.
 */
export function itemFilterPadding(
  item: { kind: string; blurRadius: number; shadow?: ItemShadow | null },
  zoom: number,
): number {
  let padding = 0;
  if (item.blurRadius > 0) padding += blurFilterPadding(item.blurRadius, zoom);
  if (item.kind !== 'text' && hasVisibleShadow(item.shadow)) {
    padding += shadowFilterPadding(item.shadow, zoom);
  }
  return Math.ceil(padding);
}
