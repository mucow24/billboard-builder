import {
  hexToHsva,
  hslaToHsva,
  hsvaToHexa,
  hsvaToHsla,
  type HslaColor,
  type HsvaColor,
} from '@uiw/react-color';

export interface ParsedColor {
  hex: string;
  alpha: number;
}

export function clampAlpha(alpha: number): number {
  return Math.max(0, Math.min(1, alpha));
}

export function parseHexColor(value: string): ParsedColor {
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{8}$/.test(normalized)) {
    const rgb = normalized.slice(0, 7);
    const alpha = Number.parseInt(normalized.slice(7, 9), 16) / 255;
    return {
      hex: rgb.toLowerCase(),
      alpha,
    };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return {
      hex: normalized.toLowerCase(),
      alpha: 1,
    };
  }
  return {
    hex: '#000000',
    alpha: 1,
  };
}

export function toStoredHexColor(value: string): string {
  const parsed = parseHexColor(value);
  return toHexColorWithAlpha(parsed.hex, parsed.alpha);
}

export function commitHexColorInput(
  value: string,
  currentAlpha: number,
): string | null {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;

  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return toHexColorWithAlpha(normalized, currentAlpha);
  }
  if (/^#[0-9a-f]{8}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

export function hexColorToHsva(value: string): HsvaColor {
  return hexToHsva(toStoredHexColor(value));
}

export function hexColorToHsla(value: string): HslaColor {
  return hsvaToHsla(hexColorToHsva(value));
}

export function hsvaToStoredHexColor(value: HsvaColor): string {
  return hsvaToHexa({
    ...value,
    a: clampAlpha(value.a),
  }).toLowerCase();
}

export function hslaToStoredHexColor(value: HslaColor): string {
  return hsvaToStoredHexColor(
    hslaToHsva({
      ...value,
      a: clampAlpha(value.a),
    }),
  );
}

export function toHexColorWithAlpha(hex: string, alpha: number): string {
  const parsed = parseHexColor(hex);
  const clampedAlpha = clampAlpha(alpha);
  const alphaChannel = Math.round(clampedAlpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${parsed.hex}${alphaChannel}`;
}
