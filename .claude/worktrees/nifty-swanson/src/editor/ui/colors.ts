import {
  hexToHsva,
  hslaToHsva,
  hsvaToHexa,
  hsvaToHsla,
  type HslaColor,
  type HsvaColor,
} from '@uiw/react-color';
import {
  clampAlpha,
  parseHexColor,
  toHexColorWithAlpha,
  toStoredHexColor,
  type ParsedColor,
} from '../color/hexColor';

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

export { clampAlpha, parseHexColor, toHexColorWithAlpha, toStoredHexColor, type ParsedColor };
