import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTextItem } from '../../document/documentDefaults';
import type { TextCanvasItem, UploadedFont } from '../../document/documentTypes';
import { EMOJI_FALLBACK_FAMILY } from '../../fonts/emojiFallback';
import { announceFontRegistration } from '../../fonts/fontRegistrations';
import type { FontBytes } from '../../io/svg/exportToSvg';
import type { FontOutlineProvider, OutlineFont, TextOutlineShape } from '../../io/svg/svgExportTypes';
import { fakeOutlineFont } from '../../../test/svgExportFakes';

// The fonts registered with the browser, as each test has them.
const registered: UploadedFont[] = [];
vi.mock('../../fonts/browserFontLoader', () => ({
  listRegisteredFonts: () => registered,
}));

// How font files are read: every test sets what its loaders answer.
const loadFontBytes = vi.fn<(item: TextCanvasItem) => Promise<FontBytes>>();
const loadFallbackFontBytes = vi.fn<(item: TextCanvasItem) => Promise<FontBytes>>();
vi.mock('../../io/svg/browserSvgExport', () => ({
  browserFontDeps: () => ({ loadFontBytes, loadFallbackFontBytes }),
}));

// Parsing: a file's bytes stand for the font they were made for.
const fontOfBytes = new Map<ArrayBuffer, OutlineFont>();
vi.mock('../../io/svg/fontOutlineProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../io/svg/fontOutlineProvider')>()),
  resolveOutline: (kind: string, bytes: ArrayBuffer | null) => {
    const font = bytes ? fontOfBytes.get(bytes) : undefined;
    return font ? { ok: true, font } : { ok: false, reason: kind === 'system' ? 'system-font' : 'no-bytes' };
  },
}));

// jsdom has no 2D canvas to measure with.
vi.mock('../../io/svg/canvasTextMeasurer', async () => {
  const { fakeMeasurer } = await import('../../../test/svgExportFakes');
  return { createCanvasTextMeasurer: () => fakeMeasurer };
});

import {
  _resetFontOutlines,
  fontOutlinesSettled,
  fontOutlinesVersion,
  hasFakedBold,
  hasSeeThroughFill,
  outlineBox,
  peekFontOutlines,
  requestFontOutlines,
  textOutlineShapes,
  wantsVectorOutline,
} from './vectorTextOutline';

const font = (family: string, weight: '400' | '700', style: 'normal' | 'italic' = 'normal'): UploadedFont => ({
  family,
  sourceName: `${family}-${weight}-${style}.ttf`,
  weight,
  style,
  kind: 'bundled',
});

const text = (overrides: Partial<TextCanvasItem>): TextCanvasItem =>
  createTextItem({ id: 'layer', text: 'AB', fontFamily: 'Thin', fontSize: 64, ...overrides });

/** A file for `outline`, as a loader hands it over. */
function bytesFor(outline: OutlineFont, synthetic?: FontBytes['synthetic']): FontBytes {
  const bytes = new ArrayBuffer(1);
  fontOfBytes.set(bytes, outline);
  return { kind: 'bundled', bytes, ...(synthetic ? { synthetic } : {}) };
}

/** A character only an emoji font draws. */
const EMOJI = String.fromCodePoint(0x1f600);

/** A font with glyphs for plain Latin only. */
const latinOnly: OutlineFont = { ...fakeOutlineFont, hasGlyph: (ch) => (ch.codePointAt(0) ?? 0) < 0x80 };

beforeEach(() => {
  registered.length = 0;
  fontOfBytes.clear();
  loadFontBytes.mockReset();
  loadFallbackFontBytes.mockReset();
  _resetFontOutlines();
});

