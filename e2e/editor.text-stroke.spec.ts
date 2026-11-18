import fs from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import {
  captureDownload,
  clickToolbarPopoverItem,
  createProjectDocument,
  createTextFixture,
  openFreshEditor,
  uploadProject,
  waitForBundledFonts,
} from './support/editor';

/**
 * A text layer's outline is a stroke centred on the edge of its glyphs and drawn
 * under their fill. The canvas draws it as a text of its own, moved onto the
 * glyphs of the fill, and casts the drop shadow from a third.
 *
 * Every check compares two exports of the same layers, one without outlines and
 * one with: Export > PNG is the canvas as Pixi drew it. The outline must leave
 * the fill exactly as it was, reach half its width past the ink on every side
 * without being cut off, and stay under the fill of every line and fragment.
 */

const FILL = '#ffffff';
const STROKE = '#ff0000';
const SHADOW = '#0000ff';
// Longer than half the height of the glyphs: more than an SVG filter has room
// for unless the export measures its region from the text's ink.
const SHADOW_OFFSET = 30;

interface StrokeCase {
  id: string;
  text: string;
  strokeWidth: number;
  stroke?: string;
  shadow?: boolean;
  overrides?: Record<string, unknown>;
}

const CASES: StrokeCase[] = [
  { id: 'one line', text: 'HO', strokeWidth: 12 },
  // Lines so close that the stroke of the second reaches into the first.
  { id: 'close lines', text: 'HH\nHH', strokeWidth: 16, overrides: { lineHeight: 0.8 } },
  // Letters so close that each stroke reaches into its neighbours.
  { id: 'tight letters', text: 'HIH', strokeWidth: 16, overrides: { letterSpacing: -6 } },
  // The lean of the last glyph leaves the texture on the right, and its stroke with it.
  {
    id: 'italic, right aligned',
    text: 'HH',
    strokeWidth: 12,
    overrides: { fontStyle: 'italic', align: 'right' },
  },
  { id: 'bottom aligned', text: 'HQ', strokeWidth: 20, overrides: { verticalAlign: 'bottom' } },
  // One Pixi text per fragment: the stroke of each must stay under its neighbours' fill.
  { id: 'tags', text: 'H<b>H</b><color=#00ff00>H</color>', strokeWidth: 16, overrides: { letterSpacing: -4 } },
  // A see-through shadow must be as dark under the stroke as under the fill.
  { id: 'shadow', text: 'HO', strokeWidth: 12, shadow: true },
  { id: 'tags and shadow', text: 'H<b>O</b>', strokeWidth: 12, shadow: true },
  // This family has no bold file: the browser fakes it by growing the glyphs,
  // and the outline goes around the grown glyphs.
  { id: 'faked bold', text: 'HO', strokeWidth: 12, overrides: { fontFamily: 'Albertus MT Std', fontWeight: 'bold' } },
  // A see-through stroke must be no darker where the strokes of two letters overlap.
  { id: 'see-through stroke', text: 'HIH', strokeWidth: 20, stroke: '#ff000080', overrides: { letterSpacing: -8 } },
  // An outline wider than the glyphs are tall, and its shadow: neither is cut
  // off, on the canvas or in the SVG.
  { id: 'wide stroke and shadow', text: 'HO', strokeWidth: 60, shadow: true },
];

const COLUMNS = 3;
const CELL = { width: 440, height: 320 };
const BOX = { dx: 100, dy: 90, width: 240, height: 140 };

const PLACED = CASES.map((entry, index) => ({
  ...entry,
  cell: { x: (index % COLUMNS) * CELL.width, y: Math.floor(index / COLUMNS) * CELL.height },
}));

const CANVAS = { width: COLUMNS * CELL.width, height: Math.ceil(CASES.length / COLUMNS) * CELL.height };

