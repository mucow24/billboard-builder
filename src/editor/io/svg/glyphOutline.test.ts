// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as opentype from 'opentype.js';
import { describe, expect, it, vi } from 'vitest';

import { parsePathData } from '../../../test/svgPathData';
import { outlinePathData, parseOutlineFont } from './glyphOutline';

// No bundled font leans its outlines with its CFF font matrix, so the tests of that
// give a bundled font's bytes a slanted matrix as opentype.js parses them.
const { fontMatrixOverrides } = vi.hoisted(() => ({ fontMatrixOverrides: new WeakMap<ArrayBuffer, number[]>() }));

vi.mock('opentype.js', async (importOriginal) => {
  // A CommonJS module: its exports are the properties of `default`.
  const actual = (await importOriginal<{ default: typeof import('opentype.js') }>()).default;
  const parse: typeof actual.parse = (bytes, ...rest) => {
    const font = actual.parse(bytes, ...rest);
    const matrix = bytes instanceof ArrayBuffer ? fontMatrixOverrides.get(bytes) : undefined;
    if (matrix) font.tables.cff.topDict.fontMatrix = matrix;
    return font;
  };
  const mocked = { ...actual, parse };
  return { ...mocked, default: mocked };
});

type OutlineCommand = opentype.PathCommand;

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** The commands of a path drawn through opentype's own path API. */
function drawn(draw: (path: opentype.Path) => void): OutlineCommand[] {
  const path = new opentype.Path();
  draw(path);
  return path.commands;
}

/** A command's numbers, in the order SVG path data lists them. */
function coordinates(command: OutlineCommand): number[] {
  switch (command.type) {
    case 'M':
    case 'L':
      return [command.x, command.y];
    case 'Q':
      return [command.x1, command.y1, command.x, command.y];
    case 'C':
      return [command.x1, command.y1, command.x2, command.y2, command.x, command.y];
    default:
      return [];
  }
}

/** Every point of some path data as `[x, y]`, control points included. */
function points(d: string): Array<[number, number]> {
  const numbers = parsePathData(d).flatMap((command) => command.values);
  return Array.from({ length: numbers.length / 2 }, (_, index) => [
    numbers[index * 2],
    numbers[index * 2 + 1],
  ]);
}

/**
 * Asserts that path data `d` draws `outline`: the outline's commands in the outline's
 * order, every number within the rounding to 2 decimals. Lines of the outline may be
 * missing from `d` (the ones that add nothing to the filled shape are left out); moves
 * and curves may not. Also fails, through `parsePathData`, when `d` holds something
 * that is not a number or a command with the wrong count of numbers.
 */
function expectPathToDraw(d: string, outline: OutlineCommand[]): void {
  const written = parsePathData(d);
  let next = 0;
  for (const command of outline) {
    const expected = coordinates(command);
    const candidate = written[next];
    const isNextWritten =
      candidate !== undefined &&
      candidate.type === command.type &&
      candidate.values.every((value, index) => Math.abs(value - expected[index]) <= 0.005 + 1e-9);
    if (isNextWritten) {
      next += 1;
    } else {
      expect(command.type, `${command.type} ${expected.join(' ')} is not in the path`).toBe('L');
    }
  }
  expect(next).toBe(written.length);
}

