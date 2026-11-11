import type { SubstituteGlyph, TextSubstitutions } from './svgExportTypes';

/**
 * Glyph substitution: which glyphs a browser draws for a piece of text, when they
 * are not simply each character's own glyph.
 *
 * A font can replace glyphs depending on their neighbours: f + i becomes one fi
 * glyph, "->" an arrow, a colon between digits a raised colon. The rules are in
 * the font's GSUB table, grouped into features. The canvas applies some features
 * to all text; the SVG exporter draws outlines itself, so it has to apply the same
 * ones or the exported shapes differ from what is on screen.
 *
 * This is a port of the part of HarfBuzz (the shaping engine of Chromium and
 * Firefox) that does this, reading the tables as opentype.js parses them:
 *
 * - Features: the ones Chromium was measured to apply to canvas text with nothing
 *   asking for more (probe font with one feature per character, Chromium 145):
 *   rvrn first, then ccmp, locl, rlig, calt, clig, liga, rclt, ltra and ltrm
 *   together, and frac / numr / dnom for digits around a fraction slash (U+2044).
 *   Not `rand` (random alternates), and not feature variations of variable fonts.
 * - Lookups: all GSUB lookup types (1 to 8), their lookup flags and the GDEF
 *   glyph classes the flags refer to. Lookups run in the order of the lookup list,
 *   each over the whole run before the next.
 * - Runs: a line is shaped in pieces that never see each other, as in the
 *   browser: it is cut where the script changes (digits, spaces and punctuation
 *   go with the letters before them) and at characters the font has no glyph for,
 *   which the browser draws from another font.
 * - Scripts: Latin, Cyrillic, Greek, Armenian and Georgian, the scripts that need
 *   nothing but substitution. Text in any other script keeps its own glyphs.
 * - Language: fonts can hold different rules per language (Turkish keeps f and i
 *   apart, for example). The canvas was measured to use the browser's own
 *   interface language for this, not the page's `lang`; `navigator.language` is
 *   the closest value a page can read.
 *
 * Positions are not decided here: the caller places each glyph where the canvas
 * measures its first character.
 */

// --- The tables, in the shape opentype.js 2.x parses them into -------------------

interface Coverage {
  format?: number;
  glyphs?: number[];
  ranges?: { start: number; end: number; index: number }[];
}

interface ClassDef {
  format?: number;
  startGlyph?: number;
  classes?: number[];
  ranges?: { start: number; end: number; classId: number }[];
}

interface LookupRecord {
  sequenceIndex: number;
  lookupListIndex: number;
}

/** A contextual rule: glyph ids (format 1) or class numbers (format 2) per position. */
interface Rule {
  backtrack?: number[];
  input?: number[];
  classes?: number[];
  lookahead?: number[];
  lookupRecords?: LookupRecord[];
}

interface Ligature {
  ligGlyph: number;
  components?: number[];
}

/** Every field a GSUB subtable of any type and format can carry. */
interface Subtable {
  substFormat?: number;
  coverage?: Coverage;
  // type 1
  deltaGlyphId?: number;
  substitute?: number[];
  // type 2
  sequences?: (number[] | undefined)[];
  // type 3
  alternateSets?: (number[] | undefined)[];
  // type 4
  ligatureSets?: (Ligature[] | undefined)[];
  // type 5
  ruleSets?: (Rule[] | undefined)[];
  classDef?: ClassDef;
  classSets?: (Rule[] | undefined)[];
  coverages?: Coverage[];
  lookupRecords?: LookupRecord[];
  // type 6
  chainRuleSets?: (Rule[] | undefined)[];
  backtrackClassDef?: ClassDef;
  inputClassDef?: ClassDef;
  lookaheadClassDef?: ClassDef;
  chainClassSet?: (Rule[] | undefined)[];
  backtrackCoverage?: Coverage[];
  inputCoverage?: Coverage[];
  lookaheadCoverage?: Coverage[];
  // type 7
  lookupType?: number;
  extension?: Subtable;
  // type 8
  substitutes?: number[];
}

interface Lookup {
  lookupType?: number;
  lookupFlag?: number;
  subtables?: Subtable[];
  markFilteringSet?: number;
}

interface LangSys {
  reqFeatureIndex?: number;
  featureIndexes?: number[];
}

interface ScriptRecord {
  tag?: string;
  script?: {
    defaultLangSys?: LangSys;
    langSysRecords?: { tag?: string; langSys?: LangSys }[];
  };
}

interface GsubTable {
  scripts?: ScriptRecord[];
  features?: { tag?: string; feature?: { lookupListIndexes?: number[] } }[];
  lookups?: Lookup[];
}

interface GdefTable {
  classDef?: ClassDef;
  markAttachClassDef?: ClassDef;
  markGlyphSets?: Coverage[];
}

/** What substitution needs from a parsed font; an opentype.js `Font` has it. */
export interface SubstitutionFont {
  charToGlyphIndex(ch: string): number;
  readonly tables: { readonly gsub?: unknown; readonly gdef?: unknown };
}

