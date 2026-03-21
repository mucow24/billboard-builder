import type { CanvasItem, ReorderMode } from '../document/documentTypes';
import { normalizeZIndices, sortByZIndex } from '../document/documentDefaults';

export function reorderItemsBySelection(
  items: CanvasItem[],
  selectedItemIds: string[],
  mode: ReorderMode,
): CanvasItem[] {
  const ordered = sortByZIndex(items).slice();
  const selected = new Set(selectedItemIds);
  const selectedItems = ordered.filter((item) => selected.has(item.id));
  const unselectedItems = ordered.filter((item) => !selected.has(item.id));

  if (selectedItems.length === 0) {
    return ordered;
  }

  if (mode === 'front') {
    return normalizeZIndices([...unselectedItems, ...selectedItems]);
  }
  if (mode === 'back') {
    return normalizeZIndices([...selectedItems, ...unselectedItems]);
  }

  const result = ordered.slice();
  if (mode === 'forward') {
    for (let index = result.length - 2; index >= 0; index -= 1) {
      if (selected.has(result[index].id) && !selected.has(result[index + 1].id)) {
        const temp = result[index];
        result[index] = result[index + 1];
        result[index + 1] = temp;
      }
    }
    return normalizeZIndices(result);
  }

  for (let index = 1; index < result.length; index += 1) {
    if (selected.has(result[index].id) && !selected.has(result[index - 1].id)) {
      const temp = result[index];
      result[index] = result[index - 1];
      result[index - 1] = temp;
    }
  }
  return normalizeZIndices(result);
}
