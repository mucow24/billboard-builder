import type { ImageAdjustments } from './documentTypes';
import { parseHexColor } from '../color/hexColor';

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  brightness: 100,
  contrast: 50,
  tintColor: '#ffffff',
  tintStrength: 0,
} as const;

function clampFinite(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export function normalizeImageAdjustments(
  adjustments: Partial<ImageAdjustments> | undefined,
): ImageAdjustments {
  const tintColor =
    typeof adjustments?.tintColor === 'string' && adjustments.tintColor.trim().length > 0
      ? adjustments.tintColor
      : DEFAULT_IMAGE_ADJUSTMENTS.tintColor;

  return {
    brightness: clampFinite(
      adjustments?.brightness ?? DEFAULT_IMAGE_ADJUSTMENTS.brightness,
      DEFAULT_IMAGE_ADJUSTMENTS.brightness,
      0,
      200,
    ),
    contrast: clampFinite(
      adjustments?.contrast ?? DEFAULT_IMAGE_ADJUSTMENTS.contrast,
      DEFAULT_IMAGE_ADJUSTMENTS.contrast,
      0,
      100,
    ),
    tintColor: parseHexColor(tintColor).hex,
    tintStrength: clampFinite(
      adjustments?.tintStrength ?? DEFAULT_IMAGE_ADJUSTMENTS.tintStrength,
      DEFAULT_IMAGE_ADJUSTMENTS.tintStrength,
      0,
      100,
    ),
  };
}
