import fs from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import {
  captureDownload,
  clickToolbarPopoverItem,
  createProjectDocument,
  createTextFixture,
  openFreshEditor,
  readStageDebug,
  uploadProject,
  wheelAt,
} from './support/editor';

/**
 * The canvas rasterises a text layer into a texture sized from the advance box of
 * its lines: advance widths across, the font's ascent and descent down. Glyph ink
 * is free to leave that box. An italic glyph leans past its advance width, a
 * script "j" swings left of its origin, a cedilla hangs below the descent. Each
 * layer here puts ink outside the box on one known side. The canvas has to show
 * all of it, and show it where the layer's alignment puts it: making room for the
 * ink must not move the text.
 *
 * Export > PNG is the canvas as Pixi drew it, so the checks read that.
 */

type Side = 'left' | 'right' | 'top' | 'bottom';

interface TextCase {
  id: string;
  /** The side on which this layer's ink leaves the advance box, or null for a control that stays inside. */
  leaves: Side | null;
  text: string;
  fontFamily: string;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  /** Filled with GRADIENT from the left edge of the layer's box to its right edge, instead of plain white. */
  gradient: boolean;
}

const GRADIENT = { from: '#ff0000', to: '#0000ff' };

const textCase = (
  id: string,
  leaves: Side | null,
  text: string,
  fontFamily: string,
  overrides: Partial<TextCase> = {},
): TextCase => ({
  id,
  leaves,
  text,
  fontFamily,
  fontStyle: 'normal',
  fontSize: 100,
  align: 'left',
  letterSpacing: 0,
  gradient: false,
  ...overrides,
});

const ITALIC = { fontStyle: 'italic' } as const;

const CASES: TextCase[] = [
  // The italic of this family is an oblique: the top right corner of the H leans
  // past the advance width.
  textCase('italic H, left aligned', 'right', 'H', 'Futura Light Condensed', ITALIC),
  textCase('italic H, centred', null, 'H', 'Futura Light Condensed', { ...ITALIC, align: 'center' }),
  textCase('italic H, right aligned', 'right', 'H', 'Futura Light Condensed', { ...ITALIC, align: 'right' }),
  textCase('italic word', 'right', 'HIlamburg', 'Futura Light Condensed', { ...ITALIC, fontSize: 64 }),
  textCase('italic lines, right aligned', 'right', 'HH\nH', 'Futura Light Condensed', {
    ...ITALIC,
    fontSize: 80,
    align: 'right',
  }),
  textCase('italic, letter spaced', 'right', 'HIH', 'Futura Light Condensed', { ...ITALIC, letterSpacing: 12 }),
  // The tail of this j swings far to the left of the glyph origin.
  textCase('script j', 'left', 'j', 'Pinyon Script'),
  // Taller than the accented capitals the font's ascent is taken from.
  textCase('tall exclamation mark', 'top', '!', 'Kosmos'),
  // An all-caps face: the cedilla hangs below the descent of every other glyph.
  // The gradient is placed in the texture's own space, so it shows whether the
  // fill stays put when the texture gains room.
  textCase('cedilla, gradient fill', 'bottom', 'Ç', 'AKONY', { gradient: true }),
];

// Every layer gets a cell of its own, with enough room around the box that ink
// leaving it stays inside the cell.
const COLUMNS = 3;
const CELL = { width: 420, height: 300 };
const BOX = { dx: 130, dy: 70, width: 200, height: 150 };
const LINE_HEIGHT = 1.1;

const PLACED = CASES.map((entry, index) => {
  const cell = {
    x: (index % COLUMNS) * CELL.width,
    y: Math.floor(index / COLUMNS) * CELL.height,
  };
  return { ...entry, cell, box: { x: cell.x + BOX.dx, y: cell.y + BOX.dy } };
});

const CANVAS = {
  width: COLUMNS * CELL.width,
  height: Math.ceil(CASES.length / COLUMNS) * CELL.height,
};

