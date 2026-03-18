import Konva from 'konva';

import { parseHexColor } from '../color/hexColor';
import type { ImageAdjustments } from '../document/documentTypes';
import { normalizeImageAdjustments } from '../document/imageAdjustments';

type KonvaFilter = (typeof Konva.Filters)[keyof typeof Konva.Filters];

export interface RenderableImageAdjustments {
  brightness: number;
  contrast: number;
  tintRed: number;
  tintGreen: number;
  tintBlue: number;
  tintAlpha: number;
  filters: KonvaFilter[];
  isActive: boolean;
}

function hexToRgb(hex: string) {
  const normalized = parseHexColor(hex).hex;
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function getRenderableImageAdjustments(
  adjustments: Partial<ImageAdjustments> | undefined,
): RenderableImageAdjustments {
  const normalized = normalizeImageAdjustments(adjustments);
  const tint = hexToRgb(normalized.tintColor);
  const brightness = (normalized.brightness - 100) / 100;
  const contrast = (normalized.contrast - 50) * 2;
  const tintAlpha = normalized.tintStrength / 100;
  const filters: KonvaFilter[] = [];

  if (brightness !== 0) {
    filters.push(Konva.Filters.Brighten);
  }
  if (contrast !== 0) {
    filters.push(Konva.Filters.Contrast);
  }
  if (tintAlpha > 0) {
    filters.push(Konva.Filters.RGBA);
  }

  return {
    brightness,
    contrast,
    tintRed: tint.red,
    tintGreen: tint.green,
    tintBlue: tint.blue,
    tintAlpha,
    filters,
    isActive: filters.length > 0,
  };
}