/**
 * The glyphs drawn at each character (code point) of a text, by their index in the
 * font: the character's own glyph, the glyphs put in its place, or none for a
 * character that an earlier glyph (a ligature) already covers.
 */
export type GlyphsPerCharacter = number[][];

// --- Features --------------------------------------------------------------------

/** Applied to every glyph, in one pass over the lookup list. */
const GLOBAL_FEATURES = ['ltra', 'ltrm', 'ccmp', 'locl', 'rlig', 'calt', 'clig', 'liga', 'rclt'];

// Which glyphs a lookup may touch. Every glyph has GLOBAL; the fraction bits are
// set only on the digits and the slash of a fraction.
const GLOBAL = 1;
const FRAC = 2;
const NUMR = 4;
const DNOM = 8;

interface PlannedLookup {
  index: number;
  mask: number;
}

interface Plan {
  /** Lookups by stage (rvrn, then everything else), each stage in lookup-list order. */
  stages: PlannedLookup[][];
  fractions: boolean;
}

// --- Glyph properties and lookup flags ---------------------------------------------

// Glyph classes as GDEF numbers them, at the bit positions of the lookup flags
// that ignore them.
const BASE = 0x02;
const LIGATURE = 0x04;
const MARK = 0x08;
const IGNORE_FLAGS = 0x0e;
const USE_MARK_FILTERING_SET = 0x10;
const MARK_ATTACHMENT_TYPE = 0xff00;

// Characters a renderer shows nothing for. A rule looks past them, except that a
// zero width non-joiner between two glyphs keeps a ligature from joining them.
const IGNORABLE = 1;
const ZWNJ = 2;
const DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const ZERO_WIDTH_NON_JOINER = 0x200c;
const FRACTION_SLASH = 0x2044;
const NONSPACING_MARK = /\p{Mn}/u;
const DECIMAL_DIGIT = /\p{Nd}/u;

/**
 * Default ignorables HarfBuzz does not look past: the combining grapheme joiner,
 * the Mongolian variation selectors and the tag characters.
 */
function isNeverSkipped(code: number): boolean {
  return (
    code === 0x034f || (code >= 0x180b && code <= 0x180d) || code === 0x180f || (code >= 0xe0020 && code <= 0xe007f)
  );
}

// Limits HarfBuzz sets against fonts that never stop substituting.
const MAX_CONTEXT_LENGTH = 64;
const MAX_NESTING_LEVEL = 64;
const MAX_LENGTH_FACTOR = 64;
const MAX_OPS_FACTOR = 1024;
const MIN_BUFFER_LIMIT = 16384;

const SKIP_NO = 0;
const SKIP_YES = 1;
const SKIP_MAYBE = 2;

interface Item {
  glyph: number;
  /** The first and the last character (index in the text) this glyph stands for. */
  first: number;
  last: number;
  /** Glyph class bit, plus the mark attachment class in the second byte. */
  props: number;
  mask: number;
  ignorable: number;
}

type Matcher = (index: number, glyph: number) => boolean;

// --- Scripts -----------------------------------------------------------------------

const SCRIPTS: [RegExp, string][] = [
  [/\p{Script=Latin}/u, 'latn'],
  [/\p{Script=Cyrillic}/u, 'cyrl'],
  [/\p{Script=Greek}/u, 'grek'],
  [/\p{Script=Armenian}/u, 'armn'],
  [/\p{Script=Georgian}/u, 'geor'],
];
const NEUTRAL = /[\p{Script=Common}\p{Script=Inherited}]/u;
/** Text with no letters at all (digits, punctuation) is shaped as Latin: measured. */
const LETTERLESS_SCRIPT = 'latn';

/**
 * The OpenType script each character is shaped with: its own for a letter of a
 * script handled here, null for any other script, and for digits, spaces,
 * punctuation and combining marks the script of the letter before them (of the
 * first letter, for those leading the text).
 */
function resolveScripts(chars: string[]): (string | null)[] {
  const scripts: (string | null | undefined)[] = chars.map((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return 'latn';
    if (code < 0x80) return undefined;
    for (const [pattern, tag] of SCRIPTS) if (pattern.test(ch)) return tag;
    return NEUTRAL.test(ch) ? undefined : null;
  });
  const firstLetter = scripts.find((script) => script !== undefined);
  let current: string | null = firstLetter === undefined ? LETTERLESS_SCRIPT : firstLetter;
  return scripts.map((script) => {
    if (script !== undefined) current = script;
    return current;
  });
}

// --- Languages -----------------------------------------------------------------------

// OpenType language system tags by language code, for the languages fonts of
// these scripts commonly have rules for (as in HarfBuzz's table).
const LANGUAGE_SYSTEMS: Record<string, string> = Object.fromEntries(
  (
    'az:AZE ba:BSH be:BEL bg:BGR bs:BOS ca:CAT crh:CRT cs:CSY cv:CHU cy:WEL da:DAN de:DEU el:ELL ' +
    'en:ENG eo:NTO es:ESP et:ETI eu:EUQ fi:FIN fo:FOS fr:FRA ga:IRI gd:GAE gl:GAL hr:HRV hu:HUN ' +
    'hy:HYE is:ISL it:ITA ka:KAT kk:KAZ lt:LTH lv:LVI mh:MAH mk:MKD mt:MTS nb:NOR nl:NLD no:NOR ' +
    'pl:PLK pt:PTG ro:ROM ru:RUS sk:SKY sl:SLV sq:SQI sr:SRB sv:SVE tr:TRK tt:TAT uk:UKR vi:VIT'
  )
    .split(' ')
    .map((entry) => entry.split(':')),
);