function buildDocument(withStroke: boolean) {
  return {
    ...createProjectDocument(
      PLACED.map((entry, index) =>
        createTextFixture({
          id: `stroke-case-${index}`,
          name: entry.id,
          zIndex: index + 1,
          text: entry.text,
          // A family with files for bold and italic, so that neither is faked.
          fontFamily: 'Barlow',
          fontSize: 70,
          fill: FILL,
          x: entry.cell.x + BOX.dx,
          y: entry.cell.y + BOX.dy,
          width: BOX.width,
          height: BOX.height,
          stroke: entry.stroke ?? STROKE,
          strokeWidth: withStroke ? entry.strokeWidth : 0,
          ...(entry.shadow
            ? {
                shadow: { color: SHADOW, blur: 0, offsetX: SHADOW_OFFSET, offsetY: SHADOW_OFFSET, opacity: 0.5 },
              }
            : {}),
          ...entry.overrides,
        }),
      ),
    ),
    canvas: CANVAS,
  };
}

async function exportPng(page: Page, withStroke: boolean, name: string): Promise<string> {
  await uploadProject(page, buildDocument(withStroke));
  const download = await captureDownload(page, async () => {
    await clickToolbarPopoverItem(page, 'Export', 'PNG');
  });
  const png = await fs.readFile(await download.path());
  // Kept with the test's output: what to look at when a check fails.
  await fs.writeFile(test.info().outputPath(name), png);
  return png.toString('base64');
}

interface CaseReport {
  id: string;
  /** Solid fill pixels without the outline. */
  fillPixels: number;
  /** Of those, how many the outline changed, and where the first few are. */
  fillChanged: number;
  fillChangedAt: string;
  /** How much further the ink reaches with the outline: left, top, right, bottom, in px. */
  growth: number[] | null;
  /** The most opaque pixel in the outline's colour, and in the shadow's. */
  strokeAlpha: number;
  shadowAlpha: number;
  /** How much further than the ink the shadow reaches to the right and downwards, in px. */
  shadowReach: number[] | null;
}

async function compareExports(page: Page, plainBase64: string, strokedBase64: string): Promise<CaseReport[]> {
  return page.evaluate(
    async ({ plainBase64, strokedBase64, placed, cell }) => {
      const pixelsOf = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        return context;
      };
      const plain = await pixelsOf(plainBase64);
      const stroked = await pixelsOf(strokedBase64);

      type Bounds = { left: number; top: number; right: number; bottom: number } | null;
      const include = (bounds: Bounds, x: number, y: number): Bounds =>
        bounds
          ? {
              left: Math.min(bounds.left, x),
              top: Math.min(bounds.top, y),
              right: Math.max(bounds.right, x),
              bottom: Math.max(bounds.bottom, y),
            }
          : { left: x, top: y, right: x, bottom: y };

      // The shadow is the only blue there is.
      const isShadow = (r: number, g: number, b: number) => b > r + 60 && b > g + 60;

      return placed.map((entry) => {
        const before = plain.getImageData(entry.cell.x, entry.cell.y, cell.width, cell.height).data;
        const after = stroked.getImageData(entry.cell.x, entry.cell.y, cell.width, cell.height).data;

        let fillPixels = 0;
        let fillChanged = 0;
        const fillChangedAt: string[] = [];
        let inkBefore: Bounds = null;
        let inkAfter: Bounds = null;
        let shadowAfter: Bounds = null;
        let strokeAlpha = 0;
        let shadowAlpha = 0;

        for (let y = 0; y < cell.height; y += 1) {
          for (let x = 0; x < cell.width; x += 1) {
            const at = (y * cell.width + x) * 4;
            const [r0, g0, b0, a0] = [before[at], before[at + 1], before[at + 2], before[at + 3]];
            const [r1, g1, b1, a1] = [after[at], after[at + 1], after[at + 2], after[at + 3]];
            const shadowBefore = isShadow(r0, g0, b0);
            const shadowNow = isShadow(r1, g1, b1);

            // Half of full coverage for an opaque paint, and for one at half opacity too.
            if (a0 >= 64 && !shadowBefore) inkBefore = include(inkBefore, x, y);
            if (a1 >= 64 && !shadowNow) inkAfter = include(inkAfter, x, y);
            if (a1 >= 64 && shadowNow) shadowAfter = include(shadowAfter, x, y);
            // Opacity is read where a paint shows alone: at an edge the paint
            // above or below is mixed in, which shifts the colour.
            if (a1 > 0 && r1 < 6 && g1 < 6 && b1 > 249) shadowAlpha = Math.max(shadowAlpha, a1);
            if (a1 > 0 && r1 > 249 && g1 < 6 && b1 < 6) strokeAlpha = Math.max(strokeAlpha, a1);

            if (a0 === 255 && !shadowBefore) {
              fillPixels += 1;
              const off = Math.max(Math.abs(r1 - r0), Math.abs(g1 - g0), Math.abs(b1 - b0), Math.abs(a1 - a0));
              if (off > 8) {
                fillChanged += 1;
                if (fillChangedAt.length < 5) fillChangedAt.push(`${x},${y}: ${[r1, g1, b1, a1].join(' ')}`);
              }
            }
          }
        }

        return {
          id: entry.id,
          fillPixels,
          fillChanged,
          fillChangedAt: fillChangedAt.join('; '),
          growth:
            inkBefore && inkAfter
              ? [
                  inkBefore.left - inkAfter.left,
                  inkBefore.top - inkAfter.top,
                  inkAfter.right - inkBefore.right,
                  inkAfter.bottom - inkBefore.bottom,
                ]
              : null,
          strokeAlpha,
          shadowAlpha,
          shadowReach:
            shadowAfter && inkAfter
              ? [shadowAfter.right - inkAfter.right, shadowAfter.bottom - inkAfter.bottom]
              : null,
        };
      });
    },
    { plainBase64, strokedBase64, placed: PLACED, cell: CELL },
  );
}