describe('parseOutlineFont', () => {
  it('extracts a non-empty glyph contour from a TrueType font', () => {
    const font = parseOutlineFont(loadFont('Audiowide-Regular.ttf'));
    expect(font).not.toBeNull();
    const d = font!.glyphPath('A', 100, 0, 100);
    expect(d).toBeTruthy();
    expect(d!.startsWith('M')).toBe(true);
  });

  it('parses an OTF/CFF font and outlines a glyph', () => {
    const font = parseOutlineFont(loadFont('Azonix.otf'));
    expect(font).not.toBeNull();
    expect(font!.glyphPath('A', 100, 0, 100)).toBeTruthy();
  });

  it('returns a stable golden contour for a known glyph (catches shape regressions)', () => {
    const font = parseOutlineFont(loadFont('Audiowide-Regular.ttf'));
    expect(font!.glyphPath('A', 100, 0, 100)).toMatchSnapshot();
  });

  it('returns null for unparseable bytes instead of throwing', () => {
    expect(parseOutlineFont(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });

  it('reports a positive unitsPerEm', () => {
    const font = parseOutlineFont(loadFont('Audiowide-Regular.ttf'));
    expect(font!.unitsPerEm).toBeGreaterThan(0);
  });

  // Regression: opentype.js 2.0.0's own serializer (`toPathData`) wrote `NaN` into
  // outlines placed at x = 0 on a whole-number baseline. All glyphs of a text layer
  // share one <path>, and a renderer stops at the first command it cannot read. The
  // `outlinePathData` tests below pin the numbers it got wrong; these check whole
  // glyphs of CFF and TrueType fonts.
  it.each([
    { file: 'Albertus MT Std Regular.otf', chars: 'a', fontSize: 120 },
    { file: 'Barlow-Italic.ttf', chars: 'a', fontSize: 144 },
    { file: 'Barlow-Regular.ttf', chars: '$OQmn', fontSize: 100 },
  ])('writes every number of $file "$chars" at $fontSize px', ({ file, chars, fontSize }) => {
    const bytes = loadFont(file);
    const font = parseOutlineFont(bytes)!;
    const reference = opentype.parse(bytes);

    for (const ch of chars) {
      const d = font.glyphPath(ch, fontSize, 0, 0);
      expect(d).not.toBeNull();
      expect(d).not.toContain('NaN');
      // Each command has the numbers it takes, and they are the glyph's own.
      expectPathToDraw(d!, reference.charToGlyph(ch).getPath(0, 0, fontSize).commands);
    }
  });

  it('gives no outline, rather than unreadable path data, for a glyph it cannot place', () => {
    const font = parseOutlineFont(loadFont('Audiowide-Regular.ttf'))!;
    expect(font.glyphPath('A', Number.NaN, 0, 100)).toBeNull();
    expect(font.glyphPath('A', 100, Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  // Some obliques hold upright outlines, identical to their upright sibling's, and get
  // their slant from the CFF font matrix: x' = a·x + c·y, so every point moves right by
  // c / a of its height above the baseline. Browsers apply the matrix when they render.
  it.each([
    { file: 'Albertus MT Std Regular.otf', skew: 0.000158384, leans: 'right' },
    { file: 'Albertus MT Std Regular.otf', skew: -0.0002, leans: 'left' },
  ])('slants $file to the $leans by the skew in its font matrix', ({ file, skew }) => {
    const obliqueBytes = loadFont(file);
    fontMatrixOverrides.set(obliqueBytes, [0.001, 0, skew, 0.001, 0, 0]);
    expect(opentype.parse(obliqueBytes).tables.cff.topDict.fontMatrix).toEqual([0.001, 0, skew, 0.001, 0, 0]);
    const slant = skew / 0.001;

    const uprightFont = parseOutlineFont(loadFont(file))!;
    const obliqueFont = parseOutlineFont(obliqueBytes)!;
    const baselineY = 80;

    // Straight and curved glyphs, with points above and below the baseline.
    for (const ch of 'Hgo') {
      const uprightPath = uprightFont.glyphPath(ch, 100, 12, baselineY)!;
      const obliquePath = obliqueFont.glyphPath(ch, 100, 12, baselineY)!;
      // The same commands: only x changes.
      expect(obliquePath.replace(/[^A-Z]/g, '')).toBe(uprightPath.replace(/[^A-Z]/g, ''));

      const uprightPoints = points(uprightPath);
      points(obliquePath).forEach(([x, y], index) => {
        const [uprightX, uprightY] = uprightPoints[index];
        expect(y).toBe(uprightY);
        // About 11 px at the top of the H. Both paths are rounded to 2 decimals.
        expect(Math.abs(x - (uprightX + slant * (baselineY - uprightY)))).toBeLessThan(0.02);
      });
    }
  });

  // Faked italic: the caller asks for a lean the font does not have.
  it.each([
    { file: 'Barlow-Regular.ttf', outlines: 'TrueType' },
    { file: 'Albertus MT Std Regular.otf', outlines: 'CFF' },
  ])('leans $outlines outlines by the slant it is asked for', ({ file }) => {
    const font = parseOutlineFont(loadFont(file))!;
    const baselineY = 80;

    for (const ch of 'Hgo') {
      const uprightPath = font.glyphPath(ch, 100, 12, baselineY)!;
      const leaningPath = font.glyphPath(ch, 100, 12, baselineY, { slant: 0.25 })!;
      expect(leaningPath.replace(/[^A-Z]/g, '')).toBe(uprightPath.replace(/[^A-Z]/g, ''));

      const uprightPoints = points(uprightPath);
      points(leaningPath).forEach(([x, y], index) => {
        const [uprightX, uprightY] = uprightPoints[index];
        expect(y).toBe(uprightY);
        expect(Math.abs(x - (uprightX + 0.25 * (baselineY - uprightY)))).toBeLessThan(0.02);
      });
    }
  });

  it('adds the slant it is asked for to the one in the font matrix', () => {
    const bytes = loadFont('Albertus MT Std Regular.otf');
    fontMatrixOverrides.set(bytes, [0.001, 0, 0.0002, 0.001, 0, 0]);
    const font = parseOutlineFont(bytes)!;
    const upright = parseOutlineFont(loadFont('Albertus MT Std Regular.otf'))!;

    const uprightPoints = points(upright.glyphPath('H', 100, 12, 80)!);
    points(font.glyphPath('H', 100, 12, 80, { slant: 0.25 })!).forEach(([x, y], index) => {
      const [uprightX, uprightY] = uprightPoints[index];
      expect(y).toBe(uprightY);
      expect(Math.abs(x - (uprightX + 0.45 * (80 - uprightY)))).toBeLessThan(0.02);
    });
  });

  it('leaves the outlines of a font with a plain font matrix as they are', () => {
    const bytes = loadFont('Albertus MT Std Regular.otf');
    const reference = opentype.parse(bytes);
    expect(reference.tables.cff.topDict.fontMatrix).toEqual([0.001, 0, 0, 0.001, 0, 0]);

    const font = parseOutlineFont(bytes)!;
    for (const ch of 'Hgo') {
      expectPathToDraw(font.glyphPath(ch, 100, 12, 80)!, reference.charToGlyph(ch).getPath(12, 80, 100).commands);
    }
  });
});

describe('outlinePathData', () => {
  it('writes a coordinate a hair off a whole number as that number', () => {
    // opentype's toPathData(2) gives "M10 10LNaN 5".
    const commands = drawn((path) => {
      path.moveTo(10, 10);
      path.lineTo(3.0000000000000004, 5);
    });
    expect(outlinePathData(commands)).toBe('M10 10L3 5');
  });

  it('keeps a coordinate just below zero apart from the number before it', () => {
    // opentype's toPathData(2) gives "M10 10L74.200": one number where the line needs
    // two, and every coordinate after it in the path shifted by one place.
    const commands = drawn((path) => {
      path.moveTo(10, 10);
      path.lineTo(74.2, -0.003);
    });
    expect(outlinePathData(commands)).toBe('M10 10L74.20 0');
  });

  it('rounds to 2 decimals, whole numbers bare, with a space between all numbers', () => {
    const commands = drawn((path) => {
      path.moveTo(-1.5, -2.25);
      path.quadraticCurveTo(-3, -4.126, 5, -6.75);
      path.curveTo(7.004, -8, -9.996, 10, -11.2, -12.3);
    });
    expect(outlinePathData(commands)).toBe('M-1.50 -2.25Q-3 -4.13 5 -6.75C7 -8 -10 10 -11.20 -12.30');
  });

  it('leaves out a line that does not move the pen', () => {
    const commands = drawn((path) => {
      path.moveTo(0, 0);
      path.quadraticCurveTo(10, 0, 10, 10);
      path.lineTo(10, 10);
      path.lineTo(0, 10);
      path.curveTo(0, 20, 10, 20, 20, 20);
    });
    expect(outlinePathData(commands)).toBe('M0 0Q10 0 10 10L0 10C0 20 10 20 20 20');
  });

  it('leaves out the last line when it ends where its contour started, or within a pixel of it', () => {
    const triangle = (endX: number, endY: number) =>
      drawn((path) => {
        path.moveTo(0, 0);
        path.lineTo(10, 0);
        path.lineTo(10, 10);
        path.lineTo(endX, endY);
      });

    // Filling the path closes the contour anyway.
    expect(outlinePathData(triangle(0, 0))).toBe('M0 0L10 0L10 10');
    expect(outlinePathData(triangle(0.6, -0.8))).toBe('M0 0L10 0L10 10');
    expect(outlinePathData(triangle(0, 1.5))).toBe('M0 0L10 0L10 10L0 1.50');
  });

  it('keeps the closing line of every contour but the last', () => {
    const commands = drawn((path) => {
      path.moveTo(0, 0);
      path.lineTo(10, 0);
      path.lineTo(10, 10);
      path.lineTo(0, 0);
      path.moveTo(20, 0);
      path.lineTo(30, 0);
      path.lineTo(30, 10);
      path.lineTo(20, 0);
    });
    expect(outlinePathData(commands)).toBe('M0 0L10 0L10 10L0 0M20 0L30 0L30 10');
  });

  it('writes a closed contour with Z, without the line Z draws', () => {
    const commands = drawn((path) => {
      path.moveTo(0, 0);
      path.lineTo(10, 0);
      path.lineTo(10, 10);
      path.lineTo(0, 0);
      path.closePath();
      path.moveTo(20, 0);
      path.lineTo(30, 0);
      path.lineTo(30, 10);
      path.closePath();
    });
    expect(outlinePathData(commands)).toBe('M0 0L10 0L10 10ZM20 0L30 0L30 10Z');
  });

  it('gives null rather than write a coordinate that is not a finite number', () => {
    for (const coordinate of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const commands = drawn((path) => {
        path.moveTo(0, 0);
        path.lineTo(coordinate, 5);
        path.lineTo(20, 20);
      });
      expect(outlinePathData(commands)).toBeNull();
    }
  });

  describe('with closed contours, for outlines that are stroked', () => {
    it('ends every contour with a Z in place of the line that closes it', () => {
      // Two squares as opentype.js gives them: no Z, and a closing line on all but the last.
      const d = outlinePathData(
        [
          { type: 'M', x: 0, y: 0 },
          { type: 'L', x: 10, y: 0 },
          { type: 'L', x: 10, y: 10 },
          { type: 'L', x: 0, y: 10 },
          { type: 'L', x: 0, y: 0 },
          { type: 'M', x: 20, y: 0 },
          { type: 'L', x: 30, y: 0 },
          { type: 'L', x: 30, y: 10 },
          { type: 'L', x: 20, y: 10 },
        ],
        true,
      );
      expect(d).toBe('M0 0L10 0L10 10L0 10ZM20 0L30 0L30 10L20 10Z');
    });

    it('closes a contour that ends in a curve, and adds no second Z to a closed one', () => {
      const d = outlinePathData(
        [
          { type: 'M', x: 0, y: 0 },
          { type: 'L', x: 10, y: 0 },
          { type: 'Q', x1: 10, y1: 10, x: 0, y: 0 },
          { type: 'M', x: 20, y: 0 },
          { type: 'L', x: 30, y: 0 },
          { type: 'L', x: 30, y: 10 },
          { type: 'Z' },
        ],
        true,
      );
      expect(d).toBe('M0 0L10 0Q10 10 0 0ZM20 0L30 0L30 10Z');
    });

    it('closes every contour of a real glyph without moving a point', () => {
      const font = parseOutlineFont(loadFont('Barlow-Regular.ttf'))!;
      const count = (d: string, letter: string) => d.split(letter).length - 1;

      for (const ch of 'DBi8') {
        const open = font.glyphPath(ch, 100, 12, 80)!;
        const closed = font.glyphPath(ch, 100, 12, 80, { closed: true })!;

        expect(count(open, 'Z')).toBe(0);
        expect(count(closed, 'M')).toBe(count(open, 'M'));
        expect(count(closed, 'Z')).toBe(count(closed, 'M'));
        // Every point is one the open outline has: only closing lines went.
        const openPoints = new Set(points(open).map((point) => point.join(',')));
        expect(points(closed).filter((point) => !openPoints.has(point.join(',')))).toEqual([]);
      }
    });
  });

  it('gives null for an outline with nothing to draw', () => {
    expect(outlinePathData([])).toBeNull();
  });
});
