/**
 * The outline of a text whose bold the browser fakes, drawn from the glyphs'
 * own contours.
 *
 * Everywhere else the outline of a text is the stroke of a Pixi text, which is
 * the 2D canvas's `strokeText` (see `textStroke`). Where a family has no bold
 * file the browser fakes one, and what it then strokes is not the edge of the
 * bold shape. Chromium and WebKit grow the glyphs, and the path they stroke
 * holds the regular outline and both edges of the growth: rings inside every
 * stem. Firefox smears the glyph sideways and strokes every copy. Either shows
 * wherever the fill is see-through.
 *
 * The browser does not hand out the edge of the bold shape, and working it
 * out as a path would take path offsetting. Drawing it takes neither: the SVG
 * export already has the glyphs' contours (`io/svg/svgText`), and the same two
 * steps that make the outline there make it here, on a 2D canvas, with the
 * canvas's own path drawing:
 *
 * 1. Stroke the contours wide enough to reach the outer edge of the outline.
 * 2. Take away the inside of the bold shape, made smaller by half the
 *    outline's width.
 *
 * The contours come from the font's file, which is read and parsed once per
 * font (see "The fonts' contours" below): until that is done the text keeps
 * the browser's stroke.
 *
 * Only a text that needs it comes here (`wantsVectorOutline`): one with an
 * outline, with faked bold, and with a fill that is see-through somewhere.
 * Under an opaque fill the rings do not show, and the outline stays the
 * browser's, as the SVG export leaves its stroke unmasked there.
 */
import type { TextCanvasItem } from '../../document/documentTypes';
import { parseRichText } from '../../document/richText';
import { listRegisteredFonts } from '../../fonts/browserFontLoader';
import {
  drawnText,
  EMOJI_FALLBACK_FAMILY,
  getTextFontRegistrationCount,
  isInEmojiFallbackRange,
} from '../../fonts/emojiFallback';
import { toFontReference } from '../../fonts/fontModel';
import { subscribeToFontRegistrations } from '../../fonts/fontRegistrations';
import { findFontForVariant } from '../../fonts/fontRegistry';
import { browserFontDeps } from '../../io/svg/browserSvgExport';
import { createCanvasTextMeasurer } from '../../io/svg/canvasTextMeasurer';
import { syntheticStyle } from '../../io/svg/documentFontBytes';
import { textItemsOf } from '../../io/svg/exportToSvg';
import type { FontBytes } from '../../io/svg/exportToSvg';
import { fontVariantKey, resolveOutline } from '../../io/svg/fontOutlineProvider';
import { toSvgPaint } from '../../io/svg/svgColor';
import type {
  FontOutlineProvider,
  OutlineFont,
  OutlineResult,
  OutlineUnavailableReason,
  SvgExportWarning,
  SyntheticFontStyle,
  TextMeasurer,
  TextOutlineShape,
} from '../../io/svg/svgExportTypes';
import { textSvg } from '../../io/svg/svgText';
import { emojiFallbackOutline, hasGlyphsFor } from '../../io/svg/svgTextGlyphs';
import { clampRasterResolution, getMaxTextureSize } from './rasterCaps';

/** Whether the emoji fallback may draw any of `text` (see `fonts/emojiFallback`). */
const mayUseFallback = (text: string) => [...drawnText(text)].some(isInEmojiFallbackRange);

/**
 * Whether the browser may fake the bold of any of `item`'s text: of the item,
 * of one of its tagged runs, or of the emoji fallback where the text may use
 * it. Told from the files registered for the families, without reading any or
 * drawing anything, so it is also true for bold in a file that is itself heavy,
 * which Chromium does not fake (see `io/svg/syntheticFontStyle`). That is found
 * out when the outline is laid out: `textOutlineShapes` then has no faked bold
 * and leaves the outline to the browser.
 */