interface SvgReport {
  id: string;
  /** How far each edge of the SVG's ink is from the canvas's: left, top, right, bottom, in px. */
  edgesOffBy: number[] | null;
  /** Pixels solid in one and empty in the other. */
  disagree: number;
  /** Solid pixels whose colour differs by more than a rounding step. */
  colourOff: number;
}

/** Compare the SVG export, drawn by the browser, with the PNG export of the same layers. */
async function compareSvgWithCanvas(page: Page, svg: string, pngBase64: string): Promise<SvgReport[]> {
  return page.evaluate(
    async ({ svg, pngBase64, placed, cell }) => {
      const pixelsOf = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        return context;
      };
      const fromSvg = await pixelsOf(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      const fromCanvas = await pixelsOf(`data:image/png;base64,${pngBase64}`);

      return placed.map((entry) => {
        const a = fromSvg.getImageData(entry.cell.x, entry.cell.y, cell.width, cell.height).data;
        const b = fromCanvas.getImageData(entry.cell.x, entry.cell.y, cell.width, cell.height).data;
        const bounds = (data: Uint8ClampedArray) => {
          let box: number[] | null = null;
          for (let y = 0; y < cell.height; y += 1) {
            for (let x = 0; x < cell.width; x += 1) {
              if (data[(y * cell.width + x) * 4 + 3] < 64) continue;
              box = box
                ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
                : [x, y, x, y];
            }
          }
          return box;
        };
        const svgBox = bounds(a);
        const canvasBox = bounds(b);
        let disagree = 0;
        let colourOff = 0;
        for (let at = 0; at < a.length; at += 4) {
          if ((a[at + 3] >= 250 && b[at + 3] <= 5) || (b[at + 3] >= 250 && a[at + 3] <= 5)) disagree += 1;
          // Compared where a paint shows alone in both: along an edge between
          // two paints each renderer mixes them a little differently.
          const pure = (data: Uint8ClampedArray) =>
            data[at + 3] === 255 && [0, 1, 2].every((c) => data[at + c] < 6 || data[at + c] > 249);
          if (pure(a) && pure(b)) {
            const off = Math.max(
              Math.abs(a[at] - b[at]),
              Math.abs(a[at + 1] - b[at + 1]),
              Math.abs(a[at + 2] - b[at + 2]),
            );
            if (off > 8) colourOff += 1;
          }
        }
        return {
          id: entry.id,
          edgesOffBy: svgBox && canvasBox ? svgBox.map((edge, index) => Math.abs(edge - canvasBox[index])) : null,
          disagree,
          colourOff,
        };
      });
    },
    { svg, pngBase64, placed: PLACED, cell: CELL },
  );
}

