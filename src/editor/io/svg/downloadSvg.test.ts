import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadSvg } from './downloadSvg';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadSvg', () => {
  it('downloads the SVG string as a .svg file via an anchor', () => {
    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    const anchorClick = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'a' ? anchor : originalCreateElement(tag),
    );

    let capturedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:stub';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'my-banner.svg');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(capturedBlob?.type).toBe('image/svg+xml');
    expect(anchor.href).toContain('blob:stub');
    expect(anchor.download).toBe('my-banner.svg');
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stub');
  });
});
