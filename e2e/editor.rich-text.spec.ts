import fs from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clickItem,
  clickToolbarPopoverItem,
  createProjectDocument,
  createTextFixture,
  dragHandle,
  openFreshEditor,
  readRenderSnapshot,
  uploadProject,
  waitForBundledFonts,
} from './support/editor';

/**
 * Rich text: tags in the text of a text layer, on the canvas and in the SVG export.
 *
 * Every layer here has a row of the canvas to itself and is made of capital
 * "H"s, whose ink is flat at the top, stands on the baseline and is solid, so
 * the colour of a pixel says which fill reached it. Export > PNG is the canvas
 * as Pixi drew it, so the checks read that.
 */

const ROW_HEIGHT = 240;
const BOX = { x: 50, width: 700, height: 200 };
const CANVAS_WIDTH = 800;
const RED = '#ff0000';
const BLUE = '#0000ff';

interface RichCase {
  id: string;
  text: string;
  overrides?: Record<string, unknown>;
}

const CASES: RichCase[] = [
  {
    // The layer's own gradient, left to right across its box, under tags.
    id: 'item gradient',
    text: 'HHH <b>HHH</b> <i>HHH</i>',
    overrides: { gradientEnabled: true, gradientAngle: 90, fill: RED, secondaryFill: BLUE },
  },
  { id: 'tag gradient, left to right', text: 'HH <gradient start=#f00 end=#00f angle=90>HHHH</gradient> HH' },
  { id: 'tag gradient, default angle', text: 'HH <gradient start=#f00 end=#00f>HHH</gradient>' },
  {
    id: 'tag gradient, wrapped',
    text: '<gradient start=#f00 end=#00f angle=90>HHHH HHHH</gradient>',
    overrides: { width: 300 },
  },
  { id: 'bold on the baseline', text: 'HH<b><color=#f00>HH</color></b>HH<i><color=#00f>HH</color></i>' },
  { id: 'literal text', text: '1 < 2 <color=#f00>H</color> <noparse><b></noparse>' },
  {
    // A family with one file: its bold and italic are faked by the browser.
    id: 'faked bold and italic',
    text: 'AV<b><gradient start=#f00 end=#00f angle=90>ATAR</gradient></b> <i><color=#00f>Toy</color></i>',
    overrides: { fontFamily: 'Albertus MT Std' },
  },
  {
    // Emoji the font lacks come from the emoji fallback, inside tagged runs too:
    // a thumbs up in a bold run, and a red heart typed with its emoji selector.
    id: 'emoji in tagged runs',
    text: `HH <b>H${String.fromCodePoint(0x1f44d)}H</b> <color=#f00>${String.fromCodePoint(0x2764, 0xfe0f)}H</color>`,
  },
];

const FONTS = [
  { family: 'Barlow', sourceName: 'Barlow-Bold.ttf', kind: 'bundled' },
  { family: 'Albertus MT Std', sourceName: 'Albertus MT Std Regular.otf', kind: 'bundled' },
];

const rowTop = (index: number) => index * ROW_HEIGHT;

function buildDocument() {
  return {
    ...createProjectDocument(
      CASES.map((entry, index) =>
        createTextFixture({
          id: `rich-${index}`,
          name: entry.id,
          zIndex: index + 1,
          text: entry.text,
          fontFamily: 'Barlow',
          fontSize: 80,
          lineHeight: 1.1,
          x: BOX.x,
          y: rowTop(index) + 10,
          width: BOX.width,
          height: BOX.height,
          ...entry.overrides,
        }),
      ),
    ),
    canvas: { width: CANVAS_WIDTH, height: CASES.length * ROW_HEIGHT },
    fonts: FONTS,
  };
}

/** Bounds and edge colours of the solid ink of one kind in a row of the export. */
interface Ink {
  count: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Mean [r, g, b] of the ink in the outermost 3 px on each side. */
  leftColour: number[];
  rightColour: number[];
  topColour: number[];
  bottomColour: number[];
  /** Largest distance in a colour channel from a red-to-blue gradient across `gradientSpan`. */
  offGradientBy: number;
}