/** Language system tags to look for, best first, for a language such as "tr" or "nl-NL". */
function languageSystemTags(language: string | undefined): string[] {
  if (!language) return [];
  const [primary, ...rest] = language.toLowerCase().split(/[-_]/);
  // Moldavian has its own tag and falls back to Romanian; Nynorsk to Norwegian.
  if (primary === 'mo' || (primary === 'ro' && rest.includes('md'))) return ['MOL ', 'ROM '];
  if (primary === 'nn') return ['NYN ', 'NOR '];
  const tag = LANGUAGE_SYSTEMS[primary] ?? (primary.length === 3 ? primary.toUpperCase() : undefined);
  return tag ? [tag.padEnd(4, ' ')] : [];
}

// --- Table access ----------------------------------------------------------------------

function list<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/** Index of `glyph` in a coverage table, or -1. */
function coverageIndex(coverage: Coverage | undefined, glyph: number): number {
  if (!coverage) return -1;
  if (coverage.format === 1) {
    const glyphs = list(coverage.glyphs);
    let low = 0;
    let high = glyphs.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const value = glyphs[middle];
      if (value === glyph) return middle;
      if (value < glyph) low = middle + 1;
      else high = middle - 1;
    }
    return -1;
  }
  for (const range of list(coverage.ranges)) {
    if (glyph >= range.start && glyph <= range.end) return range.index + glyph - range.start;
  }
  return -1;
}

/** Class of `glyph` in a class table; 0 for a glyph it does not list, and for no table. */
function classOf(classDef: ClassDef | undefined, glyph: number): number {
  if (!classDef) return 0;
  if (classDef.format === 1) {
    return list(classDef.classes)[glyph - (classDef.startGlyph ?? 0)] ?? 0;
  }
  for (const range of list(classDef.ranges)) {
    if (glyph >= range.start && glyph <= range.end) return range.classId;
  }
  return 0;
}

/** A lookup's flags, with the number of its mark filtering set above them. */
function lookupProps(lookup: Lookup): number {
  const flag = lookup.lookupFlag ?? 0;
  return flag & USE_MARK_FILTERING_SET ? flag + (lookup.markFilteringSet ?? 0) * 0x10000 : flag;
}

function subtablesOf(lookup: Lookup): { type: number; subtable: Subtable }[] {
  const out: { type: number; subtable: Subtable }[] = [];
  for (const raw of list(lookup.subtables)) {
    if (!raw) continue;
    if (lookup.lookupType === 7) {
      if (raw.extension && typeof raw.lookupType === 'number') out.push({ type: raw.lookupType, subtable: raw.extension });
    } else {
      out.push({ type: lookup.lookupType ?? 0, subtable: raw });
    }
  }
  return out;
}

// --- One run of text, shaped in place --------------------------------------------------

class Run {
  private idx = 0;
  private props = 0;
  private mask = 0;
  private nesting = 0;
  private ops: number;
  private readonly maxLength: number;

  constructor(
    private readonly buffer: Item[],
    private readonly lookups: Lookup[],
    private readonly gdef: GdefTable | undefined,
    private readonly hasGlyphClasses: boolean,
  ) {
    this.ops = Math.max(buffer.length * MAX_OPS_FACTOR, MIN_BUFFER_LIMIT);
    this.maxLength = Math.max(buffer.length * MAX_LENGTH_FACTOR, MIN_BUFFER_LIMIT);
  }

  /** Run one lookup over the whole buffer: front to back, or back to front for a reverse lookup. */
  applyLookup(index: number, mask: number): void {
    const lookup = this.lookups[index];
    if (!lookup) return;
    const subtables = subtablesOf(lookup);
    if (subtables.length === 0) return;
    this.props = lookupProps(lookup);
    this.mask = mask;

    if (subtables[0].type === 8) {
      for (this.idx = this.buffer.length - 1; this.idx >= 0; this.idx -= 1) {
        const item = this.buffer[this.idx];
        if (item.mask & mask && this.accepts(item, this.props)) this.applySubtables(subtables);
      }
      return;
    }

    this.idx = 0;
    while (this.idx < this.buffer.length) {
      const item = this.buffer[this.idx];
      const at = this.idx;
      const length = this.buffer.length;
      const applied = (item.mask & mask) !== 0 && this.accepts(item, this.props) && this.applySubtables(subtables);
      // A substitution moves on past what it replaced. Step on here when nothing
      // applied, and when something claims to have without moving or removing a glyph.
      if (!applied || (this.idx <= at && this.buffer.length >= length)) this.idx = at + 1;
    }
  }

