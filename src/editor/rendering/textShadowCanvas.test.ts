import { describe, expect, it } from 'vitest';

import { shadowCanvasRects } from './textShadowCanvas';

describe('shadowCanvasRects', () => {
  it('has nothing to place without pieces', () => {
    expect(shadowCanvasRects([], 10, 10, 2)).toBeNull();
  });

  it('holds every piece in the silhouette', () => {
    const rects = shadowCanvasRects(
      [
        { left: 16, top: 0, width: 64, height: 32 },
        { left: 70, top: -8, width: 40, height: 48 },
      ],
      0,
      0,
      0,
    );
    expect(rects?.silhouette).toEqual({ left: 16, top: -8, width: 94, height: 48 });
    expect(rects?.shadow).toEqual(rects?.silhouette);
  });

  it('moves the shadow by its offset and grows it by its reach', () => {
    const rects = shadowCanvasRects([{ left: 0, top: 0, width: 100, height: 50 }], 30, -20, 4);
    expect(rects?.shadow).toEqual({ left: 26, top: -24, width: 108, height: 58 });
  });

  it('rounds a shadow at a fraction of a texel outwards', () => {
    const rects = shadowCanvasRects([{ left: 0, top: 0, width: 10, height: 10 }], 2.5, 0.25, 1.25);
    expect(rects?.shadow).toEqual({ left: 1, top: -1, width: 13, height: 13 });
  });

  it('ignores an offset or a reach that is not a number', () => {
    const rects = shadowCanvasRects([{ left: 0, top: 0, width: 10, height: 10 }], NaN, Infinity, NaN);
    expect(rects?.shadow).toEqual({ left: 0, top: 0, width: 10, height: 10 });
  });
});
