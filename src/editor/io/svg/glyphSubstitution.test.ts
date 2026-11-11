// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as opentype from 'opentype.js';
import { describe, expect, it } from 'vitest';

import { createGlyphSubstituter, createTextSubstitutions } from './glyphSubstitution';

// Characters that are invisible, combine with their neighbour or read right to left,
// by code point, so that the tests can be read.
const FRACTION_SLASH = String.fromCodePoint(0x2044);
const COMBINING_ACUTE = String.fromCodePoint(0x0301);
const COMBINING_GRAVE = String.fromCodePoint(0x0300);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const ZERO_WIDTH_NON_JOINER = String.fromCodePoint(0x200c);
const CYRILLIC_BE = String.fromCodePoint(0x0431);
const CYRILLIC_VE = String.fromCodePoint(0x0432);
const HEBREW_ALEF = String.fromCodePoint(0x05d0);
const HEBREW_BET = String.fromCodePoint(0x05d1);
/** A character the hand-made font has no glyph for. */
const SNOWMAN = String.fromCodePoint(0x2603);

// ---------------------------------------------------------------------------
// A font small enough to read: glyph ids are assigned by hand, and the GSUB and
// GDEF tables are written in the shape opentype.js parses them into.
// ---------------------------------------------------------------------------

/** Glyph id of a character in the hand-made font: a-z are 1-26, 0-9 are 30-39. */
function gid(ch: string): number {
  const code = ch.codePointAt(0)!;
  if (code >= 0x61 && code <= 0x7a) return code - 0x60;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 30;
  const others: Record<string, number> = {
    ' ': 40,
    '-': 41,
    '>': 42,
    ':': 43,
    [FRACTION_SLASH]: 44,
    [COMBINING_ACUTE]: 50,
    [COMBINING_GRAVE]: 51,
    // The zero width characters have no glyph of their own.
    [ZERO_WIDTH_JOINER]: 0,
    [ZERO_WIDTH_NON_JOINER]: 0,
    A: 60,
    B: 61,
    [CYRILLIC_BE]: 70,
    [CYRILLIC_VE]: 71,
    [HEBREW_ALEF]: 75,
    [HEBREW_BET]: 76,
  };
  return others[ch] ?? 0;
}

// Glyphs that only substitution can produce.
const FI = 100;
const FL = 101;
const FFI = 102;
const FF = 103;
const ALT = 110; // alternates are ALT + the glyph they replace
const WIDE = 200;

type Table = Record<string, unknown>;

const coverage = (...glyphs: number[]): Table => ({ format: 1, glyphs: [...glyphs].sort((a, b) => a - b) });
const coverageOf = (text: string): Table => coverage(...[...text].map(gid));
const rangeCoverage = (start: number, end: number): Table => ({ format: 2, ranges: [{ start, end, index: 0 }] });

const lookup = (lookupType: number, subtables: Table[], lookupFlag = 0, markFilteringSet?: number): Table => ({
  lookupType,
  lookupFlag,
  subtables,
  markFilteringSet,
});

/** Lookup type 4: `ligatures` maps the spelled-out characters to the glyph they join into. */
function ligatureLookup(ligatures: Array<[string, number]>, lookupFlag = 0, markFilteringSet?: number): Table {
  const firsts = [...new Set(ligatures.map(([text]) => gid(text[0])))].sort((a, b) => a - b);
  return lookup(
    4,
    [
      {
        substFormat: 1,
        coverage: coverage(...firsts),
        ligatureSets: firsts.map((first) =>
          ligatures
            .filter(([text]) => gid(text[0]) === first)
            .map(([text, ligGlyph]) => ({ ligGlyph, components: [...text].slice(1).map(gid) })),
        ),
      },
    ],
    lookupFlag,
    markFilteringSet,
  );
}

/** Lookup type 1, format 2: each character of `from` becomes the glyph at the same place in `to`. */
function singleLookup(from: string, to: number[]): Table {
  const pairs = [...from].map((ch, index) => [gid(ch), to[index]] as const).sort((a, b) => a[0] - b[0]);
  return lookup(1, [
    { substFormat: 2, coverage: coverage(...pairs.map(([glyph]) => glyph)), substitute: pairs.map(([, by]) => by) },
  ]);
}

interface FeatureSpec {
  tag: string;
  lookups: number[];
}

interface ScriptSpec {
  tag: string;
  /** Indexes into the feature list of the default language system; omitted = all features. */
  features?: number[];
  required?: number;
  languages?: Array<{ tag: string; features: number[] }>;
  noDefault?: boolean;
}

function gsubTable(lookups: Table[], features: FeatureSpec[], scripts: ScriptSpec[] = [{ tag: 'DFLT' }]): Table {
  const all = features.map((_, index) => index);
  return {
    version: 1,
    scripts: scripts.map((script) => ({
      tag: script.tag,
      script: {
        defaultLangSys: script.noDefault
          ? undefined
          : { reserved: 0, reqFeatureIndex: script.required ?? 0xffff, featureIndexes: script.features ?? all },
        langSysRecords: (script.languages ?? []).map((language) => ({
          tag: language.tag,
          langSys: { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: language.features },
        })),
      },
    })),
    features: features.map((feature) => ({
      tag: feature.tag,
      feature: { featureParams: 0, lookupListIndexes: feature.lookups },
    })),
    lookups,
  };
}

function fontWith(gsub: Table | undefined, gdef?: Table) {
  return {
    charToGlyphIndex: (ch: string) => gid(ch),
    tables: { gsub, gdef },
  };
}

/** A font whose only feature is `liga`, with the given lookups in order. */
function ligaFont(lookups: Table[], gdef?: Table) {
  return fontWith(gsubTable(lookups, [{ tag: 'liga', lookups: lookups.map((_, index) => index) }]), gdef);
}

/** The glyphs drawn at each character of `text`; null when every character keeps its own glyph. */
function shape(font: ReturnType<typeof fontWith>, text: string, language?: string) {
  return createGlyphSubstituter(font)(text, language);
}

const F_LIGATURES: Array<[string, number]> = [
  ['ffi', FFI],
  ['ff', FF],
  ['fi', FI],
  ['fl', FL],
];

