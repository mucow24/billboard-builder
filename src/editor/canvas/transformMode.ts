export function shouldApplyLiveTransform(activeAnchor?: string | null): boolean {
  return Boolean(activeAnchor && activeAnchor !== 'rotater');
}
