/** Round to 3 decimals and drop trailing zeros / negative-zero for compact, stable SVG numbers. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Escape text for use inside an XML attribute value or text node. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