  /** The first subtable that applies at the current glyph wins. */
  private applySubtables(subtables: { type: number; subtable: Subtable }[]): boolean {
    for (const { type, subtable } of subtables) {
      if (this.applySubtable(type, subtable)) return true;
    }
    return false;
  }

  private applySubtable(type: number, subtable: Subtable): boolean {
    const glyph = this.buffer[this.idx].glyph;
    switch (type) {
      case 1: {
        const index = coverageIndex(subtable.coverage, glyph);
        if (index < 0) return false;
        const by =
          subtable.substFormat === 1
            ? (glyph + (subtable.deltaGlyphId ?? 0)) & 0xffff
            : list(subtable.substitute)[index];
        if (typeof by !== 'number') return false;
        this.replaceGlyph(by);
        return true;
      }
      case 2: {
        const sequence = list(subtable.sequences)[coverageIndex(subtable.coverage, glyph)];
        if (!Array.isArray(sequence)) return false;
        this.replaceWithSequence(sequence);
        return true;
      }
      case 3: {
        const alternates = list(subtable.alternateSets)[coverageIndex(subtable.coverage, glyph)];
        if (!Array.isArray(alternates) || alternates.length === 0) return false;
        this.replaceGlyph(alternates[0]);
        return true;
      }
      case 4: {
        const ligatures = list(subtable.ligatureSets)[coverageIndex(subtable.coverage, glyph)];
        for (const ligature of list(ligatures)) {
          const components = list(ligature?.components);
          if (components.length === 0) {
            this.replaceGlyph(ligature.ligGlyph);
            return true;
          }
          const positions = this.matchInput(components.length + 1, (i, g) => g === components[i - 1]);
          if (!positions) continue;
          this.ligate(positions, ligature.ligGlyph);
          return true;
        }
        return false;
      }
      case 5:
      case 6:
        return this.applyContextual(subtable, glyph);
      case 8: {
        // Never through a contextual rule, and only in place.
        if (this.nesting !== 0) return false;
        const by = list(subtable.substitutes)[coverageIndex(subtable.coverage, glyph)];
        if (typeof by !== 'number') return false;
        const before = list(subtable.backtrackCoverage);
        const after = list(subtable.lookaheadCoverage);
        if (!this.matchBacktrack(before.length, (i, g) => coverageIndex(before[i], g) >= 0)) return false;
        if (!this.matchLookahead(after.length, (i, g) => coverageIndex(after[i], g) >= 0, this.idx + 1)) return false;
        const item = this.buffer[this.idx];
        item.glyph = by;
        item.ignorable = 0;
        this.setGlyphClass(item, 0);
        return true;
      }
      default:
        return false;
    }
  }

  /** Lookup types 5 (context) and 6 (chaining context), in their three formats. */
  private applyContextual(subtable: Subtable, glyph: number): boolean {
    const sameGlyph = (value: number, g: number) => value === g;

    if (subtable.substFormat === 3) {
      const input = list(subtable.inputCoverage ?? subtable.coverages);
      if (input.length === 0 || coverageIndex(input[0], glyph) < 0) return false;
      const covered = (value: Coverage, g: number) => coverageIndex(value, g) >= 0;
      return this.applyRule(
        list(subtable.backtrackCoverage),
        input.slice(1),
        list(subtable.lookaheadCoverage),
        subtable.lookupRecords,
        covered,
        covered,
        covered,
      );
    }

    const index = coverageIndex(subtable.coverage, glyph);
    if (index < 0) return false;

    if (subtable.substFormat === 1) {
      for (const rule of list(list(subtable.chainRuleSets ?? subtable.ruleSets)[index])) {
        if (!rule) continue;
        const applied = this.applyRule(
          list(rule.backtrack),
          list(rule.input),
          list(rule.lookahead),
          rule.lookupRecords,
          sameGlyph,
          sameGlyph,
          sameGlyph,
        );
        if (applied) return true;
      }
      return false;
    }

    if (subtable.substFormat === 2) {
      const inputClasses = subtable.inputClassDef ?? subtable.classDef;
      const rules = list(subtable.chainClassSet ?? subtable.classSets)[classOf(inputClasses, glyph)];
      for (const rule of list(rules)) {
        if (!rule) continue;
        const applied = this.applyRule(
          list(rule.backtrack),
          list(rule.input ?? rule.classes),
          list(rule.lookahead),
          rule.lookupRecords,
          (value, g) => classOf(subtable.backtrackClassDef, g) === value,
          (value, g) => classOf(inputClasses, g) === value,
          (value, g) => classOf(subtable.lookaheadClassDef, g) === value,
        );
        if (applied) return true;
      }
    }
    return false;
  }

