export function computePickerPosition(
  triggerRect: { top: number; bottom: number; left: number; right: number },
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { top: number; right: number } {
  if (triggerRect.bottom + panelHeight <= viewportHeight) {
    return { top: triggerRect.bottom, right: viewportWidth - triggerRect.right };
  }
  return {
    top: Math.max(0, viewportHeight - panelHeight),
    right: viewportWidth - triggerRect.left + 4,
  };
}
