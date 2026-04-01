export function clampFinite(
  value: number,
  fallback: number,
  min?: number,
  max?: number,
): number {
  let nextValue = Number.isFinite(value) ? value : fallback;
  if (min !== undefined) {
    nextValue = Math.max(min, nextValue);
  }
  if (max !== undefined) {
    nextValue = Math.min(max, nextValue);
  }
  return nextValue;
}
