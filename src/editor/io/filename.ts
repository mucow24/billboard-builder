// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[\\/<>:"|?*\x00-\x1f\x7f]/g;

export function sanitizeBasename(name: string, fallback: string): string {
  const cleaned = name
    .replace(ILLEGAL_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');

  return cleaned.length > 0 ? cleaned : fallback;
}
