interface ColorChannels {
  a: number;
  b: number;
  g: number;
  r: number;
}

function parseColorChannels(hex: string): ColorChannels {
  const clean = String(hex || '')
    .replace('#', '')
    .trim();
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    const int = Number.parseInt(normalized, 16);
    return {
      a: 1,
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }
  if (/^[0-9a-fA-F]{8}$/.test(normalized)) {
    const rgb = Number.parseInt(normalized.slice(0, 6), 16);
    const alpha = Number.parseInt(normalized.slice(6, 8), 16) / 255;
    return {
      a: alpha,
      r: (rgb >> 16) & 255,
      g: (rgb >> 8) & 255,
      b: rgb & 255,
    };
  }

  return { a: 1, r: 255, g: 255, b: 255 };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatAlpha(alpha: number): string {
  return Number(alpha.toFixed(3)).toString();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = parseColorChannels(hex);
  return { r, g, b };
}

export function rgba(hex: string, alpha = 1): string {
  const { a, r, g, b } = parseColorChannels(hex);
  const effectiveAlpha = clampUnit(a * alpha);
  return `rgba(${r}, ${g}, ${b}, ${formatAlpha(effectiveAlpha)})`;
}

export function mixColor(hexA: string, hexB: string, t: number): string {
  const a = parseColorChannels(hexA);
  const b = parseColorChannels(hexB);
  const clampedT = clampUnit(t);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * clampedT);
  const mixAlpha = (x: number, y: number) => x + (y - x) * clampedT;
  return `rgba(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)}, ${formatAlpha(mixAlpha(a.a, b.a))})`;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