  /**
   * One contextual rule at the current glyph: `input` describes the glyphs after it,
   * `backtrack` those before (nearest first), `lookahead` those after the input. When
   * all match, the rule's nested lookups are applied to the matched glyphs.
   */
  private applyRule<T>(
    backtrack: T[],
    input: T[],
    lookahead: T[],
    records: LookupRecord[] | undefined,
    matchesBefore: (value: T, glyph: number) => boolean,
    matchesInput: (value: T, glyph: number) => boolean,
    matchesAfter: (value: T, glyph: number) => boolean,
  ): boolean {
    const positions = this.matchInput(input.length + 1, (i, g) => matchesInput(input[i - 1], g));
    if (!positions) return false;
    const matchEnd = positions[positions.length - 1] + 1;
    if (!this.matchLookahead(lookahead.length, (i, g) => matchesAfter(lookahead[i], g), matchEnd)) return false;
    if (!this.matchBacktrack(backtrack.length, (i, g) => matchesBefore(backtrack[i], g))) return false;
    this.applyRecords(positions, list(records), matchEnd);
    return true;
  }

  /**
   * Apply a rule's nested lookups, each at the matched glyph its record names, then
   * move on past the match. A nested lookup can add or remove glyphs; the positions
   * of the glyphs after it are shifted the way HarfBuzz shifts them (`apply_lookup`).
   */
  private applyRecords(positions: number[], records: LookupRecord[], matchEnd: number): void {
    let count = positions.length;
    let end = matchEnd;

    for (const record of records) {
      const at = record.sequenceIndex;
      if (at >= count) continue;
      const lengthBefore = this.buffer.length;
      if (positions[at] >= lengthBefore) continue;
      this.idx = positions[at];
      if (this.ops <= 0) break;
      if (!this.recurse(record.lookupListIndex)) continue;

      let delta = this.buffer.length - lengthBefore;
      if (delta === 0) continue;

      end += delta;
      if (end < positions[at]) {
        // The nested lookup removed more than the match held: never rewind past it.
        delta += positions[at] - end;
        end = positions[at];
      }

      let next = at + 1;
      if (delta > 0) {
        if (delta + count > MAX_CONTEXT_LENGTH) break;
      } else {
        delta = Math.max(delta, next - count);
        next -= delta;
      }
      // Glyphs were added after this position, or the positions after it were removed.
      const rest = positions.slice(next, count);
      next += delta;
      count += delta;
      positions.length = count;
      for (let j = at + 1; j < next; j += 1) positions[j] = positions[j - 1] + 1;
      for (let j = 0; j < rest.length; j += 1) positions[next + j] = rest[j] + delta;
    }

    this.idx = end;
  }

  /** Apply another lookup at the current glyph only, for a contextual rule. */
  private recurse(lookupIndex: number): boolean {
    if (this.nesting >= MAX_NESTING_LEVEL || this.ops <= 0) return false;
    this.ops -= 1;
    const lookup = this.lookups[lookupIndex];
    if (!lookup || this.idx >= this.buffer.length) return false;
    const saved = this.props;
    this.props = lookupProps(lookup);
    this.nesting += 1;
    const applied = this.applySubtables(subtablesOf(lookup));
    this.nesting -= 1;
    this.props = saved;
    return applied;
  }

  // --- Matching ---

  /**
   * Positions of `count` glyphs starting at the current one, where glyph i (from 1)
   * satisfies `matches`; glyphs the lookup ignores are stepped over. Null when the
   * sequence is not there.
   */
  private matchInput(count: number, matches: Matcher): number[] | null {
    if (count > MAX_CONTEXT_LENGTH) return null;
    const positions = [this.idx];
    let position = this.idx;
    for (let i = 1; i < count; i += 1) {
      for (;;) {
        position += 1;
        if (position >= this.buffer.length) return null;
        const item = this.buffer[position];
        const skip = this.maySkip(item, false);
        if (skip === SKIP_YES) continue;
        if ((item.mask & this.mask) !== 0 && matches(i, item.glyph)) break;
        if (skip === SKIP_NO) return null;
      }
      positions.push(position);
    }
    return positions;
  }

  /** Whether the `count` glyphs before the current one match, nearest first. */
  private matchBacktrack(count: number, matches: Matcher): boolean {
    let position = this.idx;
    for (let i = 0; i < count; i += 1) {
      for (;;) {
        position -= 1;
        if (position < 0) return false;
        const item = this.buffer[position];
        const skip = this.maySkip(item, true);
        if (skip === SKIP_YES) continue;
        if (matches(i, item.glyph)) break;
        if (skip === SKIP_NO) return false;
      }
    }
    return true;
  }

  /** Whether the `count` glyphs from `start` on match. */
  private matchLookahead(count: number, matches: Matcher, start: number): boolean {
    let position = start - 1;
    for (let i = 0; i < count; i += 1) {
      for (;;) {
        position += 1;
        if (position >= this.buffer.length) return false;
        const item = this.buffer[position];
        const skip = this.maySkip(item, true);
        if (skip === SKIP_YES) continue;
        if (matches(i, item.glyph)) break;
        if (skip === SKIP_NO) return false;
      }
    }
    return true;
  }

  /**
   * Whether a rule steps over a glyph: always when the lookup's flags ignore it;
   * when it does not match, for a character that shows nothing. A zero width
   * non-joiner is never stepped over between the glyphs a rule would replace.
   */
  private maySkip(item: Item, context: boolean): number {
    if (!this.accepts(item, this.props)) return SKIP_YES;
    if (item.ignorable !== 0 && (context || item.ignorable !== ZWNJ)) return SKIP_MAYBE;
    return SKIP_NO;
  }