describe('glyph substitution: when nothing is substituted', () => {
  it('returns null for a font without a GSUB table', () => {
    expect(shape(fontWith(undefined), 'office')).toBeNull();
  });

  it('returns null for text the font has no rule for', () => {
    expect(shape(ligaFont([ligatureLookup(F_LIGATURES)]), 'hamburg')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(shape(ligaFont([ligatureLookup(F_LIGATURES)]), '')).toBeNull();
  });
});

describe('glyph substitution: ligatures (lookup type 4)', () => {
  const font = ligaFont([ligatureLookup(F_LIGATURES)]);

  it('draws the ligature at its first character and nothing at the characters it covers', () => {
    expect(shape(font, 'fi')).toEqual([[FI], []]);
  });

  it('leaves the characters around a ligature with their own glyphs', () => {
    expect(shape(font, 'a fit')).toEqual([[gid('a')], [gid(' ')], [FI], [], [gid('t')]]);
  });

  it('takes the first ligature of the set that matches, as the font orders them', () => {
    expect(shape(font, 'office')).toEqual([[gid('o')], [FFI], [], [], [gid('c')], [gid('e')]]);
    expect(shape(font, 'off')).toEqual([[gid('o')], [FF], []]);
    // "ff" is listed before "fi", so f-f-l joins the two f and leaves the l alone.
    expect(shape(font, 'ffl')).toEqual([[FF], [], [gid('l')]]);
  });

  it('forms every ligature of a line, not just the first', () => {
    expect(shape(font, 'fi fl')).toEqual([[FI], [], [gid(' ')], [FL], []]);
  });

  it('a later lookup can join a ligature an earlier one made', () => {
    // Albertus-style: lookup 0 makes f_i, lookup 1 joins f + f_i.
    const twoStep = ligaFont([
      ligatureLookup([['fi', FI]]),
      lookup(4, [
        {
          substFormat: 1,
          coverage: coverageOf('f'),
          ligatureSets: [[{ ligGlyph: FFI, components: [FI] }]],
        },
      ]),
    ]);
    expect(shape(twoStep, 'ffi')).toEqual([[FFI], [], []]);
  });

  it('a ligature that a later lookup takes apart again leaves the letters as they were', () => {
    const font = ligaFont([
      ligatureLookup([['fi', FI]]),
      lookup(2, [{ substFormat: 1, coverage: coverage(FI), sequences: [[gid('f'), gid('i')]] }]),
    ]);
    expect(shape(font, 'fi')).toBeNull();
    // ...also next to a real substitution, where the answer is not null.
    const mixed = ligaFont([
      ligatureLookup([
        ['fi', FI],
        ['fl', FL],
      ]),
      lookup(2, [{ substFormat: 1, coverage: coverage(FI), sequences: [[gid('f'), gid('i')]] }]),
    ]);
    expect(shape(mixed, 'fifl')).toEqual([[gid('f')], [gid('i')], [FL], []]);
  });

  it('reads a coverage table given as ranges', () => {
    const ranged = ligaFont([
      lookup(4, [
        {
          substFormat: 1,
          coverage: rangeCoverage(gid('f'), gid('f')),
          ligatureSets: [[{ ligGlyph: FI, components: [gid('i')] }]],
        },
      ]),
    ]);
    expect(shape(ranged, 'fi')).toEqual([[FI], []]);
  });
});

describe('glyph substitution: one-for-one and one-to-many (lookup types 1, 2, 3)', () => {
  it('replaces a glyph by adding the delta of a format 1 single substitution', () => {
    const font = ligaFont([lookup(1, [{ substFormat: 1, coverage: coverageOf('ab'), deltaGlyphId: ALT }])]);
    expect(shape(font, 'cab')).toEqual([[gid('c')], [gid('a') + ALT], [gid('b') + ALT]]);
  });

  it('wraps a format 1 delta around at 65536', () => {
    const font = ligaFont([lookup(1, [{ substFormat: 1, coverage: coverageOf('c'), deltaGlyphId: -1 + 65536 }])]);
    expect(shape(font, 'c')).toEqual([[gid('b')]]);
  });

  it('replaces a glyph from the list of a format 2 single substitution', () => {
    const font = ligaFont([singleLookup('ab', [WIDE, WIDE + 1])]);
    expect(shape(font, 'abc')).toEqual([[WIDE], [WIDE + 1], [gid('c')]]);
  });

  it('draws every glyph of a multiple substitution at the one character it replaces', () => {
    const font = ligaFont([
      lookup(2, [{ substFormat: 1, coverage: coverageOf('a'), sequences: [[gid('b'), gid('c')]] }]),
    ]);
    expect(shape(font, 'xay')).toEqual([[gid('x')], [gid('b'), gid('c')], [gid('y')]]);
  });

  it('draws nothing for a glyph a multiple substitution replaces with an empty sequence', () => {
    const font = ligaFont([lookup(2, [{ substFormat: 1, coverage: coverageOf('a'), sequences: [[]] }])]);
    expect(shape(font, 'xay')).toEqual([[gid('x')], [], [gid('y')]]);
  });

  it('keeps the glyphs of a character together when one of them joins the next character', () => {
    // a becomes b f; then that f joins the following i. Everything is drawn at the a.
    const font = ligaFont([
      lookup(2, [{ substFormat: 1, coverage: coverageOf('a'), sequences: [[gid('b'), gid('f')]] }]),
      ligatureLookup([['fi', FI]]),
    ]);
    expect(shape(font, 'aix')).toEqual([[gid('b'), FI], [], [gid('x')]]);
  });

  it('takes the first alternate of an alternate substitution', () => {
    const font = ligaFont([
      lookup(3, [{ substFormat: 1, coverage: coverageOf('a'), alternateSets: [[WIDE, WIDE + 1]] }]),
    ]);
    expect(shape(font, 'a')).toEqual([[WIDE]]);
  });

  it('looks through an extension lookup (type 7) to the lookup it wraps', () => {
    const inner = ligatureLookup([['fi', FI]]);
    const font = ligaFont([
      lookup(7, [{ substFormat: 1, lookupType: 4, extension: (inner.subtables as Table[])[0] }]),
    ]);
    expect(shape(font, 'fi')).toEqual([[FI], []]);
  });
});

describe('glyph substitution: which features run', () => {
  // The substitution features Chromium applies to canvas text when nothing asks
  // for more (measured with a probe font, one feature per character).
  it.each(['calt', 'ccmp', 'clig', 'liga', 'locl', 'ltra', 'ltrm', 'rclt', 'rlig', 'rvrn'])(
    'applies %s',
    (tag) => {
      const font = fontWith(gsubTable([singleLookup('a', [WIDE])], [{ tag, lookups: [0] }]));
      expect(shape(font, 'a')).toEqual([[WIDE]]);
    },
  );

  it.each(['aalt', 'c2sc', 'case', 'dlig', 'hlig', 'onum', 'ordn', 'salt', 'smcp', 'ss01', 'sups', 'swsh', 'zero'])(
    'leaves %s alone: the canvas only applies it on request',
    (tag) => {
      const font = fontWith(gsubTable([singleLookup('a', [WIDE])], [{ tag, lookups: [0] }]));
      expect(shape(font, 'a')).toBeNull();
    },
  );

  it('runs lookups in the order of the lookup list, whatever feature they belong to', () => {
    // liga owns lookup 1 (f + i -> fi), calt owns lookup 0 (i -> alternate). The
    // alternate is made first, so the ligature no longer finds its i.
    const font = fontWith(
      gsubTable(
        [singleLookup('i', [gid('i') + ALT]), ligatureLookup([['fi', FI]])],
        [
          { tag: 'liga', lookups: [1] },
          { tag: 'calt', lookups: [0] },
        ],
      ),
    );
    expect(shape(font, 'fi')).toEqual([[gid('f')], [gid('i') + ALT]]);
  });

  it('runs a lookup once even when two features list it', () => {
    const font = fontWith(
      gsubTable(
        [lookup(1, [{ substFormat: 1, coverage: rangeCoverage(1, 30), deltaGlyphId: 1 }])],
        [
          { tag: 'calt', lookups: [0] },
          { tag: 'liga', lookups: [0] },
        ],
      ),
    );
    expect(shape(font, 'a')).toEqual([[gid('b')]]);
  });

  it('runs rvrn before every other feature', () => {
    // rvrn owns the later lookup 1 (a -> b); liga owns lookup 0 (b -> wide). If
    // rvrn went by lookup order with the rest, the b it makes would stay a b.
    const font = fontWith(
      gsubTable(
        [singleLookup('b', [WIDE]), singleLookup('a', [gid('b')])],
        [
          { tag: 'liga', lookups: [0] },
          { tag: 'rvrn', lookups: [1] },
        ],
      ),
    );
    expect(shape(font, 'a')).toEqual([[WIDE]]);
  });

  it('applies the required feature of the language system, whatever its tag', () => {
    const font = fontWith(
      gsubTable([singleLookup('a', [WIDE])], [{ tag: 'zzzz', lookups: [0] }], [{ tag: 'DFLT', features: [], required: 0 }]),
    );
    expect(shape(font, 'a')).toEqual([[WIDE]]);
  });

  it('applies frac, numr and dnom only to digits on both sides of a fraction slash', () => {
    const font = fontWith(
      gsubTable(
        [singleLookup('1', [WIDE]), singleLookup('2', [WIDE + 1]), singleLookup('3', [WIDE + 2])],
        [
          { tag: 'dnom', lookups: [1] },
          { tag: 'frac', lookups: [2] },
          { tag: 'numr', lookups: [0] },
        ],
      ),
    );
    // numerator 1, denominator 2
    expect(shape(font, `1${FRACTION_SLASH}2`)).toEqual([[WIDE], [gid(FRACTION_SLASH)], [WIDE + 1]]);
    // frac reaches the digits on both sides
    expect(shape(font, `3${FRACTION_SLASH}3`)).toEqual([[WIDE + 2], [gid(FRACTION_SLASH)], [WIDE + 2]]);
    // a 2 before the slash is a numerator, not a denominator
    expect(shape(font, `2${FRACTION_SLASH}1`)).toBeNull();
    // no fraction slash, or a digit missing on one side: plain digits
    expect(shape(font, '123')).toBeNull();
    expect(shape(font, `1${FRACTION_SLASH}`)).toBeNull();
    expect(shape(font, `a 1${FRACTION_SLASH}2 b 1`)).toEqual([
      [gid('a')],
      [gid(' ')],
      [WIDE],
      [gid(FRACTION_SLASH)],
      [WIDE + 1],
      [gid(' ')],
      [gid('b')],
      [gid(' ')],
      [gid('1')],
    ]);
  });
});

describe('glyph substitution: contextual rules (lookup types 5 and 6)', () => {
  interface LookupRecord {
    sequenceIndex: number;
    lookupListIndex: number;
  }
  const toAlt = (text: string) => singleLookup(text, [...text].map((ch) => gid(ch) + ALT));
  const record = (sequenceIndex: number, lookupListIndex: number): LookupRecord => ({ sequenceIndex, lookupListIndex });

  it('context format 1: a rule of glyphs', () => {
    // a b c -> the b (second glyph) becomes its alternate
    const font = fontWith(
      gsubTable(
        [
          lookup(5, [
            {
              substFormat: 1,
              coverage: coverageOf('a'),
              ruleSets: [[{ input: [gid('b'), gid('c')], lookupRecords: [record(1, 1)] }]],
            },
          ]),
          toAlt('b'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'abc')).toEqual([[gid('a')], [gid('b') + ALT], [gid('c')]]);
    expect(shape(font, 'abd')).toBeNull();
  });

  it('context format 2: a rule of glyph classes', () => {
    // class 1 = a, b; class 2 = c. Rule for class 1 followed by class 2: alternate for the first.
    const classDef = {
      format: 2,
      ranges: [
        { start: gid('a'), end: gid('b'), classId: 1 },
        { start: gid('c'), end: gid('c'), classId: 2 },
      ],
    };
    const font = fontWith(
      gsubTable(
        [
          lookup(5, [
            {
              substFormat: 2,
              coverage: coverageOf('ab'),
              classDef,
              classSets: [undefined, [{ classes: [2], lookupRecords: [record(0, 1)] }]],
            },
          ]),
          toAlt('ab'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'bc')).toEqual([[gid('b') + ALT], [gid('c')]]);
    expect(shape(font, 'ba')).toBeNull();
  });

  it('context format 3: one coverage table per position', () => {
    const font = fontWith(
      gsubTable(
        [
          lookup(5, [
            { substFormat: 3, coverages: [coverageOf('ab'), coverageOf('c')], lookupRecords: [record(1, 1)] },
          ]),
          toAlt('c'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'ac')).toEqual([[gid('a')], [gid('c') + ALT]]);
    expect(shape(font, 'cc')).toBeNull();
  });

  it('chaining format 3: glyphs before and after decide (a colon between digits)', () => {
    const digits = coverageOf('0123456789');
    const font = fontWith(
      gsubTable(
        [
          lookup(6, [
            {
              substFormat: 3,
              backtrackCoverage: [digits],
              inputCoverage: [coverageOf(':')],
              lookaheadCoverage: [digits],
              lookupRecords: [record(0, 1)],
            },
          ]),
          toAlt(':'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, '12:30')).toEqual([[gid('1')], [gid('2')], [gid(':') + ALT], [gid('3')], [gid('0')]]);
    expect(shape(font, 'a:30')).toBeNull();
    expect(shape(font, '12:')).toBeNull();
    expect(shape(font, ':30')).toBeNull();
  });

  it('chaining format 3: the glyphs before are listed nearest first', () => {
    // b directly before, a before that
    const font = fontWith(
      gsubTable(
        [
          lookup(6, [
            {
              substFormat: 3,
              backtrackCoverage: [coverageOf('b'), coverageOf('a')],
              inputCoverage: [coverageOf('c')],
              lookaheadCoverage: [],
              lookupRecords: [record(0, 1)],
            },
          ]),
          toAlt('c'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'abc')).toEqual([[gid('a')], [gid('b')], [gid('c') + ALT]]);
    expect(shape(font, 'bac')).toBeNull();
  });

  it('chaining format 1: rules of glyphs', () => {
    const font = fontWith(
      gsubTable(
        [
          lookup(6, [
            {
              substFormat: 1,
              coverage: coverageOf('b'),
              chainRuleSets: [
                [{ backtrack: [gid('a')], input: [gid('c')], lookahead: [gid('d')], lookupRecords: [record(1, 1)] }],
              ],
            },
          ]),
          toAlt('c'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'abcd')).toEqual([[gid('a')], [gid('b')], [gid('c') + ALT], [gid('d')]]);
    expect(shape(font, 'abce')).toBeNull();
    expect(shape(font, 'xbcd')).toBeNull();
  });

  it('chaining format 2: rules of classes, with a class table for each side', () => {
    const classOf = (text: string, classId: number) => ({
      format: 1,
      startGlyph: gid(text[0]),
      classes: [...text].map(() => classId),
    });
    const font = fontWith(
      gsubTable(
        [
          lookup(6, [
            {
              substFormat: 2,
              coverage: coverageOf('c'),
              backtrackClassDef: classOf('ab', 1),
              inputClassDef: classOf('c', 1),
              lookaheadClassDef: classOf('de', 1),
              chainClassSet: [undefined, [{ backtrack: [1], input: [], lookahead: [1], lookupRecords: [record(0, 1)] }]],
            },
          ]),
          toAlt('c'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'bce')).toEqual([[gid('b')], [gid('c') + ALT], [gid('e')]]);
    expect(shape(font, 'cce')).toBeNull();
    expect(shape(font, 'bcc')).toBeNull();
  });

  it('a glyph outside every class of a class rule is class 0', () => {
    // "anything unlisted, then c": class 0 before c
    const font = fontWith(
      gsubTable(
        [
          lookup(6, [
            {
              substFormat: 2,
              coverage: coverageOf('c'),
              backtrackClassDef: { format: 1, startGlyph: gid('a'), classes: [1] },
              inputClassDef: undefined,
              lookaheadClassDef: undefined,
              chainClassSet: [[{ backtrack: [0], input: [], lookahead: [], lookupRecords: [record(0, 1)] }]],
            },
          ]),
          toAlt('c'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'zc')).toEqual([[gid('z')], [gid('c') + ALT]]);
    expect(shape(font, 'ac')).toBeNull();
  });

  it('renumbers the positions of a rule after a nested lookup merges glyphs', () => {
    // Rule on "f i a": first join f + i. The match is then two glyphs long, fi and
    // a, so the a is position 1; a record that still asks for position 2 finds nothing.
    const rule = (second: LookupRecord) =>
      fontWith(
        gsubTable(
          [
            lookup(5, [
              {
                substFormat: 3,
                coverages: [coverageOf('f'), coverageOf('i'), coverageOf('a')],
                lookupRecords: [record(0, 1), second],
              },
            ]),
            ligatureLookup([['fi', FI]]),
            toAlt('a'),
          ],
          [{ tag: 'calt', lookups: [0] }],
        ),
      );
    expect(shape(rule(record(1, 2)), 'fia')).toEqual([[FI], [], [gid('a') + ALT]]);
    expect(shape(rule(record(2, 2)), 'fia')).toEqual([[FI], [], [gid('a')]]);
  });

  it('applies the nested lookups of a rule in order, keeping their positions as glyphs multiply', () => {
    // Rule on "a b": split the a into c d, then give the b its alternate.
    const font = fontWith(
      gsubTable(
        [
          lookup(5, [
            {
              substFormat: 3,
              coverages: [coverageOf('a'), coverageOf('b')],
              lookupRecords: [record(0, 1), record(1, 2)],
            },
          ]),
          lookup(2, [{ substFormat: 1, coverage: coverageOf('a'), sequences: [[gid('c'), gid('d')]] }]),
          toAlt('bd'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    // Position 1 is the d the split added, as HarfBuzz counts it.
    expect(shape(font, 'ab')).toEqual([[gid('c'), gid('d') + ALT], [gid('b')]]);
  });

  it('moves on past the matched glyphs: a rule does not fire again inside its own match', () => {
    // "a a" -> first a alternate. In "aaa" the rule matches at 0 and resumes at 2.
    const font = fontWith(
      gsubTable(
        [
          lookup(5, [
            { substFormat: 3, coverages: [coverageOf('a'), coverageOf('a')], lookupRecords: [record(0, 1)] },
          ]),
          toAlt('a'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'aaa')).toEqual([[gid('a') + ALT], [gid('a')], [gid('a')]]);
    expect(shape(font, 'aaaa')).toEqual([[gid('a') + ALT], [gid('a')], [gid('a') + ALT], [gid('a')]]);
  });

  it('a rule with no nested lookup still consumes its match (an "ignore" rule)', () => {
    // Subtable 1: "a f i" matches and does nothing. Subtable 2: f + i -> fi.
    const font = ligaFont([
      lookup(6, [
        {
          substFormat: 3,
          backtrackCoverage: [coverageOf('a')],
          inputCoverage: [coverageOf('f'), coverageOf('i')],
          lookaheadCoverage: [],
          lookupRecords: [],
        },
        {
          substFormat: 3,
          backtrackCoverage: [],
          inputCoverage: [coverageOf('f'), coverageOf('i')],
          lookaheadCoverage: [],
          lookupRecords: [record(0, 1)],
        },
      ]),
      ligatureLookup([['fi', FI]]),
    ]);
    // Lookup 1 also runs on its own afterwards (liga lists it), so take it out of
    // the feature to see the chaining lookup alone.
    const chainOnly = fontWith(
      gsubTable((font.tables.gsub as { lookups: Table[] }).lookups, [{ tag: 'liga', lookups: [0] }]),
    );
    expect(shape(chainOnly, 'xfi')).toEqual([[gid('x')], [FI], []]);
    expect(shape(chainOnly, 'afi')).toBeNull();
  });

  it('survives a rule that calls itself', () => {
    const font = fontWith(
      gsubTable(
        [lookup(5, [{ substFormat: 3, coverages: [coverageOf('a')], lookupRecords: [record(0, 0)] }])],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'aaaa')).toBeNull();
  });
});

describe('glyph substitution: reverse chaining (lookup type 8)', () => {
  it('works from the end of the text, so the glyph before is still the original', () => {
    // Each glyph depends on its predecessor: after an a every a or b becomes wide.
    // Forwards, the second a of "aab" would turn wide and stop the b from matching
    // its (raw) predecessor; backwards both do.
    const font = fontWith(
      gsubTable(
        [
          lookup(8, [
            {
              substFormat: 1,
              coverage: coverageOf('ab'),
              backtrackCoverage: [coverageOf('a')],
              lookaheadCoverage: [],
              substitutes: [WIDE, WIDE + 1],
            },
          ]),
        ],
        [{ tag: 'rlig', lookups: [0] }],
      ),
    );
    expect(shape(font, 'aab')).toEqual([[gid('a')], [WIDE], [WIDE + 1]]);
  });

  it('looks ahead at glyphs it has already replaced', () => {
    // a before a wide glyph becomes wide too; the last a (before b) starts it off.
    const font = fontWith(
      gsubTable(
        [
          lookup(8, [
            {
              substFormat: 1,
              coverage: coverageOf('a'),
              backtrackCoverage: [],
              lookaheadCoverage: [coverage(gid('b'), WIDE)],
              substitutes: [WIDE],
            },
          ]),
        ],
        [{ tag: 'rlig', lookups: [0] }],
      ),
    );
    expect(shape(font, 'aaab')).toEqual([[WIDE], [WIDE], [WIDE], [gid('b')]]);
    expect(shape(font, 'aaac')).toBeNull();
  });
});

describe('glyph substitution: lookup flags and glyph classes', () => {
  const ACUTE = gid(COMBINING_ACUTE);
  const GRAVE = gid(COMBINING_GRAVE);
  const gdefWithMarks = (extra: Table = {}): Table => ({
    version: 1.2,
    classDef: {
      format: 2,
      ranges: [
        { start: 1, end: 26, classId: 1 },
        { start: ACUTE, end: GRAVE, classId: 3 },
      ],
    },
    ...extra,
  });

  it('a mark between two letters stops a ligature that does not ignore marks', () => {
    const font = ligaFont([ligatureLookup([['fi', FI]])], gdefWithMarks());
    expect(shape(font, `f${COMBINING_ACUTE}i`)).toBeNull();
  });

  it('a ligature that ignores marks joins across one and keeps the mark after it', () => {
    const font = ligaFont([ligatureLookup([['fi', FI]], 0x8)], gdefWithMarks());
    // The mark is drawn with the ligature, at the first character.
    expect(shape(font, `f${COMBINING_ACUTE}i`)).toEqual([[FI, ACUTE], [], []]);
  });

  it('without a GDEF table, combining marks are still marks', () => {
    const font = ligaFont([ligatureLookup([['fi', FI]], 0x8)]);
    expect(shape(font, `f${COMBINING_ACUTE}i`)).toEqual([[FI, ACUTE], [], []]);
  });

  it('skips only the marks of a mark filtering set', () => {
    // Flag 0x10 with set 0 = {acute}: marks outside the set (grave) are skipped.
    const gdef = gdefWithMarks({ markGlyphSets: [coverage(ACUTE)] });
    const font = ligaFont([ligatureLookup([['fi', FI]], 0x10, 0)], gdef);
    expect(shape(font, `f${COMBINING_GRAVE}i`)).toEqual([[FI, GRAVE], [], []]);
    expect(shape(font, `f${COMBINING_ACUTE}i`)).toBeNull();
  });

  it('skips marks of another attachment class', () => {
    // Flag 0x0200: only marks of attachment class 2 (grave) count; acute is skipped.
    const gdef = gdefWithMarks({
      markAttachClassDef: {
        format: 2,
        ranges: [
          { start: ACUTE, end: ACUTE, classId: 1 },
          { start: GRAVE, end: GRAVE, classId: 2 },
        ],
      },
    });
    const font = ligaFont([ligatureLookup([['fi', FI]], 0x0200)], gdef);
    expect(shape(font, `f${COMBINING_ACUTE}i`)).toEqual([[FI, ACUTE], [], []]);
    expect(shape(font, `f${COMBINING_GRAVE}i`)).toBeNull();
  });

  it('ignores ligature glyphs when a lookup says so', () => {
    // Lookup 0 makes fi (a ligature glyph by GDEF); lookup 1 would replace fi with
    // a wide glyph but ignores ligatures.
    const gdef = gdefWithMarks();
    (gdef.classDef as { ranges: unknown[] }).ranges.push({ start: FI, end: FI, classId: 2 });
    const single = lookup(1, [{ substFormat: 2, coverage: coverage(FI), substitute: [WIDE] }], 0x4);
    expect(shape(ligaFont([ligatureLookup([['fi', FI]]), single], gdef), 'fi')).toEqual([[FI], []]);
    const noFlag = lookup(1, [{ substFormat: 2, coverage: coverage(FI), substitute: [WIDE] }]);
    expect(shape(ligaFont([ligatureLookup([['fi', FI]]), noFlag], gdef), 'fi')).toEqual([[WIDE], []]);
  });

  it('a zero width joiner between two letters does not stop their ligature', () => {
    const font = ligaFont([ligatureLookup([['fi', FI]])]);
    expect(shape(font, `f${ZERO_WIDTH_JOINER}i`)).toEqual([[FI, 0], [], []]);
  });

  it('a zero width non-joiner between two letters stops their ligature', () => {
    const font = ligaFont([ligatureLookup([['fi', FI]])]);
    expect(shape(font, `f${ZERO_WIDTH_NON_JOINER}i`)).toBeNull();
  });
});

describe('glyph substitution: scripts and language systems', () => {
  const toWide = (text: string) => singleLookup(text, [...text].map(() => WIDE));
  const features = [
    { tag: 'liga', lookups: [0] }, // a
    { tag: 'liga', lookups: [1] }, // b
    { tag: 'liga', lookups: [2] }, // c
    { tag: 'liga', lookups: [3] }, // d
  ];
  const lookups = [toWide(`a1${CYRILLIC_BE}`), toWide(`b2${CYRILLIC_VE}`), toWide('c'), toWide('d')];

  it('uses the latn script for Latin text', () => {
    const font = fontWith(
      gsubTable(lookups, features, [
        { tag: 'DFLT', features: [0] },
        { tag: 'latn', features: [1] },
      ]),
    );
    expect(shape(font, 'ab')).toEqual([[gid('a')], [WIDE]]);
  });

  it('falls back to DFLT when the font has no latn script', () => {
    const font = fontWith(gsubTable(lookups, features, [{ tag: 'DFLT', features: [0] }]));
    expect(shape(font, 'ab')).toEqual([[WIDE], [gid('b')]]);
  });

  it('falls back to latn for another script the font does not list, when it has no DFLT either', () => {
    const font = fontWith(gsubTable(lookups, features, [{ tag: 'latn', features: [1] }]));
    expect(shape(font, CYRILLIC_VE)).toEqual([[WIDE]]);
  });

  it('gives digits and punctuation the script of the letters before them', () => {
    const font = fontWith(
      gsubTable(lookups, features, [
        { tag: 'cyrl', features: [0] },
        { tag: 'latn', features: [1] },
      ]),
    );
    // Latin run: lookup 1 (b, 2). Cyrillic run: lookup 0 (a, 1, be).
    expect(shape(font, 'b12')).toEqual([[WIDE], [gid('1')], [WIDE]]);
    expect(shape(font, `${CYRILLIC_BE}12`)).toEqual([[WIDE], [WIDE], [gid('2')]]);
  });

  it('gives leading digits the script of the first letter, and letterless text the latn script', () => {
    const font = fontWith(
      gsubTable(lookups, features, [
        { tag: 'cyrl', features: [0] },
        { tag: 'latn', features: [1] },
      ]),
    );
    expect(shape(font, `12${CYRILLIC_BE}`)).toEqual([[WIDE], [gid('2')], [WIDE]]);
    expect(shape(font, '12')).toEqual([[gid('1')], [WIDE]]);
  });

  it('shapes a run of each script on its own', () => {
    // A ligature of a Latin and a Cyrillic letter cannot form: they are separate runs.
    const mixed = fontWith(
      gsubTable(
        [lookup(4, [{ substFormat: 1, coverage: coverageOf('a'), ligatureSets: [[{ ligGlyph: WIDE, components: [gid(CYRILLIC_BE)] }]] }])],
        [{ tag: 'liga', lookups: [0] }],
      ),
    );
    expect(shape(mixed, `a${CYRILLIC_BE}`)).toBeNull();
  });

  it('leaves scripts that need more than substitution alone', () => {
    const font = fontWith(
      gsubTable([lookup(1, [{ substFormat: 1, coverage: rangeCoverage(1, 99), deltaGlyphId: 100 }])], [
        { tag: 'liga', lookups: [0] },
      ]),
    );
    expect(shape(font, `${HEBREW_ALEF}${HEBREW_BET}`)).toBeNull();
    // ...but still substitutes the Latin part of the same line.
    expect(shape(font, `${HEBREW_ALEF}a`)).toEqual([[gid(HEBREW_ALEF)], [gid('a') + 100]]);
  });

  it('does not let a rule reach across a character the font has no glyph for', () => {
    // "anything unlisted, then c" would see the glyph-less character as class 0.
    const font = fontWith(
      gsubTable(
        [
          lookup(6, [
            {
              substFormat: 2,
              coverage: coverageOf('c'),
              backtrackClassDef: undefined,
              inputClassDef: undefined,
              lookaheadClassDef: undefined,
              chainClassSet: [[{ backtrack: [0], input: [], lookahead: [], lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 1 }] }]],
            },
          ]),
          toWide('c'),
        ],
        [{ tag: 'calt', lookups: [0] }],
      ),
    );
    expect(shape(font, 'ac')).toEqual([[gid('a')], [WIDE]]);
    // U+2603 has no glyph: the browser draws it from another font, in a run of its own.
    expect(shape(font, `${SNOWMAN}c`)).toBeNull();
  });

  const withLanguages = fontWith(
    gsubTable(lookups, features, [
      {
        tag: 'latn',
        features: [0],
        languages: [
          { tag: 'TRK ', features: [1] },
          { tag: 'NLD ', features: [2] },
          { tag: 'ROM ', features: [3] },
        ],
      },
    ]),
  );

  it('uses the default language system when no language is given', () => {
    expect(shape(withLanguages, 'abcd')).toEqual([[WIDE], [gid('b')], [gid('c')], [gid('d')]]);
  });

  it('uses the language system of the language it is given', () => {
    expect(shape(withLanguages, 'abcd', 'tr')).toEqual([[gid('a')], [WIDE], [gid('c')], [gid('d')]]);
    expect(shape(withLanguages, 'abcd', 'nl-NL')).toEqual([[gid('a')], [gid('b')], [WIDE], [gid('d')]]);
    expect(shape(withLanguages, 'abcd', 'RO')).toEqual([[gid('a')], [gid('b')], [gid('c')], [WIDE]]);
  });

  it('uses the default language system for a language the font has none for', () => {
    expect(shape(withLanguages, 'abcd', 'en-US')).toEqual([[WIDE], [gid('b')], [gid('c')], [gid('d')]]);
    expect(shape(withLanguages, 'abcd', 'xx')).toEqual([[WIDE], [gid('b')], [gid('c')], [gid('d')]]);
  });

  it('substitutes nothing when the script has no language system to use', () => {
    const font = fontWith(gsubTable(lookups, features, [{ tag: 'latn', noDefault: true }]));
    expect(shape(font, 'ab')).toBeNull();
  });
});

describe('glyph substitution: fonts that are not well formed', () => {
  it('ignores lookups, features and nested lookups that do not exist', () => {
    const font = fontWith(
      gsubTable(
        [
          lookup(5, [
            { substFormat: 3, coverages: [coverageOf('a')], lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 9 }] },
          ]),
          ligatureLookup([['fi', FI]]),
        ],
        [
          { tag: 'calt', lookups: [0, 7] },
          { tag: 'liga', lookups: [1] },
        ],
        [{ tag: 'DFLT', features: [0, 1, 5] }],
      ),
    );
    expect(shape(font, 'a fi')).toEqual([[gid('a')], [gid(' ')], [FI], []]);
  });

  it('returns null instead of throwing on a table it cannot read', () => {
    const broken = fontWith({ version: 1, scripts: 'nope', features: null, lookups: 42 });
    expect(() => shape(broken, 'fi')).not.toThrow();
    expect(shape(broken, 'fi')).toBeNull();
  });

  it('treats a subtable with a missing part as one that does not match', () => {
    const font = ligaFont([
      lookup(4, [{ substFormat: 1, coverage: coverageOf('f'), ligatureSets: [undefined] }]),
      lookup(6, [{ substFormat: 2, coverage: coverageOf('f'), chainClassSet: undefined }]),
      lookup(1, [{ substFormat: 2, coverage: coverageOf('f') }]),
      ligatureLookup([['fi', FI]]),
    ]);
    expect(shape(font, 'fi')).toEqual([[FI], []]);
  });
});

describe('text substitutions for the exporter', () => {
  /** The hand-made font with what the exporter also needs: advances (500 + glyph id, 1000 to the em). */
  const exportable = (gsub: Table, gpos?: Table) => ({
    ...fontWith(gsub),
    tables: { gsub, gpos },
    unitsPerEm: 1000,
    glyphs: { get: (index: number) => ({ advanceWidth: 500 + index }) },
  });
  const liga = (lookups: Table[]) => gsubTable(lookups, [{ tag: 'liga', lookups: lookups.map((_, index) => index) }]);
  const english = () => 'en-US';

  it('gives the substituted glyphs with their advance in em, and null for untouched characters', () => {
    const substitutions = createTextSubstitutions(exportable(liga([ligatureLookup(F_LIGATURES)])), english);
    expect(substitutions('afib')).toEqual([null, [{ glyph: FI, advance: (500 + FI) / 1000 }], [], null]);
  });

  it('gives every glyph of a character that becomes several', () => {
    const split = lookup(2, [{ substFormat: 1, coverage: coverageOf('a'), sequences: [[gid('b'), gid('c')]] }]);
    const substitutions = createTextSubstitutions(exportable(liga([split])), english);
    expect(substitutions('xa')).toEqual([
      null,
      [
        { glyph: gid('b'), advance: (500 + gid('b')) / 1000 },
        { glyph: gid('c'), advance: (500 + gid('c')) / 1000 },
      ],
    ]);
  });

  it('returns null when nothing is substituted', () => {
    const substitutions = createTextSubstitutions(exportable(liga([ligatureLookup(F_LIGATURES)])), english);
    expect(substitutions('hamburg')).toBeNull();
  });

  it('asks for the language each time, and uses the rules the font has for it', () => {
    const gsub = gsubTable(
      [singleLookup('a', [WIDE]), singleLookup('a', [WIDE + 1])],
      [
        { tag: 'liga', lookups: [0] },
        { tag: 'liga', lookups: [1] },
      ],
      [{ tag: 'latn', features: [0], languages: [{ tag: 'TRK ', features: [1] }] }],
    );
    let language = 'en';
    const substitutions = createTextSubstitutions(exportable(gsub), () => language);
    expect(substitutions('a')![0]![0].glyph).toBe(WIDE);
    language = 'tr-TR';
    expect(substitutions('a')![0]![0].glyph).toBe(WIDE + 1);
  });

  // The bundled Linefont draws a line chart: its substituted glyphs are the
  // segments, and GPOS cursive attachment moves each one up or down to where the
  // one before it ends. The exporter cannot move glyphs like that, so the segments
  // would all sit on the baseline; the characters' own glyphs are closer to the canvas.
  it('substitutes nothing in a font that chains its glyphs with cursive attachment', () => {
    const cursive = { lookups: [{ lookupType: 2 }, { lookupType: 3 }] };
    const substitutions = createTextSubstitutions(exportable(liga([ligatureLookup(F_LIGATURES)]), cursive), english);
    expect(substitutions('fi')).toBeNull();
  });

  it('still substitutes in a font that only kerns and places accents', () => {
    const usual = { lookups: [{ lookupType: 2 }, { lookupType: 4 }, { lookupType: 6 }] };
    const substitutions = createTextSubstitutions(exportable(liga([ligatureLookup(F_LIGATURES)]), usual), english);
    expect(substitutions('fi')).not.toBeNull();
  });

  it('Linefont: the chart segments are withheld', () => {
    const font = loadFont('Linefont-VariableFont_wdth,wght.ttf');
    expect(createTextSubstitutions(font, english)('0369')).toBeNull();
  });

  it('Albertus: the ligature of "fi" is one glyph, wider than either letter', () => {
    const font = loadFont('Albertus MT Std Regular.otf');
    const shaped = createTextSubstitutions(font, english)('fi');
    expect(shaped).toHaveLength(2);
    expect(shaped![0]).toHaveLength(1);
    expect(shaped![1]).toEqual([]);
    const letterAdvance = (ch: string) => font.charToGlyph(ch).advanceWidth! / font.unitsPerEm;
    expect(shaped![0]![0].advance).toBeGreaterThan(letterAdvance('f'));
    expect(shaped![0]![0].advance).toBeGreaterThan(letterAdvance('i'));
  });
});

// ---------------------------------------------------------------------------
// The bundled fonts: what the canvas was measured to draw for ordinary text.
// ---------------------------------------------------------------------------

function loadFont(file: string): opentype.Font {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** Glyph names at each character, `-` for a character an earlier glyph covers; null when nothing is substituted. */
function shapeNames(file: string, text: string, language?: string): string[] | null {
  const font = loadFont(file);
  const shaped = createGlyphSubstituter(font)(text, language);
  if (!shaped) return null;
  return shaped.map((glyphs) =>
    glyphs.length === 0 ? '-' : glyphs.map((index) => font.glyphs.get(index).name ?? `#${index}`).join('+'),
  );
}

describe('glyph substitution: bundled fonts', () => {
  it('Albertus: the fi and fl of "office fluff"', () => {
    expect(shapeNames('Albertus MT Std Regular.otf', 'office fluff')).toEqual([
      'o', 'f', 'f_i', '-', 'c', 'e', 'space', 'f_l', '-', 'u', 'f', 'f',
    ]);
  });

  it('a font without substitution rules is left alone', () => {
    expect(shapeNames('AROW.otf', 'office fluff')).toBeNull();
    expect(shapeNames('Azonix.otf', 'office fluff')).toBeNull();
  });

  it('Barlow: three-letter ligatures, and one made of punctuation', () => {
    expect(shapeNames('Barlow-Regular.ttf', 'office')).toEqual(['o', 'f_f_i.liga', '-', '-', 'c', 'e']);
    expect(shapeNames('Barlow-Regular.ttf', 'a--b')).toEqual(['a', 'hyphen_hyphen.liga', '-', 'b']);
  });

  it('Barlow: the Turkish language system keeps f and i apart', () => {
    // Its `locl` gives Turkish an i of its own, which the fi ligature does not take.
    expect(shapeNames('Barlow-Regular.ttf', 'fi', 'tr')).toEqual(['f', 'i.loclTRK']);
    expect(shapeNames('Barlow-Regular.ttf', 'fi', 'en-US')).toEqual(['fi', '-']);
  });

  it('Playfair Display SC: arrows spelled with a hyphen, from calt', () => {
    expect(shapeNames('PlayfairDisplaySC-Regular.ttf', 'a -> b <- c')).toEqual([
      'a', 'space', 'arrowright', '-', 'space', 'b', 'space', 'arrowleft', '-', 'space', 'c',
    ]);
  });

  it('Sedgwick Ave Display and Bitcount: ligatures spelled with digits and punctuation', () => {
    expect(shapeNames('SedgwickAveDisplay-Regular.ttf', 'star1')).toEqual(['s_t_a_r_one.liga', '-', '-', '-', '-']);
    expect(shapeNames('BitcountGridSingle-Regular.ttf', '/heart x')).toEqual([
      'heart', '-', '-', '-', '-', '-', 'space', 'x',
    ]);
  });

  it('Libre Barcode: a rule for a single character, the space', () => {
    expect(shapeNames('LibreBarcode-128-Text-Regular.ttf', ' ')).toEqual(['uni00C2.code.space']);
  });

  it('Cal Sans: a ligature the font takes apart again is drawn as its letters', () => {
    // liga joins f + i, a later ccmp lookup splits the ligature back into f and i.
    expect(shapeNames('CalSans-Regular.ttf', 'fi fl')).toBeNull();
  });

  it('LLDEtechnoTwist: a colon between digits', () => {
    expect(shapeNames('LLDEtechnoTwistGX.ttf', '12:30')).toEqual(['one', 'two', 'colon.alt', 'three', 'zero']);
    expect(shapeNames('LLDEtechnoTwistGX.ttf', 'ab:cd')).toBeNull();
  });

  it('Boldonse: an accent after a capital takes its capital form', () => {
    expect(shapeNames('Boldonse-Regular.ttf', 'A`')).toEqual(['A', 'grave.case']);
    expect(shapeNames('Boldonse-Regular.ttf', 'a`')).toBeNull();
  });

  it('Linefont: every glyph is drawn from the one before it (reverse chaining)', () => {
    // The digits stand for the levels 1, 30, 60 and 90; each glyph but the first is
    // the step up from the level before it, followed by a joint.
    expect(shapeNames('Linefont-VariableFont_wdth,wght.ttf', '0369')).toEqual([
      '_1', 'pos.29+join', 'pos.30+join', 'pos.30+join',
    ]);
    // a, b, c are the levels 1, 2 and 4: up one, up two, down three.
    expect(shapeNames('Linefont-VariableFont_wdth,wght.ttf', 'abca')).toEqual([
      '_1', 'pos.1+join', 'pos.2+join', 'neg.3+join',
    ]);
    expect(shapeNames('Linefont-VariableFont_wdth,wght.ttf', 'a')).toBeNull();
  });
});
