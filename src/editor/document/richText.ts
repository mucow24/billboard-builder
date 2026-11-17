/**
 * Rich text: simple tags inside the text of a text item.
 *
 *   <b>bold</b>  <i>italic</i>
 *   <color=red>...</color>            also #RGB, #RGBA, #RRGGBB, #RRGGBBAA
 *   <gradient start=#f00 end=#fff angle=90>...</gradient>   angle optional, 0 by default
 *   <noparse>shown <b>as typed</b></noparse>
 *
 * Tag names ignore case. Tags nest, and may overlap: a closing tag closes its
 * own tag and nothing else. Of the paints (`color`, `gradient`) the one opened
 * last and still open wins. A tag left open runs to the end of the text. Anything that
 * is not one of these tags, well formed, is ordinary text: "a < b", "<3",
 * "<blink>", "<color=nosuchcolour>", a closing tag with nothing to close.
 */
import { CSS_COLOR_NAMES } from '../color/cssColorNames';

export type RichTextPaint =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; start: string; end: string; angle: number };

export interface RichTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  /** The paint a tag gives the run, or null where it takes the item's. */
  paint: RichTextPaint | null;
}

export interface ParsedRichText {
  /** Neighbouring runs always differ in style, and none is empty. */
  runs: RichTextRun[];
  /** The text without its tags. */
  plain: string;
  /** Whether any tag was recognised. False means `plain` is the text as given. */
  hasMarkup: boolean;
}

/** The gradient angle a `<gradient>` without one gets: the default of a new item. */
export const DEFAULT_RICH_TEXT_GRADIENT_ANGLE = 0;

const expandHexDigits = (digits: string): string =>
  [...digits].map((digit) => digit + digit).join('');

/**
 * A colour as a tag may give it, as `#rrggbb` or `#rrggbbaa` in lower case;
 * null when it is not a colour.
 */
export function parseRichTextColor(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]+$/.test(text)) {
    const digits = text.slice(1);
    if (digits.length === 3 || digits.length === 4) return `#${expandHexDigits(digits)}`;
    if (digits.length === 6 || digits.length === 8) return text;
    return null;
  }
  if (text === 'transparent') return '#00000000';
  return Object.hasOwn(CSS_COLOR_NAMES, text) ? CSS_COLOR_NAMES[text] : null;
}

type OpenTag =
  | { name: 'b' }
  | { name: 'i' }
  | { name: 'color' | 'gradient'; paint: RichTextPaint };

type ParsedTag =
  | { kind: 'open'; tag: OpenTag }
  | { kind: 'close'; name: string }
  | { kind: 'noparse' };

// "<", an optional "/", a name, then whatever is left before the first ">".
const TAG_PATTERN = /<(\/?)([a-zA-Z]+)([^<>]*)>/y;
const NOPARSE_END = /<\/noparse\s*>/gi;
const ATTRIBUTE_PATTERN = /\s*([a-zA-Z]+)\s*=\s*([^\s=]+)/y;

/** `name=value` pairs separated by spaces, or null if `source` is anything else. */
function parseAttributes(source: string): Map<string, string> | null {
  const attributes = new Map<string, string>();
  let position = 0;
  while (source.slice(position).trim().length > 0) {
    ATTRIBUTE_PATTERN.lastIndex = position;
    const match = ATTRIBUTE_PATTERN.exec(source);
    if (!match) return null;
    const name = match[1].toLowerCase();
    if (attributes.has(name)) return null;
    attributes.set(name, match[2]);
    position = ATTRIBUTE_PATTERN.lastIndex;
  }
  return attributes;
}

function parseGradientTag(rest: string): RichTextPaint | null {
  const attributes = parseAttributes(rest);
  if (!attributes) return null;
  for (const name of attributes.keys()) {
    if (name !== 'start' && name !== 'end' && name !== 'angle') return null;
  }
  const start = parseRichTextColor(attributes.get('start') ?? '');
  const end = parseRichTextColor(attributes.get('end') ?? '');
  if (!start || !end) return null;
  const angleText = attributes.get('angle');
  let angle = DEFAULT_RICH_TEXT_GRADIENT_ANGLE;
  if (angleText !== undefined) {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(angleText)) return null;
    angle = Number(angleText);
  }
  return { kind: 'gradient', start, end, angle };
}

