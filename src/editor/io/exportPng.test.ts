import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyCanvasToClipboard, downloadCanvasAsPng } from './exportPng';
import type { CanvasRendererHandle } from '../rendering/renderer/canvasRendererTypes';

describe('downloadCanvasAsPng', () => {
  it('downloads a PNG via the renderer handle', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    const anchorClick = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => (tagName === 'a' ? anchor : originalCreateElement(tagName)));

    const handle: CanvasRendererHandle = {
      getContainerElement: vi.fn(() => null),
      getPointerPosition: vi.fn(() => null),
      exportToDataURL: vi.fn(async () => 'data:image/png;base64,abc123'),
    };

    await downloadCanvasAsPng(handle, 1024, 512, 2, 'bb-export.png');

    expect(handle.exportToDataURL).toHaveBeenCalledWith({
      contentWidth: 1024,
      contentHeight: 512,
      pixelRatio: 2,
      mimeType: 'image/png',
    });
    expect(anchor.href).toBe('data:image/png;base64,abc123');
    expect(anchor.download).toBe('bb-export.png');
    expect(anchorClick).toHaveBeenCalledOnce();

    createElementSpy.mockRestore();
  });
});

describe('copyCanvasToClipboard', () => {
  const originalClipboard = navigator.clipboard;
  const originalClipboardItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = originalClipboardItem;
    globalThis.fetch = originalFetch;
  });

  it('writes the rendered canvas to the system clipboard as image/png', async () => {
    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    globalThis.fetch = vi.fn(async () => ({ blob: async () => blob })) as unknown as typeof fetch;

    const writes: unknown[][] = [];
    const write = vi.fn(async (items: unknown[]) => {
      writes.push(items);
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { write },
      configurable: true,
    });

    type ClipboardItemCtor = new (data: Record<string, Blob>) => { types: string[]; data: Record<string, Blob> };
    const ClipboardItemMock = vi.fn(function (this: { types: string[]; data: Record<string, Blob> }, data: Record<string, Blob>) {
      this.types = Object.keys(data);
      this.data = data;
    }) as unknown as ClipboardItemCtor;
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = ClipboardItemMock;

    const handle: CanvasRendererHandle = {
      getContainerElement: vi.fn(() => null),
      getPointerPosition: vi.fn(() => null),
      exportToDataURL: vi.fn(async () => 'data:image/png;base64,abc123'),
    };

    await copyCanvasToClipboard(handle, 800, 600, 1);

    expect(handle.exportToDataURL).toHaveBeenCalledWith({
      contentWidth: 800,
      contentHeight: 600,
      pixelRatio: 1,
      mimeType: 'image/png',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('data:image/png;base64,abc123');
    expect(write).toHaveBeenCalledOnce();
    const items = writes[0] as Array<{ types: string[]; data: Record<string, Blob> }>;
    expect(items).toHaveLength(1);
    expect(items[0].types).toEqual(['image/png']);
    expect(items[0].data['image/png']).toBe(blob);
  });
});
