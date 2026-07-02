// SVG files import as opaque image items, but raw SVG markup is unreliable as
// an <img>/drawImage source: files without explicit width/height report
// browser-dependent (or zero) natural sizes, and files without a viewBox
// don't scale their content when rasterized at higher resolutions. Importing
// therefore normalizes the root element to carry BOTH an explicit pixel
// width/height and a viewBox, so the renderer can rasterize the vector source
// at any resolution and every browser agrees on the intrinsic size.

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// SVG's default object size when neither dimensions nor viewBox are present.
const FALLBACK_WIDTH = 300;
const FALLBACK_HEIGHT = 150;

// Absolute CSS length units, in px per unit. Relative units (em/ex/%) depend
// on context an <img> doesn't have, so they fall through to the viewBox.
const PX_PER_UNIT: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};

export interface NormalizedSvgImage {
  /** Serialized markup with explicit width/height attributes and a viewBox. */
  svgText: string;
  width: number;
  height: number;
}

export function isSvgImageFile(file: File): boolean {
  return file.type === 'image/svg+xml' || (!file.type && /\.svg$/i.test(file.name));
}

/** Parse an absolute SVG length ("90", "90px", "10pt") to px; null if relative or invalid. */
function parseSvgLength(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value);
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const factor = unit === '' ? 1 : PX_PER_UNIT[unit];
  if (factor === undefined) return null;
  const px = Number(match[1]) * factor;
  return Number.isFinite(px) && px > 0 ? px : null;
}

function parseViewBox(value: string | null): { width: number; height: number } | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [, , width, height] = parts;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Resolve the intrinsic pixel size following the browser sizing rules for SVG
 * in an image context: explicit dimensions win; a missing dimension is derived
 * from the viewBox aspect ratio; with neither, the CSS default object size.
 */
function resolveIntrinsicSize(
  attrWidth: number | null,
  attrHeight: number | null,
  viewBox: { width: number; height: number } | null,
): { width: number; height: number } {
  if (attrWidth !== null && attrHeight !== null) {
    return { width: attrWidth, height: attrHeight };
  }
  if (viewBox) {
    if (attrWidth !== null) {
      return { width: attrWidth, height: (attrWidth * viewBox.height) / viewBox.width };
    }
    if (attrHeight !== null) {
      return { width: (attrHeight * viewBox.width) / viewBox.height, height: attrHeight };
    }
    return { width: viewBox.width, height: viewBox.height };
  }
  return { width: attrWidth ?? FALLBACK_WIDTH, height: attrHeight ?? FALLBACK_HEIGHT };
}

/**
 * Parse SVG markup and normalize its root sizing. Throws with a
 * user-presentable message when the markup isn't a renderable SVG document.
 *
 * No sanitization happens here on purpose: the imported markup is only ever
 * rendered through image contexts (<img>, canvas drawImage), where scripts and
 * external fetches are inert by specification.
 */
export function normalizeSvgForImport(svgText: string): NormalizedSvgImage {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('SVG markup is not well-formed XML');
  }

  const root = doc.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) {
    throw new Error('File is not an SVG document');
  }

  const viewBox = parseViewBox(root.getAttribute('viewBox'));
  const size = resolveIntrinsicSize(
    parseSvgLength(root.getAttribute('width')),
    parseSvgLength(root.getAttribute('height')),
    viewBox,
  );
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);

  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  if (!viewBox) {
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  return {
    svgText: new XMLSerializer().serializeToString(root),
    width,
    height,
  };
}

export function svgTextToDataUrl(svgText: string): string {
  const bytes = new TextEncoder().encode(svgText);
  let binary = '';
  const chunkSize = 0x8000; // Chunked to keep String.fromCharCode off argument-count limits.
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
