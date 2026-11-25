import { describe, expect, it } from 'vitest';

import {
  blurFilterPadding,
  hasVisibleShadow,
  itemFilterPadding,
  shadowFilterPadding,
} from './itemFilterPadding';

const noShadow = { color: '#000000', blur: 0, offsetX: 0, offsetY: 0, opacity: 0 };
const shadow = { color: '#000000', blur: 10, offsetX: -40, offsetY: 30, opacity: 0.5 };

describe('itemFilterPadding', () => {
  it('is 0 for an item with neither blur nor shadow, at any zoom', () => {
    expect(itemFilterPadding({ kind: 'image', blurRadius: 0, shadow: noShadow }, 1)).toBe(0);
    expect(itemFilterPadding({ kind: 'image', blurRadius: 0, shadow: null }, 8)).toBe(0);
    // A shadow that does not show gets no filter.
    expect(itemFilterPadding({ kind: 'image', blurRadius: 0, shadow: { ...shadow, opacity: 0 } }, 2)).toBe(0);
  });

  it('is the padding of the blur and of the shadow together, for the zoom', () => {
    expect(blurFilterPadding(5, 2)).toBe(60);
    // The longer side of the offset, six times the blur, and a fixed margin.
    expect(shadowFilterPadding(shadow, 2)).toBe(80 + 60 + 32);
    expect(itemFilterPadding({ kind: 'image', blurRadius: 5, shadow: noShadow }, 2)).toBe(60);
    expect(itemFilterPadding({ kind: 'image', blurRadius: 0, shadow }, 2)).toBe(172);
    expect(itemFilterPadding({ kind: 'image', blurRadius: 5, shadow }, 2)).toBe(232);
  });

  it('is a whole number of pixels, never less than the filters read', () => {
    expect(itemFilterPadding({ kind: 'image', blurRadius: 1, shadow: noShadow }, 0.37)).toBe(3);
  });

  it('leaves out the shadow of text, which is not a filter', () => {
    expect(itemFilterPadding({ kind: 'text', blurRadius: 0, shadow }, 1)).toBe(0);
    expect(itemFilterPadding({ kind: 'text', blurRadius: 5, shadow }, 1)).toBe(30);
  });
});

describe('hasVisibleShadow', () => {
  it('needs an opacity and either a blur or an offset', () => {
    expect(hasVisibleShadow(undefined)).toBe(false);
    expect(hasVisibleShadow(noShadow)).toBe(false);
    expect(hasVisibleShadow({ ...noShadow, opacity: 1 })).toBe(false);
    expect(hasVisibleShadow({ ...noShadow, opacity: 1, offsetY: -1 })).toBe(true);
    expect(hasVisibleShadow({ ...noShadow, opacity: 1, blur: 2 })).toBe(true);
  });
});