test.describe('text outline on the canvas', () => {
  test('goes around the ink, under the fill, and into the shadow', async ({ page }) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);

    const plain = await exportPng(page, false, 'plain.png');
    const stroked = await exportPng(page, true, 'stroked.png');
    const reports = await compareExports(page, plain, stroked);

    for (const report of reports) {
      const entry = CASES.find((candidate) => candidate.id === report.id)!;
      const half = entry.strokeWidth / 2;

      expect.soft(report.fillPixels, `${report.id}: the layer has fill to compare`).toBeGreaterThan(500);
      expect
        .soft(report.fillChanged, `${report.id}: the outline changed the fill at ${report.fillChangedAt}`)
        .toBe(0);

      // Half the stroke on every side: none of it cut off, and the glyphs not moved.
      expect.soft(report.growth, `${report.id}: the ink has bounds`).not.toBeNull();
      for (const [index, side] of ['left', 'top', 'right', 'bottom'].entries()) {
        const grown = report.growth?.[index] ?? NaN;
        expect
          .soft(Math.abs(grown - half), `${report.id}: the ink grew by ${grown} px on the ${side}, not by ${half}`)
          .toBeLessThanOrEqual(1);
      }

      const strokeOpacity = entry.stroke === '#ff000080' ? 128 : 255;
      expect.soft(report.strokeAlpha, `${report.id}: the outline shows`).toBeGreaterThanOrEqual(strokeOpacity - 4);
      expect
        .soft(report.strokeAlpha, `${report.id}: the outline is darker where strokes overlap`)
        .toBeLessThanOrEqual(strokeOpacity + 4);

      if (entry.shadow) {
        expect.soft(report.shadowAlpha, `${report.id}: the shadow shows`).toBeGreaterThanOrEqual(124);
        expect
          .soft(report.shadowAlpha, `${report.id}: the shadow is darker where stroke and fill overlap`)
          .toBeLessThanOrEqual(132);
        // Cast from the stroke too: as far past the outlined ink as its offset.
        for (const reach of report.shadowReach ?? [NaN, NaN]) {
          expect
            .soft(Math.abs(reach - SHADOW_OFFSET), `${report.id}: the shadow reaches ${reach} px past the ink`)
            .toBeLessThanOrEqual(1);
        }
      }
    }

    // The SVG export draws the same outline from the glyphs' own contours.
    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    const svg = await fs.readFile(await download.path(), 'utf8');
    await fs.writeFile(test.info().outputPath('stroked.svg'), svg);
    for (const report of await compareSvgWithCanvas(page, svg, stroked)) {
      expect.soft(report.edgesOffBy, `${report.id}: the SVG has ink`).not.toBeNull();
      expect
        .soft(Math.max(...(report.edgesOffBy ?? [NaN])), `${report.id}: SVG ink edges off by ${report.edgesOffBy} px`)
        .toBeLessThanOrEqual(1);
      // The canvas draws the outline around the glyphs as the browser filled
      // them: grid-fitted, and a fragment on whole texels. The SVG has the
      // contours where the layout puts them. A row of an edge can fall either way.
      expect
        .soft(report.disagree, `${report.id}: pixels inked in only one of SVG and canvas`)
        .toBeLessThanOrEqual(40);
      // The canvas places a fragment on whole texels, the SVG where the layout
      // has it: a sliver between two paints can fall either way.
      expect.soft(report.colourOff, `${report.id}: pixels painted another colour in the SVG`).toBeLessThanOrEqual(40);
    }
  });
});

/**
 * Text with tags is one Pixi text per fragment, and casts one shadow all the
 * same: a see-through shadow is no darker where the shadows of two fragments
 * meet, whether they overlap or blur into each other.
 */