test.describe('rich text on the canvas', () => {
  test('draws tagged runs with their own weight, colour and gradient', async ({ page }, testInfo) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(page, buildDocument(), 'rich-text.json');

    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await download.path());
    await fs.writeFile(testInfo.outputPath('rich-text.png'), png);
    if (process.env.RICH_TEXT_PNG) await fs.writeFile(process.env.RICH_TEXT_PNG, png);

    const inks = await page.evaluate(
      async ({ pngBase64, rows, rowHeight, width, box }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${pngBase64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const scale = image.naturalWidth / width;

        type Kind = 'white' | 'coloured';
        const measure = (row: number, kind: Kind, fromY = 0, toY = rowHeight) => {
          const top = Math.round((row * rowHeight + fromY) * scale);
          const height = Math.round((toY - fromY) * scale);
          const { data } = context.getImageData(0, top, canvas.width, height);
          const pixels: { x: number; y: number; rgb: number[] }[] = [];
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              const at = (y * canvas.width + x) * 4;
              if (data[at + 3] < 250) continue;
              const rgb = [data[at], data[at + 1], data[at + 2]];
              const white = rgb.every((channel) => channel > 235);
              if ((kind === 'white') === white) pixels.push({ x: x / scale, y: y / scale + fromY, rgb });
            }
          }
          if (pixels.length === 0) return null;
          const bounds = {
            left: Math.min(...pixels.map((p) => p.x)),
            right: Math.max(...pixels.map((p) => p.x)),
            top: Math.min(...pixels.map((p) => p.y)),
            bottom: Math.max(...pixels.map((p) => p.y)),
          };
          const mean = (list: typeof pixels) =>
            [0, 1, 2].map((c) => Math.round(list.reduce((sum, p) => sum + p.rgb[c], 0) / list.length));
          // Against red to blue from the left of the layer's box to its right.
          let offGradientBy = 0;
          for (const p of pixels) {
            const t = Math.min(1, Math.max(0, (p.x - box.x) / box.width));
            offGradientBy = Math.max(
              offGradientBy,
              Math.abs(p.rgb[0] - 255 * (1 - t)),
              Math.abs(p.rgb[1]),
              Math.abs(p.rgb[2] - 255 * t),
            );
          }
          return {
            count: pixels.length,
            ...bounds,
            leftColour: mean(pixels.filter((p) => p.x <= bounds.left + 3)),
            rightColour: mean(pixels.filter((p) => p.x >= bounds.right - 3)),
            topColour: mean(pixels.filter((p) => p.y <= bounds.top + 3)),
            bottomColour: mean(pixels.filter((p) => p.y >= bounds.bottom - 3)),
            offGradientBy,
          };
        };

        // The wrapped case: where its first line ends, from a row with no ink.
        const wrapped = measure(3, 'coloured');
        const gapY = wrapped ? (wrapped.top + wrapped.bottom) / 2 : rowHeight / 2;

        return {
          itemGradient: measure(0, 'coloured'),
          itemGradientWhite: measure(0, 'white'),
          tagGradient: measure(1, 'coloured'),
          tagGradientWhite: measure(1, 'white'),
          defaultAngle: measure(2, 'coloured'),
          defaultAngleWhite: measure(2, 'white'),
          wrappedFirst: measure(3, 'coloured', 0, gapY),
          wrappedSecond: measure(3, 'coloured', gapY, rowHeight),
          baselineWhite: measure(4, 'white'),
          baselineColoured: measure(4, 'coloured'),
          literalWhite: measure(5, 'white'),
          literalColoured: measure(5, 'coloured'),
          rows,
        };
      },
      {
        pngBase64: png.toString('base64'),
        rows: CASES.length,
        rowHeight: ROW_HEIGHT,
        width: CANVAS_WIDTH,
        box: BOX,
      },
    );
    const ink = inks as unknown as Record<string, Ink | null>;

    const isRed = (colour: number[]) => colour[0] > 215 && colour[1] < 40 && colour[2] < 40;
    const isBlue = (colour: number[]) => colour[0] < 40 && colour[1] < 40 && colour[2] > 215;

    // The layer's gradient runs across the layer's box whatever the runs: every
    // pixel of ink has the colour the gradient has at its x.
    expect.soft(ink.itemGradientWhite, 'item gradient: no ink is left unfilled').toBeNull();
    expect.soft(ink.itemGradient?.offGradientBy, 'item gradient: off the gradient').toBeLessThanOrEqual(12);
    expect.soft(ink.itemGradient!.right - ink.itemGradient!.left, 'item gradient: all three runs drawn').toBeGreaterThan(400);

    // A tagged gradient runs from one end of its run to the other.
    expect.soft(isRed(ink.tagGradient!.leftColour), `tag gradient starts red: ${ink.tagGradient!.leftColour}`).toBe(true);
    expect.soft(isBlue(ink.tagGradient!.rightColour), `tag gradient ends blue: ${ink.tagGradient!.rightColour}`).toBe(true);
    expect.soft(ink.tagGradientWhite!.left, 'plain text before the gradient').toBeLessThan(ink.tagGradient!.left);
    expect.soft(ink.tagGradientWhite!.right, 'plain text after the gradient').toBeGreaterThan(ink.tagGradient!.right);

    // Angle 0 by default, top to bottom of the run's line box (88 px, starting
    // 10 px into the row): the capitals show the part of the gradient they are in.
    for (const [edge, y, colour] of [
      ['top', ink.defaultAngle!.top + 1.5, ink.defaultAngle!.topColour],
      ['bottom', ink.defaultAngle!.bottom - 1.5, ink.defaultAngle!.bottomColour],
    ] as const) {
      const t = (y - 10) / 88;
      const offBy = Math.max(Math.abs(colour[0] - 255 * (1 - t)), colour[1], Math.abs(colour[2] - 255 * t));
      expect.soft(offBy, `default angle: colour at the ${edge} of the capitals is ${colour}`).toBeLessThanOrEqual(12);
    }
    expect.soft(ink.defaultAngle!.topColour[0], 'default angle runs downwards').toBeGreaterThan(ink.defaultAngle!.bottomColour[0] + 100);

    // On every line a wrapped run is on, the gradient starts over.
    for (const line of [ink.wrappedFirst!, ink.wrappedSecond!]) {
      expect.soft(isRed(line.leftColour), `wrapped line starts red: ${line.leftColour}`).toBe(true);
      expect.soft(isBlue(line.rightColour), `wrapped line ends blue: ${line.rightColour}`).toBe(true);
    }
    // 80 px at line height 1.1; the ink edge is read to the nearest device pixel.
    expect
      .soft(Math.abs(ink.wrappedSecond!.top - ink.wrappedFirst!.top - 88), 'second line one line height down')
      .toBeLessThanOrEqual(1);

    // Bold and italic stand on the baseline of the regular text around them.
    expect.soft(Math.abs(ink.baselineColoured!.bottom - ink.baselineWhite!.bottom), 'baselines apart').toBeLessThanOrEqual(1);

    // A "<" that starts no tag, and the contents of noparse, are drawn as text.
    expect.soft(ink.literalColoured, 'the coloured H').not.toBeNull();
    expect.soft(ink.literalWhite!.left, 'text before the coloured H').toBeLessThan(ink.literalColoured!.left - 100);
    expect.soft(ink.literalWhite!.right, 'the noparse text after it').toBeGreaterThan(ink.literalColoured!.right + 80);
  });

  // Each fragment is a Pixi text of its own. Were its shadow drawn with it, a
  // shadow thrown leftwards would land on top of the fragment before it. Two
  // layers with the same text, one with such a shadow: wherever the one without
  // has ink, the one with must show the same ink.
  test('keeps the drop shadow of every run under the text of all of them', async ({ page }, testInfo) => {
    const text = 'HH<b>HH</b><color=#f00>HH</color><i>HH</i>';
    const layer = (id: string, row: number, shadow?: object) =>
      createTextFixture({
        id,
        name: id,
        zIndex: row + 1,
        text,
        fontFamily: 'Barlow',
        fontSize: 80,
        x: BOX.x,
        y: rowTop(row) + 40,
        width: BOX.width,
        height: BOX.height - 40,
        ...(shadow ? { shadow } : {}),
      });
    const shadow = { color: '#00ff00', blur: 4, offsetX: -24, offsetY: -8, opacity: 1 };

    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(
      page,
      {
        ...createProjectDocument([layer('with-shadow', 0, shadow), layer('without-shadow', 1)]),
        canvas: { width: CANVAS_WIDTH, height: 2 * ROW_HEIGHT },
      },
      'rich-text-shadow.json',
    );
    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await download.path());
    await fs.writeFile(testInfo.outputPath('rich-text-shadow.png'), png);

    const report = await page.evaluate(
      async ({ pngBase64 }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${pngBase64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const half = canvas.height / 2;
        const withShadow = context.getImageData(0, 0, canvas.width, half).data;
        const without = context.getImageData(0, half, canvas.width, half).data;
        let ink = 0;
        let covered = 0;
        let shadowPixels = 0;
        for (let at = 0; at < without.length; at += 4) {
          // The shadow is green; no text is.
          if (withShadow[at + 3] > 200 && withShadow[at + 1] > 200 && withShadow[at] < 60) shadowPixels += 1;
          if (without[at + 3] < 250) continue;
          ink += 1;
          const same = [0, 1, 2].every((c) => Math.abs(withShadow[at + c] - without[at + c]) <= 10);
          if (!same || withShadow[at + 3] < 250) covered += 1;
        }
        return { ink, covered, shadowPixels };
      },
      { pngBase64: png.toString('base64') },
    );

    expect(report.ink, 'ink of the layer without a shadow').toBeGreaterThan(5000);
    expect(report.shadowPixels, 'shadow showing beside the text').toBeGreaterThan(500);
    expect(report.covered, 'ink with a shadow on top of it').toBe(0);
  });

  // The SVG export lays tagged text out with the layout the canvas draws from.
  // Both pictures of the same document, pixel by pixel: the same ink in the same
  // place, in the same colour.
  test('exports tagged text to SVG as the canvas shows it', async ({ page }, testInfo) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(page, buildDocument(), 'rich-text.json');

    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await pngDownload.path());
    const svgDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    const svg = await fs.readFile(await svgDownload.path(), 'utf8');
    await fs.writeFile(testInfo.outputPath('rich-text.svg'), svg);
    if (process.env.RICH_TEXT_SVG) await fs.writeFile(process.env.RICH_TEXT_SVG, svg);
    expect(svg).not.toContain('NaN');

    const rows = await page.evaluate(
      async ({ svg, pngBase64, rowCount }) => {
        const load = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        };
        const canvasImage = await load(`data:image/png;base64,${pngBase64}`);
        const exportedImage = await load(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
        const width = canvasImage.naturalWidth;
        const height = canvasImage.naturalHeight;
        const pixelsOf = (image: HTMLImageElement) => {
          const surface = document.createElement('canvas');
          surface.width = width;
          surface.height = height;
          const context = surface.getContext('2d', { willReadFrequently: true })!;
          context.drawImage(image, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        };
        const onCanvas = pixelsOf(canvasImage);
        const exported = pixelsOf(exportedImage);
        const inkAt = (data: Uint8ClampedArray, x: number, y: number) => data[(y * width + x) * 4 + 3] > 127;
        const REACH = 2;
        const near = (data: Uint8ClampedArray, x: number, y: number) => {
          for (let dy = -REACH; dy <= REACH; dy += 1) {
            for (let dx = -REACH; dx <= REACH; dx += 1) {
              const column = x + dx;
              const row = y + dy;
              if (column >= 0 && column < width && row >= 0 && row < height && inkAt(data, column, row)) return true;
            }
          }
          return false;
        };
        const rowHeight = height / rowCount;
        return Array.from({ length: rowCount }, (_, row) => {
          const result = { canvasInk: 0, exportedInk: 0, stray: 0, compared: 0, colourOffBy: 0 };
          for (let y = Math.round(row * rowHeight); y < Math.round((row + 1) * rowHeight); y += 1) {
            for (let x = 0; x < width; x += 1) {
              const a = inkAt(onCanvas, x, y);
              const b = inkAt(exported, x, y);
              if (a) result.canvasInk += 1;
              if (b) result.exportedInk += 1;
              if (a && !near(exported, x, y)) result.stray += 1;
              if (b && !near(onCanvas, x, y)) result.stray += 1;
              const at = (y * width + x) * 4;
              if (onCanvas[at + 3] >= 250 && exported[at + 3] >= 250) {
                result.compared += 1;
                for (let c = 0; c < 3; c += 1) {
                  result.colourOffBy = Math.max(result.colourOffBy, Math.abs(onCanvas[at + c] - exported[at + c]));
                }
              }
            }
          }
          return result;
        });
      },
      { svg, pngBase64: png.toString('base64'), rowCount: CASES.length },
    );

    rows.forEach((row, index) => {
      const id = CASES[index].id;
      expect.soft(row.canvasInk, `${id}: ink on the canvas`).toBeGreaterThan(2000);
      expect.soft(row.compared, `${id}: ink in both pictures`).toBeGreaterThan(row.canvasInk * 0.7);
      expect.soft(row.stray, `${id}: ink in one picture with none near it in the other`).toBe(0);
      expect.soft(row.colourOffBy, `${id}: colour differs between the pictures`).toBeLessThanOrEqual(16);
    });
  });

  // Tags that change no widths (a colour) must leave a text where it is and as
  // tall as it is: the same words with and without them, side by side.
  const WORDS = 'HHHH HH HHHHHH HHH HHHHH HH';
  const COLOURED = '<color=#ffffff>HHHH</color> HH <color=#ffffff>HHHHHH HHH</color> HHHHH <color=#ffffff>HH</color>';

  test('gives tagged text the height the same text has without tags when it is resized', async ({ page }) => {
    const layer = (id: string, text: string, y: number) =>
      createTextFixture({ id, name: id, text, fontFamily: 'Barlow', fontSize: 40, x: 60, y, width: 640, height: 50 });

    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(
      page,
      {
        ...createProjectDocument([layer('plain', WORDS, 40), { ...layer('tagged', COLOURED, 420), zIndex: 2 }]),
        canvas: { width: CANVAS_WIDTH, height: 800 },
      },
      'rich-text-height.json',
    );

    // Narrowing a text box makes it as tall as its wrapped lines need.
    const resized: Record<string, { width: number; height: number }> = {};
    for (const id of ['plain', 'tagged']) {
      await clickItem(page, id);
      await dragHandle(page, id, 'middle-right', -420, 0);
      const { geometry } = (await readRenderSnapshot(page)).selectedItems[0];
      resized[id] = { width: Math.round(geometry.width), height: geometry.height };
    }

    expect(resized.plain.width, 'both boxes were narrowed alike').toBe(resized.tagged.width);
    expect(resized.plain.height, 'the plain text wrapped onto several lines').toBeGreaterThan(3 * 44);
    expect(resized.tagged.height).toBe(resized.plain.height);
  });

  test('aligns centred and right-aligned tagged lines where the same text sits without tags', async ({ page }, testInfo) => {
    const rows = [
      { align: 'center', text: WORDS },
      { align: 'center', text: COLOURED },
      { align: 'right', text: WORDS },
      { align: 'right', text: COLOURED },
    ];
    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(
      page,
      {
        ...createProjectDocument(
          rows.map((row, index) =>
            createTextFixture({
              id: `aligned-${index}`,
              name: `aligned-${index}`,
              zIndex: index + 1,
              text: row.text,
              align: row.align,
              fontFamily: 'Barlow',
              fontSize: 40,
              x: BOX.x,
              y: rowTop(index) + 10,
              width: 330,
              height: ROW_HEIGHT - 20,
            }),
          ),
        ),
        canvas: { width: CANVAS_WIDTH, height: rows.length * ROW_HEIGHT },
      },
      'rich-text-align.json',
    );
    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await download.path());
    await fs.writeFile(testInfo.outputPath('rich-text-align.png'), png);

    // Per row, the left and right ends of the ink on every pixel row that has any.
    const ends = await page.evaluate(
      async ({ pngBase64, rowCount, width }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${pngBase64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const scale = canvas.width / width;
        const rowHeight = canvas.height / rowCount;
        return Array.from({ length: rowCount }, (_, row) => {
          const { data } = context.getImageData(0, Math.round(row * rowHeight), canvas.width, Math.round(rowHeight));
          const lines: Array<[number, number] | null> = [];
          for (let y = 0; y < Math.round(rowHeight); y += 1) {
            let left = -1;
            let right = -1;
            for (let x = 0; x < canvas.width; x += 1) {
              if (data[(y * canvas.width + x) * 4 + 3] > 127) {
                if (left < 0) left = x;
                right = x;
              }
            }
            lines.push(left < 0 ? null : [left / scale, right / scale]);
          }
          return lines;
        });
      },
      { pngBase64: png.toString('base64'), rowCount: rows.length, width: CANVAS_WIDTH },
    );

    for (const [plain, tagged] of [
      [0, 1],
      [2, 3],
    ]) {
      const align = rows[plain].align;
      let inkRows = 0;
      let furthest = 0;
      ends[plain].forEach((plainEnds, y) => {
        const taggedEnds = ends[tagged][y];
        if (!plainEnds && !taggedEnds) return;
        inkRows += 1;
        // Ink on a pixel row of one picture only is a line break in another place.
        if (!plainEnds || !taggedEnds) {
          furthest = Infinity;
          return;
        }
        furthest = Math.max(furthest, Math.abs(plainEnds[0] - taggedEnds[0]), Math.abs(plainEnds[1] - taggedEnds[1]));
      });
      // Two lines of capitals at least.
      expect.soft(inkRows, `${align}: pixel rows with ink`).toBeGreaterThan(40);
      expect.soft(furthest, `${align}: furthest a line end is from where it is without tags, in px`).toBeLessThanOrEqual(2);
    }
  });
});
