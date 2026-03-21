import type { TextPadding } from './documentTypes';

export const DEFAULT_TEXT_PADDING: TextPadding = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

function clampFinite(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

export function normalizeTextPadding(
  padding: Partial<TextPadding> | undefined,
): TextPadding {
  return {
    top: clampFinite(padding?.top ?? DEFAULT_TEXT_PADDING.top, DEFAULT_TEXT_PADDING.top),
    right: clampFinite(padding?.right ?? DEFAULT_TEXT_PADDING.right, DEFAULT_TEXT_PADDING.right),
    bottom: clampFinite(padding?.bottom ?? DEFAULT_TEXT_PADDING.bottom, DEFAULT_TEXT_PADDING.bottom),
    left: clampFinite(padding?.left ?? DEFAULT_TEXT_PADDING.left, DEFAULT_TEXT_PADDING.left),
  };
}