function buildDocument() {
  return {
    ...createProjectDocument(
      PLACED.map((entry, index) =>
        createTextFixture({
          id: `text-case-${index}`,
          name: entry.id,
          zIndex: index + 1,
          text: entry.text,
          fontFamily: entry.fontFamily,
          fontStyle: entry.fontStyle,
          fontSize: entry.fontSize,
          align: entry.align,
          letterSpacing: entry.letterSpacing,
          lineHeight: LINE_HEIGHT,
          x: entry.box.x,
          y: entry.box.y,
          width: BOX.width,
          height: BOX.height,
          ...(entry.gradient
            ? { gradientEnabled: true, gradientAngle: 90, fill: GRADIENT.from, secondaryFill: GRADIENT.to }
            : {}),
        }),
      ),
    ),
    canvas: CANVAS,
  };
}

/**
 * Startup has finished once the Properties tab counts the registered fonts.
 * Before that the bundled fonts are still loading, so a layer could be drawn in
 * a fallback font, and the end of startup replaces a project loaded in the
 * meantime with the saved canvas.
 */
async function waitForStartupAndFonts(page: Page) {
  await expect(page.getByText(/\d+ uploaded font\(s\) ready in this session/)).toBeVisible({
    timeout: 30_000,
  });

  // The faces these layers need, by name: a font file that failed to load
  // should fail the test here rather than as a wrong-looking glyph.
  const wanted = [...new Map(CASES.map((entry) => [`${entry.fontFamily}/${entry.fontStyle}`, entry])).values()].map(
    (entry) => ({ family: entry.fontFamily, style: entry.fontStyle }),
  );
  const missing = await page.evaluate(
    (faces) =>
      faces
        .filter(
          (wantedFace) =>
            ![...document.fonts].some(
              (face) =>
                face.family.replace(/^["']|["']$/g, '') === wantedFace.family &&
                face.style === wantedFace.style &&
                face.status === 'loaded',
            ),
        )
        .map((face) => `${face.family} ${face.style}`),
    wanted,
  );
  expect(missing, 'bundled font faces these layers use that are not loaded').toEqual([]);
}

interface CaseReport {
  id: string;
  /** Solid ink in the expected render. */
  inkPixels: number;
  /** How far the expected ink reaches past the advance box on the side the case names, in px. */
  reach: number | null;
  /** Solid expected ink where the canvas shows none, with where it is. */
  missing: number;
  missingAt: string;
  /** Solid canvas ink where none is expected. */
  displaced: number;
  /** Largest difference in a colour channel (0 to 255) between the canvas and the expected render, over opaque ink. */
  colourOffBy: number;
  /** Ink bounds [left, top, right, bottom] measured from the layer's top left corner. */
  canvasBounds: number[] | null;
  expectedBounds: number[] | null;
}

/**
 * Compare the exported canvas, layer by layer, with the same text drawn by a 2D
 * canvas that has room on every side.
 */
async function compareCanvasWithRoomyRender(page: Page): Promise<CaseReport[]> {
  const download = await captureDownload(page, async () => {
    await clickToolbarPopoverItem(page, 'Export', 'PNG');
  });
  const png = await fs.readFile(await download.path());

  return page.evaluate(
    async ({ pngBase64, placed, cell, boxOffset, boxWidth, lineHeightFactor, gradient }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${pngBase64}`;
      await image.decode();
      const exported = document.createElement('canvas');
      exported.width = image.naturalWidth;
      exported.height = image.naturalHeight;
      const exportedContext = exported.getContext('2d', { willReadFrequently: true })!;
      exportedContext.drawImage(image, 0, 0);

      const segmenter = new Intl.Segmenter();
      const graphemes = (text: string) => [...segmenter.segment(text)].map((part) => part.segment);

      return placed.map((entry) => {
        const roomy = document.createElement('canvas');
        roomy.width = cell.width;
        roomy.height = cell.height;
        const context = roomy.getContext('2d', { willReadFrequently: true })!;
        context.font = `${entry.fontStyle === 'italic' ? 'italic ' : ''}${entry.fontSize}px ${JSON.stringify(entry.fontFamily)}`;
        if (entry.gradient) {
          const fill = context.createLinearGradient(boxOffset.x, 0, boxOffset.x + boxWidth, 0);
          fill.addColorStop(0, gradient.from);
          fill.addColorStop(1, gradient.to);
          context.fillStyle = fill;
        } else {
          context.fillStyle = '#ffffff';
        }

        // Where the canvas puts a line. The line box runs from the layer's top
        // edge; the font's ascent and descent are the ink of these glyphs, and a
        // line box taller than that is split evenly above and below.
        const fontInk = context.measureText('|ÉqÅM');
        const ascent = fontInk.actualBoundingBoxAscent;
        const descent = fontInk.actualBoundingBoxDescent;
        const lineHeight = entry.fontSize * lineHeightFactor;
        const firstBaseline = ascent + Math.max(0, (lineHeight - (ascent + descent)) / 2);
        const lines = entry.text.split('\n');
        const lineWidth = (line: string) => {
          const metrics = context.measureText(line);
          const spacing = (graphemes(line).length - 1) * entry.letterSpacing;
          // A line is as wide as its advance or its ink, whichever is wider.
          return Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + spacing;
        };

        const advanceBox = {
          width: Math.max(...lines.map(lineWidth)),
          height: Math.max(lineHeight, ascent + descent) + (lines.length - 1) * lineHeight,
        };
        const reach = { left: 0, right: 0, top: 0, bottom: 0 };

        lines.forEach((line, lineIndex) => {
          const width = lineWidth(line);
          const alignOffset =
            entry.align === 'right' ? boxWidth - width : entry.align === 'center' ? (boxWidth - width) / 2 : 0;
          const penX = boxOffset.x + alignOffset;
          const baseline = boxOffset.y + lineIndex * lineHeight + firstBaseline;

          // With letter spacing the canvas draws one glyph at a time, each
          // advanced by what it adds to the width of the rest of the line.
          const parts = entry.letterSpacing === 0 ? [line] : graphemes(line);
          let position = penX;
          let remainingWidth = context.measureText(line).width;
          parts.forEach((part, partIndex) => {
            context.fillText(part, position, baseline);
            const ink = context.measureText(part);
            const fromLineStart = position - penX;
            reach.left = Math.max(reach.left, ink.actualBoundingBoxLeft - fromLineStart);
            reach.right = Math.max(reach.right, fromLineStart + ink.actualBoundingBoxRight - width);
            reach.top = Math.max(reach.top, ink.actualBoundingBoxAscent - (lineIndex * lineHeight + firstBaseline));
            reach.bottom = Math.max(
              reach.bottom,
              lineIndex * lineHeight + firstBaseline + ink.actualBoundingBoxDescent - advanceBox.height,
            );
            const widthAfter = context.measureText(parts.slice(partIndex + 1).join('')).width;
            position += remainingWidth - widthAfter + entry.letterSpacing;
            remainingWidth = widthAfter;
          });
        });

        const canvasPixels = exportedContext.getImageData(entry.cell.x, entry.cell.y, cell.width, cell.height).data;
        const expectedPixels = context.getImageData(0, 0, cell.width, cell.height).data;

        const noBounds = () => ({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, count: 0 });
        const include = (bounds: ReturnType<typeof noBounds>, x: number, y: number) => {
          bounds.count += 1;
          bounds.left = Math.min(bounds.left, x);
          bounds.top = Math.min(bounds.top, y);
          bounds.right = Math.max(bounds.right, x + 1);
          bounds.bottom = Math.max(bounds.bottom, y + 1);
        };
        // Measured from the layer's top left corner.
        const list = (bounds: ReturnType<typeof noBounds>) =>
          bounds.count === 0
            ? null
            : [bounds.left - boxOffset.x, bounds.top - boxOffset.y, bounds.right - boxOffset.x, bounds.bottom - boxOffset.y];

        const canvasInk = noBounds();
        const expectedInk = noBounds();
        const missing = noBounds();
        const displaced = noBounds();
        let colourOffBy = 0;
        // "Solid" and "none" leave a wide gap, so anti-aliased edge pixels never
        // count as a difference.
        const SOLID = 192;
        const NONE = 64;
        for (let y = 0; y < cell.height; y += 1) {
          for (let x = 0; x < cell.width; x += 1) {
            const alphaAt = (y * cell.width + x) * 4 + 3;
            const onCanvas = canvasPixels[alphaAt];
            const expected = expectedPixels[alphaAt];
            if (onCanvas > 127) include(canvasInk, x, y);
            if (expected > 127) include(expectedInk, x, y);
            if (expected >= SOLID && onCanvas <= NONE) include(missing, x, y);
            if (onCanvas >= SOLID && expected <= NONE) include(displaced, x, y);
            if (onCanvas === 255 && expected === 255) {
              for (let channel = 1; channel <= 3; channel += 1) {
                colourOffBy = Math.max(
                  colourOffBy,
                  Math.abs(canvasPixels[alphaAt - channel] - expectedPixels[alphaAt - channel]),
                );
              }
            }
          }
        }

        return {
          id: entry.id,
          inkPixels: expectedInk.count,
          reach: entry.leaves ? Number(reach[entry.leaves].toFixed(2)) : null,
          missing: missing.count,
          missingAt: JSON.stringify(list(missing)),
          displaced: displaced.count,
          colourOffBy,
          canvasBounds: list(canvasInk),
          expectedBounds: list(expectedInk),
        };
      });
    },
    {
      pngBase64: png.toString('base64'),
      placed: PLACED,
      cell: CELL,
      boxOffset: { x: BOX.dx, y: BOX.dy },
      boxWidth: BOX.width,
      lineHeightFactor: LINE_HEIGHT,
      gradient: GRADIENT,
    },
  );
}

/**
 * Soft assertions throughout, so that one run names every layer that is cut or
 * moved. `pixelForPixel` also compares the ink itself, which only holds while the
 * export shows the text texture one to one.
 */
function expectWholeAndInPlace(reports: CaseReport[], { pixelForPixel }: { pixelForPixel: boolean }) {
  for (const report of reports) {
    const entry = CASES.find((candidate) => candidate.id === report.id)!;
    const bounds =
      `canvas ink ${JSON.stringify(report.canvasBounds)}, expected ${JSON.stringify(report.expectedBounds)} ` +
      `(left, top, right, bottom from the layer's corner)`;

    // The case is only worth anything while its font really does what the case says.
    expect.soft(report.inkPixels, `${report.id}: the expected render has ink`).toBeGreaterThan(100);
    if (entry.leaves) {
      expect
        .soft(report.reach, `${report.id}: ink leaves the advance box on the ${entry.leaves}`)
        .toBeGreaterThan(2);
    }

    if (pixelForPixel) {
      expect
        .soft(report.missing, `${report.id}: ink missing from the canvas at ${report.missingAt}; ${bounds}`)
        .toBe(0);
      expect.soft(report.displaced, `${report.id}: canvas ink where none is expected; ${bounds}`).toBe(0);
    }

    const furthestEdge =
      report.canvasBounds && report.expectedBounds
        ? Math.max(...report.canvasBounds.map((edge, index) => Math.abs(edge - report.expectedBounds![index])))
        : Infinity;
    expect.soft(furthestEdge, `${report.id}: an ink edge is off by more than a pixel; ${bounds}`).toBeLessThanOrEqual(1);

    // A gradient that moved with the texture instead of staying under the text is off by far more.
    expect.soft(report.colourOffBy, `${report.id}: the fill colour is off`).toBeLessThanOrEqual(8);
  }
}

test.describe('text rendering on the canvas', () => {
  test('geometry: shows the whole glyph where its ink leaves the advance box', async ({ page }) => {
    await openFreshEditor(page);
    await waitForStartupAndFonts(page);
    await uploadProject(page, buildDocument(), 'text-ink.json');

    // The canvas fits the window below 100%, where text is rasterised at its own size.
    expect((await readStageDebug(page)).viewport.zoom).toBeLessThanOrEqual(1);

    expectWholeAndInPlace(await compareCanvasWithRoomyRender(page), { pixelForPixel: true });
  });

  test('geometry: keeps the whole glyph in place when zoomed in', async ({ page }) => {
    await openFreshEditor(page);
    await waitForStartupAndFonts(page);
    await uploadProject(page, buildDocument(), 'text-ink.json');

    // Past 100% the text is rasterised at the zoom level: a new texture at a
    // fractional scale.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { zoom } = (await readStageDebug(page)).viewport;
      if (zoom >= 1.5) break;
      await wheelAt(page, { x: CANVAS.width / 2, y: CANVAS.height / 2 }, -240);
      await expect.poll(async () => (await readStageDebug(page)).viewport.zoom).toBeGreaterThan(zoom);
    }
    expect((await readStageDebug(page)).viewport.zoom).toBeGreaterThanOrEqual(1.5);

    // The export scales that texture back down, which moves anti-aliased edges
    // and hairlines by a fraction of a pixel: compare where the ink ends, not
    // every pixel of it.
    expectWholeAndInPlace(await compareCanvasWithRoomyRender(page), { pixelForPixel: false });
  });
});
