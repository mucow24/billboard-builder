import * as opentype from 'opentype.js';

import { createTextSubstitutions } from './glyphSubstitution';
import type { OutlineFont } from './svgExportTypes';

type OutlineCommand = opentype.PathCommand;
type DrawCommand = Exclude<OutlineCommand, { type: 'Z' }>;

/**
 * Parse font bytes into an {@link OutlineFont} via opentype.js. The font is used
 * purely as a SHAPE source — `glyphPath` returns a glyph contour placed at the
 * caller's pen position; advances/kerning come from canvas measurement upstream.
 * `substitutions` tells which glyphs the canvas draws in place of the characters'
 * own (ligatures and the like, see glyphSubstitution).
 *
 * Returns null when the bytes cannot be parsed (corrupt, unsupported, or e.g. a
 * woff2 face opentype.js cannot decompress), so the caller can fall back to the
 * block+warn path instead of throwing.
 */
export function parseOutlineFont(bytes: ArrayBuffer): OutlineFont | null {
  let font: opentype.Font;
  try {
    font = opentype.parse(bytes);
  } catch {
    return null;
  }

  const slant = fontMatrixSlant(font);

  return {
    unitsPerEm: font.unitsPerEm,
    substitutions: createTextSubstitutions(font),
    // `ch` is a character, or the index of a glyph `substitutions` named.
    glyphPath(ch: string | number, fontSizePx: number, penX: number, baselineY: number) {
      const glyph = typeof ch === 'string' ? font.charToGlyph(ch) : ch < font.numGlyphs ? font.glyphs.get(ch) : null;
      if (!glyph) return null;
      // opentype places glyphs by baseline origin (x, y) = (penX, baselineY).
      const outline = glyph.getPath(penX, baselineY, fontSizePx).commands;
      return outlinePathData(slant === 0 ? outline : slantOutline(outline, slant, baselineY));
    },
  };
}

/**
 * How far a CFF font's font matrix leans its outlines: the distance a point moves to
 * the right for each unit of its height above the baseline. 0 for a plain matrix and
 * for fonts that have none (TrueType outlines).
 *
 * The matrix `[a b c d tx ty]` maps glyph units to the em: x' = a·x + c·y. A plain
 * font has `[0.001 0 0 0.001 0 0]`. Some obliques store upright outlines and lean
 * them with `c` instead of drawing them slanted.
 * Browsers apply the matrix when they render text; opentype.js parses it but returns
 * the outlines as stored, so the export has to apply it to come out as slanted as the
 * canvas. Only this lean is taken from the matrix: the scale is opentype.js's, from
 * the font's unitsPerEm.
 */
function fontMatrixSlant(font: opentype.Font): number {
  const matrix: unknown = font.tables.cff?.topDict?.fontMatrix;
  if (!Array.isArray(matrix)) return 0;
  const slant = matrix[2] / matrix[0];
  return Number.isFinite(slant) ? slant : 0;
}

/**
 * `outline` leaned to the right about its baseline: every point, control points
 * included, moves by `slant` times its height above `baselineY` (SVG y runs down).
 */
function slantOutline(
  outline: readonly OutlineCommand[],
  slant: number,
  baselineY: number,
): OutlineCommand[] {
  const lean = (x: number, y: number) => x + slant * (baselineY - y);
  return outline.map((command) => {
    switch (command.type) {
      case 'M':
      case 'L':
        return { ...command, x: lean(command.x, command.y) };
      case 'Q':
        return { ...command, x1: lean(command.x1, command.y1), x: lean(command.x, command.y) };
      case 'C':
        return {
          ...command,
          x1: lean(command.x1, command.y1),
          x2: lean(command.x2, command.y2),
          x: lean(command.x, command.y),
        };
      default:
        return command;
    }
  });
}

/**
 * Serialize outline commands as SVG path data: absolute commands, coordinates rounded
 * to 2 decimals, a space between the numbers of a command. Returns null when there is
 * nothing to draw, and when a coordinate is not a finite number: a glyph that cannot
 * be placed is left out rather than written as path data no renderer can read.
 *
 * This replaces opentype.js's `path.toPathData(2)`, which (in 2.0.0) writes two kinds
 * of coordinate wrongly: one less than 1e-6 above a whole number becomes the text
 * `NaN`, and one in (-0.005, 0) becomes a `0` with nothing between it and the number
 * before it (`L74.200`). Floating-point noise makes both common, and a renderer stops
 * drawing a <path> at the first command it cannot read, which costs a text layer every
 * glyph after the bad one. Apart from that the output is what `toPathData(2)` gives:
 * the same commands and the same number format.
 */
export function outlinePathData(outline: readonly OutlineCommand[]): string | null {
  let d = '';
  // Where the current contour started, and where the last command written left the pen.
  let startX = 0;
  let startY = 0;
  let penX = Number.NaN;
  let penY = Number.NaN;

  for (let index = 0; index < outline.length; index += 1) {
    const command = outline[index];
    if (command.type === 'Z') {
      d += 'Z';
      penX = Number.NaN;
      penY = Number.NaN;
      continue;
    }

    if (command.type === 'M') {
      startX = command.x;
      startY = command.y;
    } else if (command.type === 'L') {
      // Leave out the lines `toPathData` leaves out, so that outlines keep the commands
      // they have always been exported with: a line that does not move the pen, and a
      // last line (of the outline, or before a Z) that ends within a pixel of where its
      // contour started, since filling or closing the contour draws that line anyway.
      const next = outline[index + 1];
      const endsContour = next === undefined || next.type === 'Z';
      const redundant = endsContour
        ? Math.abs(command.x - startX) <= 1 && Math.abs(command.y - startY) <= 1
        : command.x === penX && command.y === penY;
      if (redundant) continue;
    }

    const numbers: string[] = [];
    for (const coordinate of coordinates(command)) {
      const text = formatCoordinate(coordinate);
      if (text === null) return null;
      numbers.push(text);
    }
    d += command.type + numbers.join(' ');
    penX = command.x;
    penY = command.y;
  }

  return d.length > 0 ? d : null;
}

/** A command's numbers in the order SVG path data lists them. */
function coordinates(command: DrawCommand): number[] {
  switch (command.type) {
    case 'M':
    case 'L':
      return [command.x, command.y];
    case 'Q':
      return [command.x1, command.y1, command.x, command.y];
    case 'C':
      return [command.x1, command.y1, command.x2, command.y2, command.x, command.y];
  }
}

/**
 * A coordinate rounded to 2 decimals, written as `toPathData(2)` writes it: whole
 * numbers bare (`100`), anything else with both decimals (`20.70`). Null when the
 * value is not finite.
 */
function formatCoordinate(value: number): string | null {
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded)) return null;
  // `String` writes the -0 that a value just below zero rounds to as "0".
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
