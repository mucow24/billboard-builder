import type { CanvasItem } from '../document/documentTypes';

function getSelectableOrderedIds(items: CanvasItem[]): string[] {
  return items
    .filter((item) => !item.hidden)
    .slice()
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((item) => item.id);
}

export function replaceSelection(itemIds: string[]): string[] {
  return Array.from(new Set(itemIds));
}

export function clearSelection(): string[] {
  return [];
}

export function toggleSelectionItem(selectedItemIds: string[], itemId: string): string[] {
  return selectedItemIds.includes(itemId)
    ? selectedItemIds.filter((id) => id !== itemId)
    : [...selectedItemIds, itemId];
}

export function toggleSelectionItems(selectedItemIds: string[], itemIds: string[]): string[] {
  const toggled = new Set(itemIds);
  const retained = selectedItemIds.filter((id) => !toggled.has(id));
  const appended = itemIds.filter((id) => !selectedItemIds.includes(id));
  return [...retained, ...appended];
}

export function normalizeSelectionForItems(selectedItemIds: string[], items: CanvasItem[]): string[] {
  const selectableIds = new Set(getSelectableOrderedIds(items));
  const seen = new Set<string>();
  return selectedItemIds.filter((id) => {
    if (!selectableIds.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

export function selectAllItems(items: CanvasItem[]): string[] {
  return getSelectableOrderedIds(items);
}