  /** Whether a lookup with these flags looks at this glyph at all. */
  private accepts(item: Item, props: number): boolean {
    if (item.props & props & IGNORE_FLAGS) return false;
    if (item.props & MARK) {
      if (props & USE_MARK_FILTERING_SET) {
        return coverageIndex(list(this.gdef?.markGlyphSets)[Math.floor(props / 0x10000)], item.glyph) >= 0;
      }
      if (props & MARK_ATTACHMENT_TYPE) {
        return (props & MARK_ATTACHMENT_TYPE) === (item.props & MARK_ATTACHMENT_TYPE);
      }
    }
    return true;
  }

  // --- Replacing ---

  private replaceGlyph(glyph: number): void {
    const item = this.buffer[this.idx];
    item.glyph = glyph;
    item.ignorable = 0;
    this.setGlyphClass(item, 0);
    this.idx += 1;
  }

  /** One glyph becomes several, all standing for the same characters; or none. */
  private replaceWithSequence(sequence: number[]): void {
    if (sequence.length === 1) {
      this.replaceGlyph(sequence[0]);
      return;
    }
    const current = this.buffer[this.idx];
    const guess = current.props & LIGATURE ? BASE : 0;
    const items = sequence.map((glyph) => {
      const item: Item = { ...current, glyph, ignorable: 0 };
      this.setGlyphClass(item, guess);
      return item;
    });
    this.buffer.splice(this.idx, 1, ...items);
    if (this.buffer.length > this.maxLength) throw new Error('glyph substitution does not end');
    this.idx += items.length;
  }

  /**
   * The glyphs at `positions` become one. It stands for every character from the
   * first to the last of them; glyphs that were stepped over in between (marks)
   * follow it and are drawn with it.
   */
  private ligate(positions: number[], ligGlyph: number): void {
    const buffer = this.buffer;
    const start = positions[0];
    const end = positions[positions.length - 1];

    // A base glyph joined with marks stays a base glyph, and marks joined with
    // marks stay a mark; anything else is a ligature glyph.
    let isBase = (buffer[start].props & BASE) !== 0;
    let isMark = (buffer[start].props & MARK) !== 0;
    for (let i = 1; i < positions.length; i += 1) {
      if (!(buffer[positions[i]].props & MARK)) {
        isBase = false;
        isMark = false;
        break;
      }
    }

    let first = buffer[start].first;
    let last = buffer[start].last;
    for (let position = start; position <= end; position += 1) {
      first = Math.min(first, buffer[position].first);
      last = Math.max(last, buffer[position].last);
    }

    const joined = new Set(positions);
    const steppedOver: Item[] = [];
    for (let position = start + 1; position < end; position += 1) {
      if (!joined.has(position)) steppedOver.push({ ...buffer[position], first, last });
    }

    const ligature: Item = { ...buffer[start], glyph: ligGlyph, first, last, ignorable: 0 };
    this.setGlyphClass(ligature, !isBase && !isMark ? LIGATURE : 0);
    buffer.splice(start, end - start + 1, ligature, ...steppedOver);
    this.idx = start + 1 + steppedOver.length;
  }

  /** A replaced glyph takes its class from GDEF; without GDEF, `guess` when there is one. */
  private setGlyphClass(item: Item, guess: number): void {
    if (this.hasGlyphClasses) item.props = glyphProps(this.gdef, item.glyph);
    else if (guess) item.props = guess;
  }
}

function glyphProps(gdef: GdefTable | undefined, glyph: number): number {
  switch (classOf(gdef?.classDef, glyph)) {
    case 1:
      return BASE;
    case 2:
      return LIGATURE;
    case 3:
      return MARK | (classOf(gdef?.markAttachClassDef, glyph) << 8);
    default:
      return 0;
  }
}

// --- The substituter -----------------------------------------------------------------

/**
 * Prepare a font for substitution. The returned function gives, for a piece of
 * text that the browser shapes in one go (a line drawn with one `fillText`), the
 * glyphs drawn at each of its characters; null when every character keeps its own
 * glyph, which is the answer for most text and for every font without rules.
 *
 * `language` is the language whose rules to use ("en-US", "tr"), where the font
 * has rules of its own for it.
 */
