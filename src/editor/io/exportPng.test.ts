import { describe, expect, it, vi } from 'vitest';

import { downloadCanvasAsPng } from './exportPng';
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