export function hasFakedBold(item: TextCanvasItem): boolean {
  const registered = listRegisteredFonts();
  return textItemsOf(item).some((run) => {
    if (run.fontWeight !== 'bold') return false;
    const families = [run.fontFamily, ...(mayUseFallback(run.text) ? [EMOJI_FALLBACK_FAMILY] : [])];
    return families.some((family) => {
      const file = findFontForVariant(registered, family, '700', run.fontStyle);
      return file ? syntheticStyle(run, file)?.bold === true : false;
    });
  });
}

/**
 * Whether any of `item`'s fills is see-through: the item's own two colours, or
 * the colours of a tagged run. The same test the SVG export masks its stroke
 * by (`strokeElements` in `svgText`), for the item as a whole.
 */
export function hasSeeThroughFill(item: TextCanvasItem): boolean {
  const seeThrough = (color: string) => toSvgPaint(color).alpha < 1;
  if (seeThrough(item.fill) || seeThrough(item.secondaryFill)) return true;
  return parseRichText(item.text).runs.some(({ paint }) => {
    if (!paint) return false;
    return paint.kind === 'color' ? seeThrough(paint.color) : seeThrough(paint.start) || seeThrough(paint.end);
  });
}

/**
 * Whether `item`'s outline is drawn from its glyphs' contours rather than by
 * the browser: it has one, some of its bold is faked, and the rings the
 * browser would stroke inside the glyphs would show through its fill.
 */
export function wantsVectorOutline(item: TextCanvasItem): boolean {
  if (!(item.strokeWidth > 0) || !item.stroke || toSvgPaint(item.stroke).alpha <= 0) return false;
  return hasSeeThroughFill(item) && hasFakedBold(item);
}

// ---------------------------------------------------------------------------
// The fonts' contours
// ---------------------------------------------------------------------------
//
// A font's file is read and parsed once, and kept by the font: its family,
// weight and style, and how many files have been registered for the family,
// so that a file registered later is read anew. The emoji fallback is a font
// like any other here. What an item is drawn with is put together from these
// each time it is asked for, by the item's text as it then is: changing the
// text or its tags reads nothing that has been read, and an item never waits
// for a font another item already has.

/** One font as read: its contours, or why there are none. */
type ReadFont =
  | { ok: true; font: OutlineFont; synthetic?: SyntheticFontStyle }
  | { ok: false; reason: OutlineUnavailableReason };

interface KeptFont {
  /** The family whose registrations the entry goes by, and their number when it was read. */
  family: string;
  registrations: number;
  read: ReadFont;
}

const fonts = new Map<string, KeptFont>();
/** Reads under way, by the same keys. */
const reading = new Map<string, Promise<void>>();
/** Everything an item is still waiting for: a font, and the fallback it may turn out to need after it. */
const waiting = new Set<Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

const ownKey = (run: TextCanvasItem) =>
  `own|${fontVariantKey(run)}|${getTextFontRegistrationCount(run.fontFamily)}`;
const fallbackKey = (run: TextCanvasItem) =>
  `fallback|${run.fontWeight}|${run.fontStyle}|${getTextFontRegistrationCount(EMOJI_FALLBACK_FAMILY)}`;

