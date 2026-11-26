import type { CanvasItem } from './documentTypes';

/**
 * The settings of an item that are sizes in canvas pixels and are not part of
 * its box: a plain resize leaves them alone, so text keeps its size in a
 * bigger box and an outline keeps its width. A scaling resize (Alt-drag on a
 * corner) multiplies them by the same factor as the box, so the item looks
 * the same at its new size.
 *
 * Line height is a multiple of the font size, so it follows without help. A
 * generator's own settings are left out: they describe a pattern, not a box.
 */
export function getScalableStyle(item: CanvasItem): Partial<CanvasItem> {
  const shared = { shadow: item.shadow, blurRadius: item.blurRadius };
  switch (item.kind) {
    case 'text':
      return {
        ...shared,
        fontSize: item.fontSize,
        letterSpacing: item.letterSpacing,
        padding: item.padding,
        strokeWidth: item.strokeWidth,
      };
    case 'rectangle':
      return { ...shared, strokeWidth: item.strokeWidth, cornerRadius: item.cornerRadius };
    case 'ellipse':
    case 'ngon':
      return { ...shared, strokeWidth: item.strokeWidth };
    case 'polygon':
      return { ...shared, strokeWidth: item.strokeWidth, curveRadius: item.curveRadius };
    default:
      return shared;
  }
}

const MIN_FONT_SIZE = 1;

/** The item with every setting of `getScalableStyle` multiplied by `factor`. */
export function scaleItemStyle<T extends CanvasItem>(item: T, factor: number): T {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    return item;
  }
  const scaled: CanvasItem = {
    ...item,
    shadow: {
      ...item.shadow,
      blur: item.shadow.blur * factor,
      offsetX: item.shadow.offsetX * factor,
      offsetY: item.shadow.offsetY * factor,
    },
    blurRadius: item.blurRadius * factor,
  };
  switch (scaled.kind) {
    case 'text':
      scaled.fontSize = Math.max(MIN_FONT_SIZE, scaled.fontSize * factor);
      scaled.letterSpacing *= factor;
      scaled.padding = {
        top: scaled.padding.top * factor,
        right: scaled.padding.right * factor,
        bottom: scaled.padding.bottom * factor,
        left: scaled.padding.left * factor,
      };
      scaled.strokeWidth *= factor;
      break;
    case 'rectangle':
      scaled.strokeWidth *= factor;
      scaled.cornerRadius *= factor;
      break;
    case 'ellipse':
    case 'ngon':
      scaled.strokeWidth *= factor;
      break;
    case 'polygon':
      scaled.strokeWidth *= factor;
      scaled.curveRadius *= factor;
      break;
    default:
      break;
  }
  return scaled as T;
}
