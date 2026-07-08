import { describe, expect, it } from 'vitest';

import {
  alignToDevicePixels,
  alignViewportPanToDevicePixels,
  clampZoom,
  floorZoomToSeamFriendlyStep,
  snapZoomToSeamFriendlyStep,
  toCanvasPointer,
  toOverlayStyle,
  toViewportPoint,
  toViewportRect,
} from './viewportMath';

describe('viewportMath', () => {
  it('clamps zoom within the supported range', () => {
    expect(clampZoom(0.0001)).toBe(0.001);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(20)).toBe(16);
  });

  it('aligns viewport pan values to device pixels', () => {
    expect(alignToDevicePixels(-708.1090534979423, 1)).toBe(-708);
    expect(alignToDevicePixels(316.324, 2)).toBe(316.5);
    expect(alignViewportPanToDevicePixels({ x: 316.324, y: -389.7633744855966 }, 2)).toEqual({
      x: 316.5,
      y: -390,
    });
  });

  it('snaps zoom levels to seam-friendlier steps', () => {
    expect(snapZoomToSeamFriendlyStep(0.8, 1)).toBe(0.796875);
    expect(snapZoomToSeamFriendlyStep(0.33, 1)).toBe(0.328125);
    expect(floorZoomToSeamFriendlyStep(0.6328125, 1)).toBe(0.625);
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