export function createGlyphSubstituter(
  font: SubstitutionFont,
): (text: string, language?: string) => GlyphsPerCharacter | null {
  const gsub = font.tables.gsub as GsubTable | undefined;
  const lookups = Array.isArray(gsub?.lookups) ? gsub.lookups : [];
  if (!gsub || lookups.length === 0 || !Array.isArray(gsub.scripts)) return () => null;

  const gdef = font.tables.gdef as GdefTable | undefined;
  const hasGlyphClasses = gdef?.classDef?.format === 1 || gdef?.classDef?.format === 2;
  const plans = new Map<string, Plan | null>();

  const planFor = (script: string, languageTags: string[]): Plan | null => {
    const key = `${script}|${languageTags.join('|')}`;
    let plan = plans.get(key);
    if (plan === undefined) {
      plan = buildPlan(gsub, lookups, script, languageTags);
      plans.set(key, plan);
    }
    return plan;
  };

  const substitute = (text: string, language?: string): GlyphsPerCharacter | null => {
    const chars = Array.from(text);
    if (chars.length === 0) return null;
    const glyphs = chars.map((ch) => font.charToGlyphIndex(ch));
    const ignorable = chars.map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code === ZERO_WIDTH_NON_JOINER) return ZWNJ;
      return DEFAULT_IGNORABLE.test(ch) && !isNeverSkipped(code) ? IGNORABLE : 0;
    });
    const scripts = resolveScripts(chars);
    const languageTags = languageSystemTags(language);
    // A character without a glyph is drawn from another font: it ends a run, unless
    // it shows nothing anyway.
    const inFont = (index: number) => glyphs[index] !== 0 || DEFAULT_IGNORABLE.test(chars[index]);

    let result: GlyphsPerCharacter | null = null;
    let start = 0;
    while (start < chars.length) {
      const script = scripts[start];
      let end = start + 1;
      if (script === null || !inFont(start)) {
        start = end;
        continue;
      }
      while (end < chars.length && scripts[end] === script && inFont(end)) end += 1;

      const plan = planFor(script, languageTags);
      if (plan) {
        const buffer: Item[] = [];
        for (let index = start; index < end; index += 1) {
          buffer.push({
            glyph: glyphs[index],
            first: index,
            last: index,
            props: hasGlyphClasses
              ? glyphProps(gdef, glyphs[index])
              : NONSPACING_MARK.test(chars[index]) && !DEFAULT_IGNORABLE.test(chars[index])
                ? MARK
                : BASE,
            mask: GLOBAL,
            ignorable: ignorable[index],
          });
        }
        if (plan.fractions) markFractions(buffer, chars, start);

        const run = new Run(buffer, lookups, gdef, hasGlyphClasses);
        for (const stage of plan.stages) {
          for (const lookup of stage) run.applyLookup(lookup.index, lookup.mask);
        }

        result = recordRun(buffer, glyphs, start, end, result);
      }
      start = end;
    }
    return result;
  };

  return (text, language) => {
    try {
      return substitute(text, language);
    } catch {
      // A table opentype.js could not make sense of, or rules that never end:
      // draw the characters' own glyphs, as for a font without rules.
      return null;
    }
  };
}

/**
 * Enter the glyphs of a shaped run (the characters `start` to `end` of the text)
 * into the per-character result, which is only created once a run differs from
 * the characters' own `glyphs`.
 *
 * Glyphs that stand for the same characters are drawn together, at the first of
 * those characters. Where they are just those characters' own glyphs again (a
 * ligature that a later lookup took apart), nothing was substituted.
 */
function recordRun(
  buffer: Item[],
  glyphs: number[],
  start: number,
  end: number,
  result: GlyphsPerCharacter | null,
): GlyphsPerCharacter | null {
  const changed = () => (result ??= glyphs.map((glyph) => [glyph]));

  for (let from = 0; from < buffer.length; ) {
    const { first } = buffer[from];
    let { last } = buffer[from];
    let to = from + 1;
    for (; to < buffer.length && buffer[to].first === first; to += 1) last = Math.max(last, buffer[to].last);
    const group = buffer.slice(from, to).map((item) => item.glyph);
    const own = glyphs.slice(first, last + 1);
    if (group.length !== own.length || group.some((glyph, offset) => glyph !== own[offset])) {
      const entries = changed();
      for (let index = first; index <= last; index += 1) entries[index] = [];
      entries[first] = group;
    }
    from = to;
  }

  // A character whose glyph a lookup deleted has no glyph left in the buffer.
  if (buffer.length < end - start) {
    const kept = new Set<number>();
    for (const item of buffer) for (let index = item.first; index <= item.last; index += 1) kept.add(index);
    for (let index = start; index < end; index += 1) {
      if (!kept.has(index)) changed()[index] = [];
    }
  }
  return result;
}

/**
 * Digits on both sides of a fraction slash become a fraction: the ones before it
 * may take numerator forms, the ones after it denominator forms, and `frac`
 * applies to all of them and the slash.
 */
function markFractions(buffer: Item[], chars: string[], start: number): void {
  const isDigit = (offset: number) => DECIMAL_DIGIT.test(chars[start + offset]);
  for (let slash = 0; slash < buffer.length; slash += 1) {
    if (chars[start + slash].codePointAt(0) !== FRACTION_SLASH) continue;
    let from = slash;
    let to = slash + 1;
    while (from > 0 && isDigit(from - 1)) from -= 1;
    while (to < buffer.length && isDigit(to)) to += 1;
    if (from === slash || to === slash + 1) continue;
    for (let offset = from; offset < slash; offset += 1) buffer[offset].mask |= NUMR | FRAC;
    buffer[slash].mask |= FRAC;
    for (let offset = slash + 1; offset < to; offset += 1) buffer[offset].mask |= FRAC | DNOM;
    slash = to - 1;
  }
}

