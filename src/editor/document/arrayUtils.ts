/**
 * Returns a new array with the item at `fromIndex` moved to `toIndex`.
 * Returns the input array unchanged if indices are equal or out of bounds.
 */
export function moveArrayItem<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items.slice();
  }

  const result = items.slice();
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
}
