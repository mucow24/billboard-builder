import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFirstImageFileFromClipboardData, importImageFile } from './images';

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
});