/** The tag that `closing`, `rawName` and `rest` spell, or null if they spell none. */
function parseTag(closing: boolean, rawName: string, rest: string): ParsedTag | null {
  const name = rawName.toLowerCase();
  const bare = rest.trim().length === 0;

  if (closing) {
    return bare && (name === 'b' || name === 'i' || name === 'color' || name === 'gradient')
      ? { kind: 'close', name }
      : null;
  }
  if (name === 'noparse') return bare ? { kind: 'noparse' } : null;
  if (name === 'b' || name === 'i') return bare ? { kind: 'open', tag: { name } } : null;
  if (name === 'color') {
    const value = /^\s*=\s*(\S+)\s*$/.exec(rest);
    const color = value ? parseRichTextColor(value[1]) : null;
    return color ? { kind: 'open', tag: { name, paint: { kind: 'color', color } } } : null;
  }
  if (name === 'gradient') {
    const paint = parseGradientTag(rest);
    return paint ? { kind: 'open', tag: { name, paint } } : null;
  }
  return null;
}

function samePaint(a: RichTextPaint | null, b: RichTextPaint | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'color') return b.kind === 'color' && a.color === b.color;
  return b.kind === 'gradient' && a.start === b.start && a.end === b.end && a.angle === b.angle;
}

export function parseRichText(text: string): ParsedRichText {
  // The common case, and the cheap one: no "<", no tags.
  if (!text.includes('<')) {
    return {
      runs: text.length > 0 ? [{ text, bold: false, italic: false, paint: null }] : [],
      plain: text,
      hasMarkup: false,
    };
  }

  const runs: RichTextRun[] = [];
  const open: OpenTag[] = [];
  let hasMarkup = false;

  const append = (piece: string) => {
    if (piece.length === 0) return;
    const bold = open.some((tag) => tag.name === 'b');
    const italic = open.some((tag) => tag.name === 'i');
    let paint: RichTextPaint | null = null;
    for (const tag of open) {
      if (tag.name === 'color' || tag.name === 'gradient') paint = tag.paint;
    }
    const last = runs[runs.length - 1];
    if (last && last.bold === bold && last.italic === italic && samePaint(last.paint, paint)) {
      last.text += piece;
    } else {
      runs.push({ text: piece, bold, italic, paint });
    }
  };

  let position = 0;
  while (position < text.length) {
    const tagStart = text.indexOf('<', position);
    if (tagStart === -1) {
      append(text.slice(position));
      break;
    }
    append(text.slice(position, tagStart));

    TAG_PATTERN.lastIndex = tagStart;
    const match = TAG_PATTERN.exec(text);
    const tag = match ? parseTag(match[1] === '/', match[2], match[3]) : null;
    const tagEnd = TAG_PATTERN.lastIndex;

    if (!tag) {
      // Not a tag: the "<" is text, and what follows it is read afresh.
      append('<');
      position = tagStart + 1;
      continue;
    }

    if (tag.kind === 'noparse') {
      hasMarkup = true;
      NOPARSE_END.lastIndex = tagEnd;
      const end = NOPARSE_END.exec(text);
      append(text.slice(tagEnd, end ? end.index : text.length));
      position = end ? NOPARSE_END.lastIndex : text.length;
      continue;
    }

    if (tag.kind === 'open') {
      hasMarkup = true;
      open.push(tag.tag);
      position = tagEnd;
      continue;
    }

    // A closing tag closes the nearest open tag of its own name and no other:
    // in "<b>a<i>b</b>c</i>" the italic runs on to its own closing tag. With
    // no tag of its name open, it is text.
    let opener = -1;
    for (let index = open.length - 1; index >= 0; index -= 1) {
      if (open[index].name === tag.name) {
        opener = index;
        break;
      }
    }
    if (opener === -1) {
      append('<');
      position = tagStart + 1;
      continue;
    }
    hasMarkup = true;
    open.splice(opener, 1);
    position = tagEnd;
  }

  return { runs, plain: runs.map((run) => run.text).join(''), hasMarkup };
}