const FLAT_SHADOW_CASES = [
  // Letters so close that the glyphs of neighbouring fragments overlap, and their shadows with them.
  { id: 'overlapping fragments', text: 'H<b>H</b>H', blur: 0, overrides: { letterSpacing: -12 } },
  // The same, blurred: each fragment's shadow fades out under its neighbours'.
  { id: 'blurred', text: 'H<b>H</b>H', blur: 4, overrides: { letterSpacing: -12 } },
  // Lines so close that the glyphs of one line reach into the next.
  { id: 'blurred, close lines', text: 'H<b>H</b>\n<i>H</i>H', blur: 4, overrides: { lineHeight: 0.6 } },
];

test.describe('shadow of text with tags', () => {
  test('is one flat shadow where fragments meet', async ({ page }) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);

    await uploadProject(page, {
      ...createProjectDocument(
        FLAT_SHADOW_CASES.map((entry, index) =>
          createTextFixture({
            id: `flat-shadow-${index}`,
            name: entry.id,
            zIndex: index + 1,
            text: entry.text,
            fontFamily: 'Barlow',
            fontSize: 70,
            fill: FILL,
            x: index * CELL.width + BOX.dx,
            y: BOX.dy,
            width: BOX.width,
            height: BOX.height,
            strokeWidth: 0,
            shadow: { color: SHADOW, blur: entry.blur, offsetX: SHADOW_OFFSET, offsetY: SHADOW_OFFSET, opacity: 0.5 },
            ...entry.overrides,
          }),
        ),
      ),
      canvas: { width: FLAT_SHADOW_CASES.length * CELL.width, height: CELL.height },
    });
    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await download.path());
    await fs.writeFile(test.info().outputPath('flat-shadow.png'), png);

    const reports = await page.evaluate(
      async ({ base64, count, cell }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        return Array.from({ length: count }, (_, index) => {
          const data = context.getImageData(index * cell.width, 0, cell.width, cell.height).data;
          // The shadow where it shows alone, in its own colour: its most
          // opaque pixel, and how many pixels of it there are.
          let darkest = 0;
          let shown = 0;
          for (let at = 0; at < data.length; at += 4) {
            if (data[at + 3] === 0 || data[at] > 5 || data[at + 1] > 5 || data[at + 2] < 250) continue;
            darkest = Math.max(darkest, data[at + 3]);
            if (data[at + 3] >= 64) shown += 1;
          }
          return { darkest, shown };
        });
      },
      { base64: png.toString('base64'), count: FLAT_SHADOW_CASES.length, cell: CELL },
    );

    for (const [index, entry] of FLAT_SHADOW_CASES.entries()) {
      const report = reports[index];
      expect.soft(report.shown, `${entry.id}: the shadow shows`).toBeGreaterThan(200);
      // A blurred shadow is a little short of its opacity inside thin stems.
      expect.soft(report.darkest, `${entry.id}: the shadow reaches its opacity`).toBeGreaterThanOrEqual(110);
      expect
        .soft(report.darkest, `${entry.id}: the shadow is darker where the shadows of fragments meet`)
        .toBeLessThanOrEqual(132);
    }
  });
});

/**
 * Where a family has no bold file the browser fakes one, and its own stroke of
 * the faked bold runs along rings inside the glyphs as well. The outline is
 * the edge of the bold shape alone, which a see-through fill shows: across the
 * two stems of an "H" there are four bands of outline and nothing between.
 */
