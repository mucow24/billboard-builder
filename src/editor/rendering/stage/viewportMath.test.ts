import { describe, expect, it } from 'vitest';

import {
  clampZoom,
  toCanvasPointer,
  toOverlayStyle,
  toViewportPoint,
  toViewportRect,
} from './viewportMath';

describe('viewportMath', () => {
  it('clamps zoom within the supported range', () => {
    expect(clampZoom(0.1)).toBe(0.2);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(5)).toBe(4);
  });

  it('converts points between viewport and canvas spaces', () => {
    const pan = { x: 100, y: 200 };

    expect(toCanvasPointer({ x: 220, y: 320 }, 2, pan)).toEqual({
      x: 60,
      y: 60,
    });
    expect(toViewportPoint({ x: 60, y: 60 }, 2, pan)).toEqual({
      x: 220,
      y: 320,
    });
  });

  it('converts rects to viewport space and overlay styles', () => {
    const rect = toViewportRect(
      { x: 10, y: 20, width: 30, height: 40 },
      2,
      { x: 100, y: 200 },
    );

    expect(rect).toEqual({
      left: 120,
      top: 240,
      width: 60,
      height: 80,
    });
    expect(toOverlayStyle(rect)).toEqual({
      left: '120px',
      top: '240px',
      width: '60px',
      height: '80px',
    });
  });
});