function changed(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

// A file registered for a family may be the one the browser now draws with:
// what was read for the family before is dropped.
subscribeToFontRegistrations(() => {
  let dropped = false;
  for (const [key, kept] of fonts) {
    if (kept.registrations === getTextFontRegistrationCount(kept.family)) continue;
    fonts.delete(key);
    dropped = true;
  }
  if (dropped) changed();
});

/** Whether `run`'s text has a character `font` lacks that the emoji fallback may draw. */
function needsFallback(font: OutlineFont, run: TextCanvasItem): boolean {
  return !hasGlyphsFor(font, [...drawnText(run.text)].filter(isInEmojiFallbackRange).join(''));
}

/** Calls `listener` whenever what has been read changes. Returns the unsubscribe function. */
export function subscribeToFontOutlines(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A number that changes whenever what has been read changes: what `peekFontOutlines` answers by. */
export function fontOutlinesVersion(): number {
  return version;
}

/**
 * The contours of the fonts `item` is drawn with as its text now is, or null
 * while one of them has not been read.
 */
export function peekFontOutlines(item: TextCanvasItem): FontOutlineProvider | null {
  const results = new Map<string, OutlineResult>();
  for (const run of textItemsOf(item)) {
    const own = fonts.get(ownKey(run))?.read;
    if (!own) return null;
    const variant = fontVariantKey(run);
    let result: OutlineResult = results.get(variant) ?? own;
    if (own.ok && needsFallback(own.font, run)) {
      const fallback = fonts.get(fallbackKey(run))?.read;
      if (!fallback) return null;
      if (fallback.ok && result.ok) {
        result = {
          ...result,
          fallback: { font: fallback.font, ...(fallback.synthetic ? { synthetic: fallback.synthetic } : {}) },
        };
      }
    }
    results.set(variant, result);
  }
  return { getOutlineFont: (run) => results.get(fontVariantKey(run)) ?? { ok: false, reason: 'no-bytes' } };
}

/** Read the font kept under `key`, unless it has been or is being read. */
function ensureRead(
  key: string,
  family: string,
  load: () => Promise<FontBytes>,
  as: (font: OutlineFont) => OutlineFont = (font) => font,
): Promise<void> {
  if (fonts.has(key)) return Promise.resolve();
  const underWay = reading.get(key);
  if (underWay) return underWay;
  const registrations = getTextFontRegistrationCount(family);
  const keep = (read: ReadFont) => {
    fonts.set(key, { family, registrations, read });
  };
  const done = load()
    .then(({ kind, bytes, synthetic }) => {
      const outline = resolveOutline(kind, bytes);
      keep(outline.ok ? { ok: true, font: as(outline.font), ...(synthetic ? { synthetic } : {}) } : outline);
    })
    // A font that cannot be read is kept as that: the text keeps the browser's stroke.
    .catch(() => keep({ ok: false, reason: 'no-bytes' }))
    .finally(() => {
      reading.delete(key);
      changed();
    });
  reading.set(key, done);
  return done;
}

/** Start reading whatever fonts of `item` have not been read, the fallback included where its text needs it. */
export function requestFontOutlines(item: TextCanvasItem): void {
  for (const run of textItemsOf(item)) {
    const own = fonts.get(ownKey(run))?.read;
    if (own && (!own.ok || !needsFallback(own.font, run) || fonts.has(fallbackKey(run)))) continue;

    // Every registered family has a file, which is all the document's own font list says.
    const deps = browserFontDeps(listRegisteredFonts().map(toFontReference));
    const all = ensureRead(ownKey(run), run.fontFamily, () => deps.loadFontBytes(run))
      .then(() => {
        const read = fonts.get(ownKey(run))?.read;
        const loadFallback = deps.loadFallbackFontBytes;
        if (!read?.ok || !loadFallback || !needsFallback(read.font, run)) return undefined;
        return ensureRead(fallbackKey(run), EMOJI_FALLBACK_FAMILY, () => loadFallback(run), emojiFallbackOutline);
      })
      .finally(() => {
        waiting.delete(all);
      });
    waiting.add(all);
  }
}

/**
 * Resolves once no font's contours are being read, with whether any were: for
 * an export that must not catch the text half-way.
 */
export async function fontOutlinesSettled(): Promise<boolean> {
  const waited = waiting.size > 0;
  while (waiting.size > 0) await Promise.all([...waiting]);
  return waited;
}

/** Visible for tests: forget everything read. */
export function _resetFontOutlines(): void {
  fonts.clear();
  reading.clear();
  waiting.clear();
  version = 0;
}

// ---------------------------------------------------------------------------
// The outline's shapes
// ---------------------------------------------------------------------------

let measurer: TextMeasurer | null = null;

/**
 * The pieces of `item`'s outline, laid out as the SVG export lays them out,
 * which is as the canvas draws the text. Null where the outline is the
 * browser's to draw: no bold is faked after all, or part of the text has no
 * contours to be had (a system font).
 */
export function textOutlineShapes(item: TextCanvasItem, fontOutlines: FontOutlineProvider): TextOutlineShape[] | null {
  measurer ??= createCanvasTextMeasurer();
  const shapes: TextOutlineShape[] = [];
  const warnings: SvgExportWarning[] = [];
  textSvg(
    item,
    1,
    {
      fontOutlines,
      measurer,
      // Text has nothing to rasterise.
      rasterizer: { rasterizeGenerator: () => '' },
      onTextOutline: (shape) => shapes.push(shape),
    },
    [],
    warnings,
  );
  if (warnings.length > 0 || !shapes.some((shape) => shape.bold)) return null;
  return shapes;
}

// ---------------------------------------------------------------------------
// The outline's image
// ---------------------------------------------------------------------------

export interface VectorOutlineImage {
  /** The outline in white: whoever shows it tints it. */
  canvas: HTMLCanvasElement;
  /** Where the canvas goes, in px of the item. */
  x: number;
  y: number;
  /** Texels per px. */
  resolution: number;
}

/**
 * The image is no larger than this, in texels. Drawing it takes two more
 * canvases of its size for a moment; past this it is drawn smaller and shown
 * scaled up. (An image of 16 million texels did not show at all: Chromium on
 * Windows, November 2026.)
 */
const MAX_TEXELS = 8_000_000;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * A box around the outline of `shape`, `strokeWidth` px wide: the box of the
 * contours' points, control points included, grown by what the outline and
 * the faked bold add. Tighter than the shape's `area`, which allows a whole
 * font size around the lines. The `area` itself where the path data is not
 * the absolute moves, lines and curves that glyph contours are written in.
 */
export function outlineBox(shape: TextOutlineShape, strokeWidth: number): Box {
  const { area } = shape;
  const whole = { left: area.x, top: area.y, right: area.x + area.width, bottom: area.y + area.height };
  if (/[^MLQCZ\d\s.,eE+-]/.test(shape.d)) return whole;
  const numbers = shape.d.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 2 || numbers.length % 2 !== 0 || numbers.some((value) => !Number.isFinite(value))) return whole;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < numbers.length; i += 2) {
    left = Math.min(left, numbers[i]);
    right = Math.max(right, numbers[i]);
    top = Math.min(top, numbers[i + 1]);
    bottom = Math.max(bottom, numbers[i + 1]);
  }
  // Half the outline, and for grown bold half the growth, which a mitered
  // corner carries up to four times as far; a px for the soft edge.
  const growth = shape.bold?.kind === 'stroke' ? shape.bold.width : 0;
  const room = strokeWidth / 2 + growth * 2 + 1;
  return {
    left: Math.max(whole.left, left - room),
    top: Math.max(whole.top, top - room),
    right: Math.min(whole.right, right + room),
    bottom: Math.min(whole.bottom, bottom + room),
  };
}