test.describe('outline around the glyphs as they are filled', () => {
  const STROKE_WIDTH = 4;

  test('is one line around the bold shape, on the canvas and in the SVG', async ({ page }) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);

    await uploadProject(page, {
      ...createProjectDocument([
        createTextFixture({
          id: 'faked-bold-outline',
          name: 'faked bold outline',
          zIndex: 1,
          text: 'H',
          // A family with a regular file only, and stems thin enough that the
          // rings of the browser's stroke would fill them.
          fontFamily: 'Poiret One',
          fontWeight: 'bold',
          fontSize: 200,
          fill: '#00000000',
          x: 40,
          y: 40,
          width: 320,
          height: 240,
          stroke: STROKE,
          strokeWidth: STROKE_WIDTH,
        }),
      ]),
      canvas: { width: 400, height: 320 },
    });
    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await pngDownload.path());
    await fs.writeFile(test.info().outputPath('faked-bold.png'), png);
    const svgDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    const svg = await fs.readFile(await svgDownload.path(), 'utf8');
    await fs.writeFile(test.info().outputPath('faked-bold.svg'), svg);

    // The bands of ink along a row a quarter of the way down the glyph, above
    // its crossbar: how wide each is, by the coverage it adds up to.
    const bandsOf = (src: string) =>
      page.evaluate(async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
        let top = -1;
        let bottom = -1;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] < 128) continue;
            if (top < 0) top = y;
            bottom = y;
            break;
          }
        }
        const y = Math.round(top + (bottom - top) / 4);
        const bands: number[] = [];
        let band = 0;
        for (let x = 0; x < width; x += 1) {
          const alpha = data[(y * width + x) * 4 + 3] / 255;
          if (alpha > 0.02) band += alpha;
          else if (band > 0) {
            bands.push(band);
            band = 0;
          }
        }
        return bands;
      }, src);

    const renderings = {
      canvas: await bandsOf(`data:image/png;base64,${png.toString('base64')}`),
      SVG: await bandsOf(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`),
    };
    for (const [name, bands] of Object.entries(renderings)) {
      expect.soft(bands, `${name}: bands of outline across the two stems: ${bands}`).toHaveLength(4);
      for (const band of bands) {
        expect
          .soft(Math.abs(band - STROKE_WIDTH), `${name}: a band of the outline is ${band} px wide`)
          .toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * Below a certain size the browser grid-fits filled glyphs, and a stroke of
   * its own would not: around this "C" it sat 1.8 px lower than the fill. The
   * outline is drawn around the fill as it is, so as much of it shows above
   * every stem as below.
   */
  test('sits on the glyphs as the browser fills them', async ({ page }) => {
    const WIDTH = 6;
    await openFreshEditor(page);
    await waitForBundledFonts(page);

    await uploadProject(page, {
      ...createProjectDocument([
        createTextFixture({
          id: 'grid-fitted-outline',
          name: 'grid-fitted outline',
          zIndex: 1,
          text: 'C',
          fontFamily: 'Poiret One',
          fontSize: 150,
          fill: FILL,
          x: 40,
          y: 40,
          width: 320,
          height: 240,
          stroke: STROKE,
          strokeWidth: WIDTH,
        }),
      ]),
      canvas: { width: 400, height: 320 },
    });
    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await download.path());
    await fs.writeFile(test.info().outputPath('grid-fitted.png'), png);

    // Down the middle of the glyph, through its top and bottom stems: how much
    // outline shows in each band of it, by the coverage it adds up to.
    const bands = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      let left = width;
      let right = 0;
      for (let at = 0; at < data.length; at += 4) {
        if (data[at + 3] < 128) continue;
        const x = (at / 4) % width;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
      const x = Math.round((left + right) / 2);
      const found: number[] = [];
      let band = 0;
      for (let y = 0; y < height; y += 1) {
        const at = (y * width + x) * 4;
        // Red where the outline shows, white where the fill covers it.
        const outline = (data[at + 3] / 255) * (1 - data[at + 1] / 255);
        if (outline > 0.02) band += outline;
        else if (band > 0) {
          found.push(band);
          band = 0;
        }
      }
      return found;
    }, png.toString('base64'));

    expect(bands, `bands of outline above and below the two stems: ${bands}`).toHaveLength(4);
    for (const band of bands) {
      expect
        .soft(Math.abs(band - WIDTH / 2), `${band} px of the outline shows beside a stem, not ${WIDTH / 2}`)
        .toBeLessThanOrEqual(0.75);
    }
  });
});