describe('hasFakedBold', () => {
  it('is false where the family has a bold file', () => {
    registered.push(font('Thin', '400'), font('Thin', '700'));
    expect(hasFakedBold(text({ fontWeight: 'bold' }))).toBe(false);
  });

  it('is true for bold text in a family with a regular file only', () => {
    registered.push(font('Thin', '400'));
    expect(hasFakedBold(text({ fontWeight: 'bold' }))).toBe(true);
    expect(hasFakedBold(text({ fontWeight: 'normal' }))).toBe(false);
  });

  it('is false where a heavier weight of the typeface draws the bold', () => {
    registered.push(font('Foo Light', '400'), font('Foo SemiBold', '400'));
    expect(hasFakedBold(text({ fontWeight: 'bold', fontFamily: 'Foo Light' }))).toBe(false);
    expect(hasFakedBold(text({ fontFamily: 'Foo Light', text: 'A<b>B</b>' }))).toBe(false);
    // The heaviest weight has nothing heavier: its bold is faked.
    expect(hasFakedBold(text({ fontWeight: 'bold', fontFamily: 'Foo SemiBold' }))).toBe(true);
  });

  it('is false for a family without a registered file: a system font brings its own bold', () => {
    expect(hasFakedBold(text({ fontWeight: 'bold', fontFamily: 'Arial' }))).toBe(false);
  });

  it('is true for a bold run tagged in regular text', () => {
    registered.push(font('Thin', '400'));
    expect(hasFakedBold(text({ text: 'A<b>B</b>' }))).toBe(true);
    expect(hasFakedBold(text({ text: 'A<i>B</i>' }))).toBe(false);
  });

  it('is true where only the emoji fallback has no bold file, for text that may use it', () => {
    registered.push(font('Thin', '400'), font('Thin', '700'), font(EMOJI_FALLBACK_FAMILY, '400'));
    expect(hasFakedBold(text({ fontWeight: 'bold', text: 'AB' }))).toBe(false);
    expect(hasFakedBold(text({ fontWeight: 'bold', text: `A${EMOJI}` }))).toBe(true);
  });
});

describe('wantsVectorOutline', () => {
  const fakedBold = { fontWeight: 'bold' as const, stroke: '#ff0000ff', strokeWidth: 4 };
  beforeEach(() => {
    registered.push(font('Thin', '400'));
  });

  it('wants one for an outlined text with faked bold and a see-through fill', () => {
    expect(wantsVectorOutline(text({ ...fakedBold, fill: '#ffffff00' }))).toBe(true);
    expect(wantsVectorOutline(text({ ...fakedBold, fill: '#ffffff80' }))).toBe(true);
  });

  it('leaves the outline to the browser under opaque fills', () => {
    expect(wantsVectorOutline(text({ ...fakedBold, fill: '#ffffff', secondaryFill: '#000000' }))).toBe(false);
  });

  it('leaves it to the browser without an outline, or without faked bold', () => {
    expect(wantsVectorOutline(text({ ...fakedBold, fill: '#ffffff00', strokeWidth: 0 }))).toBe(false);
    expect(wantsVectorOutline(text({ ...fakedBold, fill: '#ffffff00', stroke: '#ff000000' }))).toBe(false);
    expect(wantsVectorOutline(text({ ...fakedBold, fill: '#ffffff00', fontWeight: 'normal' }))).toBe(false);
  });

  it('counts the colours of tagged runs as fills', () => {
    const opaque = { fill: '#ffffff', secondaryFill: '#000000' };
    expect(hasSeeThroughFill(text({ ...opaque, text: 'A<color=#ff000080>B</color>' }))).toBe(true);
    expect(hasSeeThroughFill(text({ ...opaque, text: 'A<color=#ff0000>B</color>' }))).toBe(false);
    expect(hasSeeThroughFill(text({ ...opaque, text: '<gradient start=#ff0000 end=#00ff0000>AB</gradient>' }))).toBe(true);
  });
});

