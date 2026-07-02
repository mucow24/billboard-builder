import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFirstImageFileFromClipboardData, importImageFile } from './images';

const RealFileReader = FileReader;

class MockFileReader {
  onerror: null | (() => void) = null;
  onload: null | (() => void) = null;
  result: string | ArrayBuffer | null = null;

  readAsDataURL(file: File) {
    if (file.name === 'broken-read.png') {
      this.onerror?.();
      return;
    }

    this.result = file.name === 'broken-preview.png'
      ? 'broken-preview'
      : `data:${file.type || 'image/png'};base64,AAA`;
    this.onload?.();
  }
}

class MockImage {
  onerror: null | (() => void) = null;
  onload: null | (() => void) = null;
  naturalWidth = 640;
  naturalHeight = 320;

  set src(value: string) {
    if (value.includes('broken-preview')) {
      this.onerror?.();
      return;
    }

    this.onload?.();
  }
}

function makeClipboardItem(file: File | null, type = file?.type ?? 'image/png'): DataTransferItem {
  return {
    kind: file ? 'file' : 'string',
    type,
    getAsFile: () => file,
  } as DataTransferItem;
}

function makeClipboardData({
  items = [],
  files = [],
}: {
  items?: DataTransferItem[];
  files?: File[];
} = {}): DataTransfer {
  return {
    items,
    files,
  } as unknown as DataTransfer;
}

describe('image IO helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('Image', MockImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the first image file from clipboard items', () => {
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const clipboardData = makeClipboardData({
      items: [makeClipboardItem(null, 'text/plain'), makeClipboardItem(imageFile)],
    });

    expect(getFirstImageFileFromClipboardData(clipboardData)).toBe(imageFile);
  });

  it('falls back to clipboard files when items are unusable', () => {
    const imageFile = new File(['image'], 'clipboard.png', { type: 'image/png' });
    const clipboardData = makeClipboardData({
      items: [makeClipboardItem(null)],
      files: [imageFile],
    });

    expect(getFirstImageFileFromClipboardData(clipboardData)).toBe(imageFile);
  });

  it('ignores clipboard data without images', () => {
    const clipboardData = makeClipboardData({
      items: [makeClipboardItem(null, 'text/plain')],
      files: [new File(['text'], 'clipboard.txt', { type: 'text/plain' })],
    });

    expect(getFirstImageFileFromClipboardData(clipboardData)).toBeNull();
  });

  it('accepts typeless clipboard files with an .svg extension', () => {
    const svgFile = new File(['<svg/>'], 'dropped.svg', { type: '' });
    const fromItems = makeClipboardData({ items: [makeClipboardItem(svgFile, '')] });
    const fromFiles = makeClipboardData({ files: [svgFile] });

    expect(getFirstImageFileFromClipboardData(fromItems)).toBe(svgFile);
    expect(getFirstImageFileFromClipboardData(fromFiles)).toBe(svgFile);
  });

  it('still ignores typeless clipboard files without an .svg extension', () => {
    const unknownFile = new File(['data'], 'archive.zip', { type: '' });
    const clipboardData = makeClipboardData({
      items: [makeClipboardItem(unknownFile, '')],
      files: [unknownFile],
    });

    expect(getFirstImageFileFromClipboardData(clipboardData)).toBeNull();
  });

  it('imports image metadata from a file upload', async () => {
    const imageFile = new File(['image'], 'poster.png');

    await expect(importImageFile(imageFile)).resolves.toEqual({
      src: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
      width: 640,
      height: 320,
      sourceName: 'poster.png',
    });
  });

  it('rejects when the file cannot be read', async () => {
    const imageFile = new File(['image'], 'broken-read.png', { type: 'image/png' });

    await expect(importImageFile(imageFile)).rejects.toThrow('Failed to read file: broken-read.png');
  });

  it('rejects when the image preview cannot be loaded', async () => {
    const imageFile = new File(['image'], 'broken-preview.png', { type: 'image/png' });

    await expect(importImageFile(imageFile)).rejects.toThrow('Failed to load image preview');
  });

  describe('SVG imports', () => {
    beforeEach(() => {
      // SVG imports parse the real file text, so restore jsdom's FileReader
      // (the Image load-check keeps using MockImage).
      vi.stubGlobal('FileReader', RealFileReader);
    });

    it('imports SVG files with dimensions parsed from the markup, not the browser-reported natural size', async () => {
      const svgText = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect fill="#111827"/></svg>';
      const svgFile = new File([svgText], 'logo.svg', { type: 'image/svg+xml' });

      const asset = await importImageFile(svgFile);

      // MockImage reports 640×320; SVG sizing must come from the parsed viewBox.
      expect(asset).toMatchObject({
        mimeType: 'image/svg+xml',
        width: 160,
        height: 90,
        sourceName: 'logo.svg',
      });
      expect(asset.src.startsWith('data:image/svg+xml;base64,')).toBe(true);
    });

    it('routes typeless .svg files through the SVG importer', async () => {
      const svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"/>';
      const svgFile = new File([svgText], 'typeless.svg', { type: '' });

      await expect(importImageFile(svgFile)).resolves.toMatchObject({
        mimeType: 'image/svg+xml',
        width: 48,
        height: 24,
      });
    });

    it('rejects SVG files that are not renderable SVG documents', async () => {
      const brokenFile = new File(['<svg'], 'broken.svg', { type: 'image/svg+xml' });

      await expect(importImageFile(brokenFile)).rejects.toThrow('SVG markup is not well-formed XML');
    });
  });
});