/**
 * The lookups to run for text of one script and language, as HarfBuzz picks them:
 * the script (or DFLT, or latn as the last resort), its language system for the
 * language (or its default one), the features of that system by tag, and their
 * lookups in lookup-list order.
 */
function buildPlan(gsub: GsubTable, lookups: Lookup[], script: string, languageTags: string[]): Plan | null {
  const scripts = list(gsub.scripts);
  let record: ScriptRecord | undefined;
  for (const tag of [script, 'DFLT', 'dflt', 'latn']) {
    record = scripts.find((candidate) => candidate?.tag === tag);
    if (record) break;
  }
  if (!record?.script) return null;

  const languages = list(record.script.langSysRecords);
  let langSys: LangSys | undefined;
  for (const tag of [...languageTags, 'dflt']) {
    langSys = languages.find((candidate) => candidate?.tag === tag)?.langSys;
    if (langSys) break;
  }
  langSys ??= record.script.defaultLangSys;
  if (!langSys) return null;

  // Features by tag; where a language system lists a tag twice, the first counts.
  const features = list(gsub.features);
  const byTag = new Map<string, number[]>();
  for (const index of list(langSys.featureIndexes)) {
    const feature = features[index];
    if (feature?.tag && !byTag.has(feature.tag)) byTag.set(feature.tag, list(feature.feature?.lookupListIndexes));
  }

  const stages: Map<number, number>[] = [new Map(), new Map()];
  const add = (stage: number, indexes: number[] | undefined, mask: number) => {
    for (const index of list(indexes)) {
      if (lookups[index]) stages[stage].set(index, (stages[stage].get(index) ?? 0) | mask);
    }
  };

  add(0, byTag.get('rvrn'), GLOBAL);
  for (const tag of GLOBAL_FEATURES) add(1, byTag.get(tag), GLOBAL);
  add(1, byTag.get('frac'), FRAC);
  add(1, byTag.get('numr'), NUMR);
  add(1, byTag.get('dnom'), DNOM);

  // A language system's required feature always applies, with the features of its
  // own tag when that is one of the above, before all of them otherwise.
  const required = langSys.reqFeatureIndex === undefined ? undefined : features[langSys.reqFeatureIndex];
  if (required?.tag) {
    add(GLOBAL_FEATURES.includes(required.tag) ? 1 : 0, required.feature?.lookupListIndexes, GLOBAL);
  }

  const planned = stages.map((stage) =>
    [...stage].map(([index, mask]) => ({ index, mask })).sort((a, b) => a.index - b.index),
  );
  if (planned.every((stage) => stage.length === 0)) return null;
  return {
    stages: planned,
    fractions: byTag.has('frac') || (byTag.has('numr') && byTag.has('dnom')),
  };
}

// --- For the exporter ------------------------------------------------------------------

/** What `createTextSubstitutions` needs from a parsed font; an opentype.js `Font` has it. */
export interface SubstitutableFont extends SubstitutionFont {
  readonly tables: { readonly gsub?: unknown; readonly gdef?: unknown; readonly gpos?: unknown };
  readonly unitsPerEm: number;
  readonly glyphs: { get(index: number): { advanceWidth?: number } | undefined };
}

/** The language the canvas shapes text in: the browser's, as far as a page can tell. */
function browserLanguage(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language;
}

/**
 * Whether a font chains glyphs to each other with cursive attachment (GPOS lookup
 * type 3): each glyph is moved, up and down too, to where the one before it ends.
 * The exporter puts glyphs on the baseline at the x the canvas measures and has no
 * such move, so glyphs that are meant to be chained would come out in the wrong
 * place. The bundled Linefont is one: its substituted glyphs are the segments of a
 * line chart, which the chaining stacks into a line.
 */
function chainsGlyphs(gpos: unknown): boolean {
  const lookups = (gpos as { lookups?: { lookupType?: number }[] } | undefined)?.lookups;
  return Array.isArray(lookups) && lookups.some((lookup) => lookup?.lookupType === 3);
}

/**
 * `OutlineFont.substitutions` for a parsed font: the substituted glyphs of a text
 * with the advance of each, and null at every character that keeps its own glyph.
 *
 * A font that chains its glyphs (see `chainsGlyphs`) gets no substitutions at all:
 * its characters' own glyphs, where they are, are closer to the canvas than
 * substituted ones in the wrong place.
 */
export function createTextSubstitutions(
  font: SubstitutableFont,
  language: () => string | undefined = browserLanguage,
): (text: string) => TextSubstitutions | null {
  if (chainsGlyphs(font.tables.gpos)) return () => null;
  const substitute = createGlyphSubstituter(font);
  return (text) => {
    const shaped = substitute(text, language());
    if (!shaped) return null;
    const chars = Array.from(text);
    return shaped.map((glyphs, index): SubstituteGlyph[] | null => {
      if (glyphs.length === 1 && glyphs[0] === font.charToGlyphIndex(chars[index])) return null;
      return glyphs.map((glyph) => ({
        glyph,
        advance: (font.glyphs.get(glyph)?.advanceWidth ?? 0) / font.unitsPerEm,
      }));
    });
  };
}
