import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import type { TextCanvasItem } from '../../document/documentTypes';
import { makeSvgDeps } from '../../../test/svgExportFakes';
import { documentToSvg } from './documentToSvg';
import type {
  FallbackOutline,
  GlyphPathStyle,
  OutlineFont,
  SubstituteGlyph,
  SyntheticFontStyle,
  TextSubstitutions,
} from './svgExportTypes';

// The fake measurer gives every character (UTF-16 unit) 10px. The text's own
// font draws 10px boxes; the fallback draws 20px boxes for characters and boxes
// as wide as the glyph index for substituted glyphs, so the width of a box tells
// which font drew it.

const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const SMILE = chars(0x1f600); // two UTF-16 units: 20px
const MAN = chars(0x1f468);
const WOMAN = chars(0x1f469);
const ZWJ = chars(0x200d);
const KEYCAP = chars(0x20e3);
const FAMILY_GLYPH = 70;

interface GlyphCall {
  glyph: string | number;
  style?: GlyphPathStyle;
}

/** The text's own font: every character below U+2000, which takes in the digits but not the keycap mark. */
function ownFont(calls: GlyphCall[] = []): OutlineFont {
  return {
    unitsPerEm: 1000,
    glyphPath: (glyph: string | number, _size: number, penX: number, baselineY: number, style?: GlyphPathStyle) => {
      calls.push({ glyph, style });
      return glyph === ' ' ? null : `M${penX} ${baselineY}h10v-10h-10Z`;
    },
    hasGlyph: (ch: string) => (ch.codePointAt(0) ?? 0) < 0x2000,
  };
}

/**
 * The emoji fallback: everything from U+2000 on, the digits as keycap bases, and
 * a family glyph for man + joiner + woman.
 */
function fallbackFont(calls: GlyphCall[] = [], asked: string[] = []): OutlineFont {
  return {
    unitsPerEm: 1000,
    glyphPath: (glyph: string | number, _size: number, penX: number, baselineY: number, style?: GlyphPathStyle) => {
      calls.push({ glyph, style });
      if (glyph === ZWJ) return null;
      const width = typeof glyph === 'number' ? glyph : 20;
      return `M${penX} ${baselineY}h${width}v-10h-${width}Z`;
    },
    hasGlyph: (ch: string) => (ch.codePointAt(0) ?? 0) >= 0x2000 || /[0-9]/.test(ch),
    substitutions(text): TextSubstitutions | null {
      asked.push(text);
      const list = [...text];
      const out: (SubstituteGlyph[] | null)[] = list.map(() => null);
      let any = false;
      list.forEach((ch, index) => {
        if (ch === MAN && list[index + 1] === ZWJ && list[index + 2] === WOMAN) {
          out[index] = [{ glyph: FAMILY_GLYPH, advance: 1 }];
          out[index + 1] = [];
          out[index + 2] = [];
          any = true;
        }
      });
      return any ? out : null;
    },
  };
}

function exportText(
  overrides: Partial<TextCanvasItem>,
  fonts: { own?: OutlineFont; synthetic?: SyntheticFontStyle; fallback?: FallbackOutline | null } = {},
): string {
  const doc = { ...createDefaultProjectDocument(), nodes: [createTextItem({ id: 'text', ...overrides })] };
  const font = fonts.own ?? ownFont();
  const fallback = fonts.fallback === undefined ? { font: fallbackFont() } : fonts.fallback;
  return documentToSvg(
    doc,
    makeSvgDeps({
      fontOutlines: {
        getOutlineFont: () => ({
          ok: true,
          font,
          ...(fonts.synthetic ? { synthetic: fonts.synthetic } : {}),
          ...(fallback ? { fallback } : {}),
        }),
      },
    }),
  ).svg;
}

/** The `<path>` elements of the export, each with its glyph boxes as [penX, width]. */
function pathElements(svg: string) {
  return [...svg.matchAll(/<path d="([^"]+)"([^>]*)\/>/g)].map((match) => ({
    boxes: [...match[1].matchAll(/M(-?\d+(?:\.\d+)?) -?\d+(?:\.\d+)?h(\d+(?:\.\d+)?)/g)].map((box) => [
      Number(box[1]),
      Number(box[2]),
    ]),
    attributes: match[2],
  }));
}

