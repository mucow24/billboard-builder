import { describe, expect, it, vi } from 'vitest';

import { downloadStageAsPng } from './exportPng';

describe('downloadStageAsPng', () => {
  it('hides export-excluded nodes during export and restores them afterward', () => {
    const anchorClick = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        return {
          click: anchorClick,
          set href(value: string) {
            this._href = value;
          },
          get href() {
            return this._href;
          },
          set download(value: string) {
            this._download = value;
          },
          get download() {
            return this._download;
          },
        } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    }) as typeof document.createElement);

    const excludedNode = {
      visible: vi.fn((value?: boolean) => (value === undefined ? true : undefined)),
      listening: vi.fn((value?: boolean) => (value === undefined ? true : undefined)),
    };
    const exportRoot = {
      x: vi.fn(() => 120),
      y: vi.fn(() => 240),
      scaleX: vi.fn(() => 0.75),
      scaleY: vi.fn(() => 0.75),
      width: vi.fn(() => 1024),
      height: vi.fn(() => 512),
      position: vi.fn(),
      scale: vi.fn(),
    };
    const stage = {
      findOne: vi.fn(() => exportRoot),
      find: vi.fn(() => [excludedNode]),
      toDataURL: vi.fn(() => 'data:image/png;base64,abc123'),
      batchDraw: vi.fn(),
      width: vi.fn(() => 1200),
      height: vi.fn(() => 800),
    };

    downloadStageAsPng(stage as never, 2, 'bb-export.png');

    expect(excludedNode.visible).toHaveBeenCalledWith(false);
    expect(excludedNode.listening).toHaveBeenCalledWith(false);
    expect(stage.toDataURL).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1024,
      height: 512,
      pixelRatio: 2,
      mimeType: 'image/png',
    });
    expect(exportRoot.position).toHaveBeenNthCalledWith(1, { x: 0, y: 0 });
    expect(exportRoot.scale).toHaveBeenNthCalledWith(1, { x: 1, y: 1 });
    expect(excludedNode.visible).toHaveBeenLastCalledWith(true);
    expect(excludedNode.listening).toHaveBeenLastCalledWith(true);
    expect(exportRoot.position).toHaveBeenLastCalledWith({ x: 120, y: 240 });
    expect(exportRoot.scale).toHaveBeenLastCalledWith({ x: 0.75, y: 0.75 });
    expect(anchorClick).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });
});