describe('the fonts read for an item', () => {
  const bold = { fontWeight: 'bold' as const };

  it('are null until read, then there', async () => {
    loadFontBytes.mockResolvedValue(bytesFor(fakeOutlineFont, { bold: true, italic: false }));
    const item = text(bold);
    expect(peekFontOutlines(item)).toBeNull();

    const before = fontOutlinesVersion();
    requestFontOutlines(item);
    expect(await fontOutlinesSettled()).toBe(true);
    expect(fontOutlinesVersion()).toBeGreaterThan(before);
    expect(peekFontOutlines(item)?.getOutlineFont(item)).toMatchObject({
      ok: true,
      synthetic: { bold: true, italic: false },
    });
    expect(await fontOutlinesSettled()).toBe(false);
  });

  it('reads a font once, however many items and runs are drawn with it', async () => {
    loadFontBytes.mockResolvedValue(bytesFor(fakeOutlineFont));
    const plain = text(bold);
    const tagged = text({ ...bold, text: 'A<color=#ff0000>B</color>C' });
    requestFontOutlines(plain);
    requestFontOutlines(plain);
    requestFontOutlines(tagged);
    await fontOutlinesSettled();
    requestFontOutlines(tagged);
    await fontOutlinesSettled();
    expect(loadFontBytes).toHaveBeenCalledTimes(1);
  });

  it('has an item whose text or tags change at once, from what has been read', async () => {
    loadFontBytes.mockResolvedValue(bytesFor(fakeOutlineFont));
    requestFontOutlines(text(bold));
    await fontOutlinesSettled();

    // Another text and other runs in the same font: nothing to wait for.
    const changed = text({ ...bold, text: 'A<color=#ff0000>B</color> more' });
    expect(peekFontOutlines(changed)).not.toBeNull();
    expect(loadFontBytes).toHaveBeenCalledTimes(1);
  });

  it('reads another font of the same family apart', async () => {
    loadFontBytes.mockImplementation(async () => bytesFor(fakeOutlineFont));
    const mixed = text({ text: 'A<b>B</b>' });
    requestFontOutlines(mixed);
    await fontOutlinesSettled();
    // Regular and bold are two variants, each resolved for itself.
    expect(loadFontBytes).toHaveBeenCalledTimes(2);
    expect(peekFontOutlines(mixed)).not.toBeNull();
  });

  it('picks the emoji fallback up when the text comes to need it, without reading the font again', async () => {
    const fallback: OutlineFont = { ...fakeOutlineFont };
    loadFontBytes.mockResolvedValue(bytesFor(latinOnly));
    loadFallbackFontBytes.mockResolvedValue(bytesFor(fallback, { bold: true, italic: false }));

    const latin = text(bold);
    requestFontOutlines(latin);
    await fontOutlinesSettled();
    expect(loadFallbackFontBytes).not.toHaveBeenCalled();
    const without = peekFontOutlines(latin)?.getOutlineFont(latin);
    expect(without).toMatchObject({ ok: true });
    expect(without && 'fallback' in without).toBe(false);

    // The same item gains a character its own font lacks.
    const withEmoji = text({ ...bold, text: `AB${EMOJI}` });
    expect(peekFontOutlines(withEmoji)).toBeNull();
    requestFontOutlines(withEmoji);
    await fontOutlinesSettled();
    expect(loadFontBytes).toHaveBeenCalledTimes(1);
    expect(loadFallbackFontBytes).toHaveBeenCalledTimes(1);
    expect(peekFontOutlines(withEmoji)?.getOutlineFont(withEmoji)).toMatchObject({
      ok: true,
      fallback: { synthetic: { bold: true, italic: false } },
    });

    // The plain item still has none: the fallback goes by each item's own text.
    const still = peekFontOutlines(latin)?.getOutlineFont(latin);
    expect(still && 'fallback' in still).toBe(false);
  });

  it('keeps the fallback by the weight a bold run is drawn in: real bold and faked bold each get their own', async () => {
    // Bold "Foo Light" is drawn in "Foo SemiBold", regular; bold "Foo SemiBold" has its bold faked.
    registered.push(font('Foo Light', '400'), font('Foo SemiBold', '400'));
    const regularFallback: OutlineFont = { ...fakeOutlineFont };
    const boldFallback: OutlineFont = { ...fakeOutlineFont };
    loadFontBytes.mockResolvedValue(bytesFor(latinOnly));
    loadFallbackFontBytes.mockImplementation(async (run) =>
      run.fontFamily === 'Foo Light'
        ? bytesFor(regularFallback)
        : bytesFor(boldFallback, { bold: true, italic: false }),
    );

    const real = text({ ...bold, fontFamily: 'Foo Light', text: `A${EMOJI}` });
    const faked = text({ ...bold, fontFamily: 'Foo SemiBold', text: `A${EMOJI}` });
    requestFontOutlines(real);
    requestFontOutlines(faked);
    await fontOutlinesSettled();

    expect(loadFallbackFontBytes).toHaveBeenCalledTimes(2);
    const ofReal = peekFontOutlines(real)?.getOutlineFont(real);
    const ofFaked = peekFontOutlines(faked)?.getOutlineFont(faked);
    expect(ofReal).toMatchObject({ ok: true, fallback: {} });
    expect(ofReal && 'fallback' in ofReal && ofReal.fallback && 'synthetic' in ofReal.fallback).toBe(false);
    expect(ofFaked).toMatchObject({ ok: true, fallback: { synthetic: { bold: true, italic: false } } });
  });

  it('reads own font and fallback in one go for a text that needs both', async () => {
    loadFontBytes.mockResolvedValue(bytesFor(latinOnly));
    loadFallbackFontBytes.mockResolvedValue(bytesFor({ ...fakeOutlineFont }));
    const item = text({ ...bold, text: `A${EMOJI}` });
    requestFontOutlines(item);
    await fontOutlinesSettled();
    expect(peekFontOutlines(item)?.getOutlineFont(item)).toMatchObject({ ok: true, fallback: {} });
  });

  it('keeps a font that could not be read as that, and the outline the browser\'s', async () => {
    loadFontBytes.mockRejectedValue(new Error('offline'));
    const item = text(bold);
    requestFontOutlines(item);
    await fontOutlinesSettled();
    const fontOutlines = peekFontOutlines(item);
    expect(fontOutlines?.getOutlineFont(item)).toEqual({ ok: false, reason: 'no-bytes' });
    expect(textOutlineShapes(item, fontOutlines as FontOutlineProvider)).toBeNull();
    // And it is not asked for again.
    requestFontOutlines(item);
    await fontOutlinesSettled();
    expect(loadFontBytes).toHaveBeenCalledTimes(1);
  });

  it('reads a family anew once another file is registered for it, and drops what it had', async () => {
    loadFontBytes.mockResolvedValue(bytesFor(fakeOutlineFont));
    const item = text(bold);
    requestFontOutlines(item);
    await fontOutlinesSettled();
    const before = fontOutlinesVersion();

    announceFontRegistration('Thin');
    expect(fontOutlinesVersion()).toBeGreaterThan(before);
    expect(peekFontOutlines(item)).toBeNull();
    requestFontOutlines(item);
    await fontOutlinesSettled();
    expect(loadFontBytes).toHaveBeenCalledTimes(2);
    expect(peekFontOutlines(item)).not.toBeNull();
  });
});

