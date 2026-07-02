import { describe, expect, it } from 'vitest';

import { isSvgImageFile, normalizeSvgForImport, svgTextToDataUrl } from './svgImageImport';

const SVG_NS = 'http://www.w3.org/2000/svg';

function parseRoot(svgText: string): Element {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc.documentElement;
}

function decodeDataUrl(dataUrl: string): string {
  const base64 = dataUrl.replace('data:image/svg+xml;base64,', '');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe('isSvgImageFile', () => {
  it('detects the SVG mime type', () => {
    expect(isSvgImageFile(new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' }))).toBe(true);
  });

  it('falls back to the extension when the type is empty', () => {
    expect(isSvgImageFile(new File(['<svg/>'], 'icon.SVG', { type: '' }))).toBe(true);
  });

  it('rejects non-SVG files', () => {
    expect(isSvgImageFile(new File(['x'], 'photo.png', { type: 'image/png' }))).toBe(false);
    expect(isSvgImageFile(new File(['x'], 'notes.svg.txt', { type: '' }))).toBe(false);
    expect(isSvgImageFile(new File(['x'], 'photo.png', { type: '' }))).toBe(false);
  });
});

describe('normalizeSvgForImport', () => {
  it('keeps explicit pixel dimensions', () => {
    const result = normalizeSvgForImport(
      `<svg xmlns="${SVG_NS}" width="160" height="90"><rect width="160" height="90"/></svg>`,
    );

    expect(result.width).toBe(160);
    expect(result.height).toBe(90);
    const root = parseRoot(result.svgText);
    expect(root.getAttribute('width')).toBe('160');
    expect(root.getAttribute('height')).toBe('90');
  });

  it('converts absolute units to pixels', () => {
    const result = normalizeSvgForImport(
      `<svg xmlns="${SVG_NS}" width="72pt" height="1in"/>`,
    );

    expect(result.width).toBe(96);
    expect(result.height).toBe(96);
  });

  it('uses the viewBox when dimensions are relative', () => {
    const result = normalizeSvgForImport(
      `<svg xmlns="${SVG_NS}" width="100%" height="100%" viewBox="0 0 160 90"/>`,
    );

    expect(result.width).toBe(160);
    expect(result.height).toBe(90);
  });

  it('uses the viewBox when dimensions are missing', () => {
    const result = normalizeSvgForImport(`<svg xmlns="${SVG_NS}" viewBox="0 0 24.5 12.25"/>`);

    expect(result.width).toBe(24.5);
    expect(result.height).toBe(12.25);
  });

  it('derives a missing dimension from the viewBox aspect ratio', () => {
    const result = normalizeSvgForImport(
      `<svg xmlns="${SVG_NS}" width="200" viewBox="0 0 100 50"/>`,
    );

    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('falls back to the CSS default object size with no sizing at all', () => {
    const result = normalizeSvgForImport(`<svg xmlns="${SVG_NS}"/>`);

    expect(result.width).toBe(300);
    expect(result.height).toBe(150);
  });

  it('injects a viewBox when missing so rasterization can scale content', () => {
    const result = normalizeSvgForImport(`<svg xmlns="${SVG_NS}" width="160" height="90"/>`);

    expect(parseRoot(result.svgText).getAttribute('viewBox')).toBe('0 0 160 90');
  });

  it('preserves an existing viewBox and offset', () => {
    const result = normalizeSvgForImport(
      `<svg xmlns="${SVG_NS}" width="100%" viewBox="-10 -5 160 90"/>`,
    );

    expect(parseRoot(result.svgText).getAttribute('viewBox')).toBe('-10 -5 160 90');
  });

  it('preserves document content through normalization', () => {
    const result = normalizeSvgForImport(
      `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><g id="art"><circle cx="5" cy="5" r="4" fill="#22d3ee"/></g></svg>`,
    );

    const root = parseRoot(result.svgText);
    expect(root.querySelector('g#art circle')?.getAttribute('fill')).toBe('#22d3ee');
  });

  it('rejects markup that is not well-formed XML', () => {
    expect(() => normalizeSvgForImport('<svg xmlns="x"><rect</svg>')).toThrow(
      'SVG markup is not well-formed XML',
    );
  });

  it('rejects XML whose root is not an SVG element', () => {
    expect(() =>
      normalizeSvgForImport('<div xmlns="http://www.w3.org/1999/xhtml">nope</div>'),
    ).toThrow('File is not an SVG document');
  });

  it('rejects svg elements outside the SVG namespace, which image contexts refuse to render', () => {
    expect(() => normalizeSvgForImport('<svg width="10" height="10"/>')).toThrow(
      'File is not an SVG document',
    );
  });
});

describe('svgTextToDataUrl', () => {
  it('round-trips markup including non-ASCII content', () => {
    const svgText = `<svg xmlns="${SVG_NS}" width="10" height="10"><title>Grüße ✓</title></svg>`;

    const dataUrl = svgTextToDataUrl(svgText);

    expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(decodeDataUrl(dataUrl)).toBe(svgText);
  });
});
