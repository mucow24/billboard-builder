import { describe, expect, it } from 'vitest';

import {
  alignToDevicePixels,
  alignViewportPanToDevicePixels,
  clampZoom,
  fitCanvasToArea,
  floorZoomToSeamFriendlyStep,
  getFitArea,
  MIN_FIT_AREA_WIDTH,
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

  it('fits into the part of the viewport left of a panel over its right side', () => {
    const viewportSize = { width: 1280, height: 720 };

    expect(getFitArea(viewportSize, null)).toEqual({ left: 0, top: 0, width: 1280, height: 720 });
    expect(getFitArea(viewportSize, { left: 956, top: 50, width: 317, height: 662 })).toEqual({
      left: 0,
      top: 0,
      width: 956,
      height: 720,
    });
  });

  it('fits into the whole viewport when the panel is hidden, outside it, or leaves too little room', () => {
    const viewportSize = { width: 1280, height: 720 };
    const wholeViewport = { left: 0, top: 0, width: 1280, height: 720 };

    // A display: none panel measures as an empty rect at the origin.
    expect(getFitArea(viewportSize, { left: 0, top: 0, width: 0, height: 0 })).toEqual(wholeViewport);
    expect(getFitArea(viewportSize, { left: 1300, top: 50, width: 317, height: 662 })).toEqual(wholeViewport);
    expect(getFitArea(viewportSize, { left: 956, top: 800, width: 317, height: 662 })).toEqual(wholeViewport);
    expect(
      getFitArea({ width: 640, height: 720 }, { left: MIN_FIT_AREA_WIDTH - 1, top: 50, width: 317, height: 662 }),
    ).toEqual({ left: 0, top: 0, width: 640, height: 720 });
    expect(
      getFitArea({ width: 640, height: 720 }, { left: MIN_FIT_AREA_WIDTH, top: 50, width: 317, height: 662 }),
    ).toEqual({ left: 0, top: 0, width: MIN_FIT_AREA_WIDTH, height: 720 });
  });

  it('centers the fitted canvas in the area with a margin', () => {
    expect(fitCanvasToArea({ width: 1024, height: 1024 }, { left: 0, top: 0, width: 1280, height: 720 }, 1)).toEqual({
      zoom: 0.625,
      pan: { x: 320, y: 40 },
    });

    // A wide canvas beside a panel: the area's width limits the zoom.
    const fit = fitCanvasToArea({ width: 2000, height: 500 }, { left: 0, top: 0, width: 956, height: 720 }, 1);
    expect(fit.zoom).toBe(0.421875);
    expect(fit.pan.x).toBeCloseTo((956 - 2000 * 0.421875) / 2, 6);
    expect(fit.pan.x + 2000 * fit.zoom).toBeLessThan(956);
    expect(fit.pan.y).toBeCloseTo((720 - 500 * 0.421875) / 2, 6);
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
