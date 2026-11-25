import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTextItem } from '../../document/documentDefaults';
import { announceFontRegistration } from '../../fonts/fontRegistrations';
import { createCanvasTextMeasurer } from './canvasTextMeasurer';

/**
 * `drawsBoldAsRegular` compares what the browser draws, and jsdom draws nothing:
 * a stand-in 2D context paints one pixel per text, by the family and by whether
 * the browser would fake the bold it is asked for. That the real comparison
 * tells Chromium's unfaked bold from faked bold is proven in e2e.
 */

/** Families whose bold the stand-in browser fakes. */
const fakedFamilies = new Set<string>();
/** Every `fillText` call: the font it was drawn with and the text. */
const drawn: Array<{ font: string; text: string }> = [];

function standInContext() {
  let pixel = 0;
  return {
    font: '',
    clearRect() {
      pixel = 0;
    },
    fillText(text: string) {
      drawn.push({ font: this.font, text });
      const family = /"([^"]+)"/.exec(this.font)?.[1] ?? '';
      const faked = this.font.includes('bold') && fakedFamilies.has(family);
      pixel = family.length + (faked ? 100 : 0);
    },
    getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, pixel]) }),
    measureText: () => ({ width: 0 }),
  };
}

const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: standInContext });
});
afterAll(() => {
  if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original);
});

beforeEach(() => {
  fakedFamilies.clear();
  drawn.length = 0;
  // Forgets what earlier tests compared.
  announceFontRegistration('Any');
});

describe('drawsBoldAsRegular', () => {
  const bold = (fontFamily: string, fontSize = 120) => createTextItem({ fontFamily, fontSize, fontWeight: 'bold' });

  it('is true when the sample is drawn the same in bold and in the regular weight', () => {
    const measurer = createCanvasTextMeasurer();
    expect(measurer.drawsBoldAsRegular?.(bold('Heavy'), 'H')).toBe(true);
    expect(drawn.map(({ font }) => font.includes('bold'))).toEqual([true, false]);
    expect(drawn.every(({ text, font }) => text === 'H' && font.includes('"Heavy"'))).toBe(true);
  });

  it('is false when the bold is drawn differently', () => {
    fakedFamilies.add('Thin');
    expect(createCanvasTextMeasurer().drawsBoldAsRegular?.(bold('Thin'), 'H')).toBe(false);
  });

  it('draws at one size whatever the size of the text, and once for a font and sample', () => {
    const measurer = createCanvasTextMeasurer();
    measurer.drawsBoldAsRegular?.(bold('Heavy', 20), 'H');
    measurer.drawsBoldAsRegular?.(bold('Heavy', 900), 'H');
    expect(drawn).toHaveLength(2);
    expect(drawn[0].font).toContain('48px');
    measurer.drawsBoldAsRegular?.(bold('Heavy'), 'a');
    expect(drawn).toHaveLength(4);
  });

  it('draws anew after a font is registered: the family may be drawn with another file from then on', () => {
    const measurer = createCanvasTextMeasurer();
    expect(measurer.drawsBoldAsRegular?.(bold('Late'), 'H')).toBe(true);
    fakedFamilies.add('Late');
    expect(measurer.drawsBoldAsRegular?.(bold('Late'), 'H')).toBe(true);
    announceFontRegistration('Late');
    expect(measurer.drawsBoldAsRegular?.(bold('Late'), 'H')).toBe(false);
  });
});