const OPAQUE = '#ffffff';

/**
 * Draw the outline of `shapes`, `strokeWidth` px wide, at `requestedResolution`
 * texels per px or as near as the image may be large. Null where there is
 * nothing to draw with.
 */
export function rasteriseVectorOutline(
  shapes: TextOutlineShape[],
  strokeWidth: number,
  requestedResolution: number,
): VectorOutlineImage | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined' || shapes.length === 0) return null;

  const boxes = shapes.map((shape) => outlineBox(shape, strokeWidth));
  const left = Math.floor(Math.min(...boxes.map((box) => box.left)));
  const top = Math.floor(Math.min(...boxes.map((box) => box.top)));
  const width = Math.max(1, Math.ceil(Math.max(...boxes.map((box) => box.right))) - left);
  const height = Math.max(1, Math.ceil(Math.max(...boxes.map((box) => box.bottom))) - top);
  const resolution = Math.min(
    clampRasterResolution(requestedResolution, Math.max(width, height, 1), getMaxTextureSize()),
    Math.sqrt(MAX_TEXELS / Math.max(1, width * height)),
  );

  const makeCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * resolution));
    canvas.height = Math.max(1, Math.ceil(height * resolution));
    const context = canvas.getContext('2d');
    return context ? { canvas, context } : null;
  };
  const image = makeCanvas();
  const piece = makeCanvas();
  const inside = makeCanvas();
  if (!image || !piece || !inside) return null;

  /** Ready `context` to draw anew, in px of the item. */
  const start = (context: CanvasRenderingContext2D) => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.setTransform(resolution, 0, 0, resolution, -left * resolution, -top * resolution);
    context.fillStyle = OPAQUE;
    context.strokeStyle = OPAQUE;
  };
  const stroke = (context: CanvasRenderingContext2D, path: Path2D, lineWidth: number, join: CanvasLineJoin) => {
    if (!(lineWidth > 0)) return;
    context.lineWidth = lineWidth;
    context.lineJoin = join;
    context.lineCap = join === 'round' ? 'round' : 'butt';
    context.miterLimit = 4;
    context.stroke(path);
  };
  /** Take what is drawn on `inside` out of `piece`, moved `dx` px to the right. */
  const takeOut = (dx = 0) => {
    piece.context.setTransform(1, 0, 0, 1, 0, 0);
    piece.context.globalCompositeOperation = 'destination-out';
    piece.context.drawImage(inside.canvas, dx * resolution, 0);
  };

  // Every piece is drawn and cut on its own, then added to the image: what is
  // taken out of one piece's outline stays in its neighbours'.
  for (const shape of shapes) {
    const path = new Path2D(shape.d);
    start(piece.context);

    if (!shape.bold) {
      // Glyphs whose bold is real, or that are not bold: their outline as it is.
      stroke(piece.context, path, strokeWidth, 'round');
    } else if (shape.bold.kind === 'stroke') {
      // Grown bold: its edge lies half the growth outside the contours, and the
      // outline reaches half its own width to either side of that.
      const growth = shape.bold.width;
      stroke(piece.context, path, strokeWidth + growth, 'round');
      start(inside.context);
      inside.context.fill(path);
      if (growth >= strokeWidth) {
        // The inside of the outline is the glyphs grown short of the bold, as
        // the bold itself is grown: mitered.
        stroke(inside.context, path, growth - strokeWidth, 'miter');
      } else {
        // It lies inside the contours: the glyphs less a rim of them.
        inside.context.globalCompositeOperation = 'destination-out';
        stroke(inside.context, path, strokeWidth - growth, 'round');
      }
      takeOut();
    } else {
      // Smeared bold: the outline of every copy, less the inside of the smear,
      // which is one copy made smaller by half the outline, at every place the
      // glyph is smeared to. (In a stem thinner than the outline is wide, a
      // sliver narrower than the smear stays.)
      stroke(piece.context, path, strokeWidth, 'round');
      const unsmeared = new Path2D(shape.unsmearedD);
      start(inside.context);
      inside.context.fill(unsmeared);
      inside.context.globalCompositeOperation = 'destination-out';
      stroke(inside.context, unsmeared, strokeWidth, 'round');
      for (const offset of shape.bold.offsets) takeOut(offset);
    }

    image.context.drawImage(piece.canvas, 0, 0);
  }

  // Give the working canvases' memory back now, not when they are collected.
  for (const { canvas } of [piece, inside]) {
    canvas.width = 0;
    canvas.height = 0;
  }
  return { canvas: image.canvas, x: left, y: top, resolution };
}