describe('textOutlineShapes', () => {
  const outlined = { stroke: '#ff0000ff', strokeWidth: 8, fontWeight: 'bold' as const };
  const provider = (synthetic?: { bold: boolean; italic: boolean }): FontOutlineProvider => ({
    getOutlineFont: () => ({ ok: true, font: fakeOutlineFont, ...(synthetic ? { synthetic } : {}) }),
  });

  it('gives the pieces of the outline where bold is faked', () => {
    const shapes = textOutlineShapes(text(outlined), provider({ bold: true, italic: false }));
    expect(shapes).toHaveLength(1);
    expect(shapes?.[0].bold).toEqual({ kind: 'stroke', width: 2 });
  });

  it('gives every fragment of tagged text, faked or not', () => {
    const fontOutlines: FontOutlineProvider = {
      getOutlineFont: (run) => ({
        ok: true,
        font: fakeOutlineFont,
        ...(run.fontWeight === 'bold' ? { synthetic: { bold: true, italic: false } } : {}),
      }),
    };
    const shapes = textOutlineShapes(text({ ...outlined, fontWeight: 'normal', text: 'A<b>B</b>' }), fontOutlines);
    expect(shapes?.map((shape) => shape.bold?.kind ?? null)).toEqual([null, 'stroke']);
  });

  it('is null where no bold is faked after all', () => {
    expect(textOutlineShapes(text(outlined), provider())).toBeNull();
  });

  it('is null where part of the text has no contours', () => {
    const none: FontOutlineProvider = { getOutlineFont: () => ({ ok: false, reason: 'system-font' }) };
    expect(textOutlineShapes(text(outlined), none)).toBeNull();
  });
});

describe('outlineBox', () => {
  const area = { x: -100, y: -100, width: 400, height: 300 };
  const shape = (overrides: Partial<TextOutlineShape>): TextOutlineShape => ({
    d: 'M10 20L50 20L50 80Z',
    unsmearedD: 'M10 20L50 20L50 80Z',
    bold: null,
    area,
    ...overrides,
  });

  it('is the box of the contours\' points, grown by half the outline and a px', () => {
    expect(outlineBox(shape({}), 6)).toEqual({ left: 6, top: 16, right: 54, bottom: 84 });
  });

  it('counts control points, and numbers written without a space before a minus', () => {
    const curved = shape({ d: 'M0 0Q30-10 60 0C70 5 70 15 60 20Z' });
    expect(outlineBox(curved, 0)).toEqual({ left: -1, top: -11, right: 71, bottom: 21 });
  });

  it('leaves room for the growth of faked bold, miters included', () => {
    const grown = shape({ bold: { kind: 'stroke', width: 2 } });
    // Half the outline (3), twice the growth (4) and a px.
    expect(outlineBox(grown, 6)).toEqual({ left: 2, top: 12, right: 58, bottom: 88 });
  });

  it('never leaves the area', () => {
    const tight = { x: 8, y: 18, width: 44, height: 64 };
    expect(outlineBox(shape({ area: tight }), 20)).toEqual({ left: 8, top: 18, right: 52, bottom: 82 });
  });

  it('is the whole area for path data it cannot read', () => {
    const whole = { left: -100, top: -100, right: 300, bottom: 200 };
    expect(outlineBox(shape({ d: 'M10 20h40v60z' }), 6)).toEqual(whole);
    expect(outlineBox(shape({ d: '' }), 6)).toEqual(whole);
    expect(outlineBox(shape({ d: 'M10 20L50' }), 6)).toEqual(whole);
  });
});