const left = { align: 'left' as const, padding: { top: 0, right: 0, bottom: 0, left: 0 }, width: 1000 };

describe('svgText with the emoji fallback', () => {
  it('outlines what the font lacks from the fallback, in a path of its own', () => {
    const paths = pathElements(exportText({ ...left, text: `Hi ${SMILE}!` }));

    expect(paths.map((path) => path.boxes)).toEqual([
      // H, i, and the ! after the emoji: the emoji is 20px wide to the measurer.
      [
        [0, 10],
        [10, 10],
        [50, 10],
      ],
      [[30, 20]],
    ]);
  });

  it('draws everything from the item font when there is no fallback', () => {
    const paths = pathElements(exportText({ ...left, text: `Hi ${SMILE}` }, { fallback: null }));

    expect(paths).toHaveLength(1);
    expect(paths[0].boxes).toEqual([
      [0, 10],
      [10, 10],
      [30, 10],
    ]);
  });

  it('applies the fallback font\'s substitutions to the run it draws, joining an emoji sequence', () => {
    const asked: string[] = [];
    const svg = exportText(
      { ...left, text: `a ${MAN}${ZWJ}${WOMAN} b` },
      { fallback: { font: fallbackFont([], asked) } },
    );

    expect(asked).toEqual([`${MAN}${ZWJ}${WOMAN}`]);
    expect(pathElements(svg).map((path) => path.boxes)).toEqual([
      [
        [0, 10],
        // a (10) + space (10) + man (20) + joiner (10) + woman (20)
        [80, 10],
      ],
      [[20, FAMILY_GLYPH]],
    ]);
  });

  it('draws a whole grapheme from the fallback when the item font lacks part of it, as a keycap', () => {
    const svg = exportText({ ...left, text: `1${KEYCAP} 1` });

    expect(pathElements(svg).map((path) => path.boxes)).toEqual([
      // The lone 1 stays in the item font.
      [[30, 10]],
      // The keycap's 1 and its mark.
      [
        [0, 20],
        [10, 20],
      ],
    ]);
  });

  it('fakes bold on the fallback glyphs alone when only the fallback lacks a bold face', () => {
    const svg = exportText(
      { ...left, text: `Hi ${SMILE}`, fontWeight: 'bold', fill: '#ff0000' },
      { fallback: { font: fallbackFont(), synthetic: { bold: true, italic: false } } },
    );
    const [own, fallback] = pathElements(svg);

    expect(own.attributes).not.toContain('stroke');
    expect(fallback.attributes).toContain('stroke="#ff0000"');
  });

  it('leans the fallback glyphs alone when only the fallback lacks an italic face', () => {
    const ownCalls: GlyphCall[] = [];
    const fallbackCalls: GlyphCall[] = [];
    exportText(
      { ...left, text: `Hi ${SMILE}`, fontStyle: 'italic' },
      { own: ownFont(ownCalls), fallback: { font: fallbackFont(fallbackCalls), synthetic: { bold: false, italic: true } } },
    );

    expect(ownCalls.every((call) => !call.style?.slant)).toBe(true);
    expect(fallbackCalls.length).toBeGreaterThan(0);
    expect(fallbackCalls.every((call) => (call.style?.slant ?? 0) > 0)).toBe(true);
  });

  it('gives each faked bold its own mask where a see-through gradient needs one', () => {
    const svg = exportText(
      {
        ...left,
        text: `Hi ${SMILE}`,
        fontWeight: 'bold',
        gradientEnabled: true,
        fill: '#ff000080',
        secondaryFill: '#0000ff',
      },
      { synthetic: { bold: true, italic: false }, fallback: { font: fallbackFont(), synthetic: { bold: true, italic: false } } },
    );

    expect([...svg.matchAll(/<mask id="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'bold-text',
      'bold-text-fallback',
    ]);
    expect(svg).toContain('mask="url(#bold-text)"');
    expect(svg).toContain('mask="url(#bold-text-fallback)"');
  });

  it('asks the fallback about each grapheme on its own when the text is letter spaced', () => {
    const asked: string[] = [];
    exportText(
      { ...left, text: `${SMILE}${MAN}${ZWJ}${WOMAN}`, letterSpacing: 4 },
      { fallback: { font: fallbackFont([], asked) } },
    );

    expect(asked).toEqual([SMILE, `${MAN}${ZWJ}${WOMAN}`]);
  });
});
