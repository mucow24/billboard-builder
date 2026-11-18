import fs from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import {
  captureDownload,
  clickToolbarPopoverItem,
  createEllipseFixture,
  createImageFixture,
  createLineFixture,
  createNgonFixture,
  createPolygonFixture,
  createProjectDocument,
  createRectangleFixture,
  createTextFixture,
  openFreshEditor,
  uploadProject,
  waitForBundledFonts,
} from './support/editor';

/**
 * The SVG export draws the blur and the drop shadow of a shape, line or image
 * with an SVG filter, and a filter paints nothing outside its region. The
 * region has to hold the item's box, its stroke, and as far as blur and shadow
 * reach: one measured from the bounding box of the geometry alone leaves out a
 * wide stroke and a shadow longer than half the item, and is empty for a
 * horizontal line.
 *
 * The canvas blurs with Pixi's filters, the SVG with Gaussians: the export
 * picks the Gaussians that come closest, so a blurred item and a soft shadow
 * are as wide and as dark in the SVG as on the canvas. The corners of an n-gon
 * are mitred up to the same limit in both.
 *
 * Every case is drawn twice from the same layers, by the canvas (Export > PNG)
 * and by the browser from Export > SVG, and the two are compared.
 */

const SHADOW = '#0000ff';
const hardShadow = (offsetX: number, offsetY: number) => ({
  color: SHADOW,
  blur: 0,
  offsetX,
  offsetY,
  opacity: 1,
});

const COLUMNS = 3;
const CELL = { width: 340, height: 260 };
/** Where an item's box starts inside its cell. */
const AT = { dx: 70, dy: 80 };

type Fixture = Record<string, unknown>;

interface FilterCase {
  id: string;
  /** The item, given the top-left corner of its box. */
  build: (x: number, y: number) => Fixture;
  /**
   * Blurred: compared by how opaque each pixel is, since a blurred edge has no
   * place of its own, and the two blurs are close but not the same.
   */
  soft?: boolean;
}

const CASES: FilterCase[] = [
  // The shadow falls twice the height of the item below it.
  {
    id: 'long shadow',
    build: (x, y) => createRectangleFixture({ x, y, width: 200, height: 20, shadow: hardShadow(0, 40) }),
  },
  // The stroke is three times as wide as the item is tall.
  {
    id: 'wide stroke',
    build: (x, y) =>
      createRectangleFixture({
        x,
        y,
        width: 200,
        height: 10,
        stroke: '#ff0000',
        strokeWidth: 30,
        shadow: hardShadow(25, 25),
      }),
  },
  // The geometry of a horizontal line has no height at all.
  {
    id: 'horizontal line',
    build: (x, y) =>
      createLineFixture({
        startX: x,
        startY: y,
        endX: x + 200,
        endY: y,
        stroke: '#ff0000',
        strokeWidth: 16,
        shadow: hardShadow(20, 30),
      }),
  },
  // Mitred corners reach a whole stroke width past the vertices.
  {
    id: 'triangle',
    build: (x, y) =>
      createNgonFixture({
        x,
        y,
        width: 120,
        height: 100,
        sides: 3,
        stroke: '#ff0000',
        strokeWidth: 20,
        shadow: hardShadow(80, 0),
      }),
  },
  {
    id: 'ellipse',
    build: (x, y) =>
      createEllipseFixture({
        x,
        y,
        width: 200,
        height: 50,
        stroke: '#ff0000',
        strokeWidth: 24,
        shadow: hardShadow(0, 70),
      }),
  },
  {
    id: 'polygon',
    build: (x, y) =>
      createPolygonFixture({
        x,
        y,
        width: 200,
        height: 20,
        vertices: [
          { x, y },
          { x: x + 200, y },
          { x: x + 200, y: y + 20 },
          { x, y: y + 20 },
        ],
        stroke: '#ff0000',
        strokeWidth: 24,
        shadow: hardShadow(-30, 50),
      }),
  },
  {
    id: 'image',
    build: (x, y) => createImageFixture({ x, y, width: 200, height: 24, shadow: hardShadow(0, 50) }),
  },
  // The canvas mitres a corner this pointed; SVG's default limit would bevel it.
  {
    id: 'pointed triangle',
    build: (x, y) =>
      createNgonFixture({
        x,
        y,
        width: 160,
        height: 40,
        sides: 3,
        stroke: '#ff0000',
        strokeWidth: 20,
        shadow: hardShadow(0, 50),
      }),
  },
  // The blur reaches further past the item than half its height.
  {
    id: 'blur',
    soft: true,
    build: (x, y) => createRectangleFixture({ x, y, width: 200, height: 8, fill: '#ff0000', blurRadius: 10 }),
  },
  {
    id: 'wide blur',
    soft: true,
    build: (x, y) => createRectangleFixture({ x, y, width: 160, height: 80, fill: '#ff0000', blurRadius: 12 }),
  },
  {
    id: 'soft shadow',
    soft: true,
    build: (x, y) =>
      createRectangleFixture({
        x,
        y,
        width: 160,
        height: 50,
        fill: '#ff0000',
        shadow: { color: SHADOW, blur: 12, offsetX: 30, offsetY: 50, opacity: 1 },
      }),
  },
  {
    id: 'faint soft shadow',
    soft: true,
    build: (x, y) =>
      createEllipseFixture({
        x,
        y,
        width: 160,
        height: 60,
        fill: '#ff0000',
        shadow: { color: SHADOW, blur: 4, offsetX: -20, offsetY: 40, opacity: 0.5 },
      }),
  },
  // A text's shadow is drawn by the canvas 2D text style, with a blur of its own kind.
  ...[4, 14].map((blur) => ({
    id: `soft text shadow ${blur}`,
    soft: true,
    build: (x: number, y: number) =>
      createTextFixture({
        x,
        y,
        width: 200,
        height: 100,
        text: 'HO',
        fontFamily: 'Barlow',
        fontSize: 70,
        fill: '#ff0000',
        shadow: { color: SHADOW, blur, offsetX: 25, offsetY: 40, opacity: 1 },
      }),
  })),
  {
    id: 'blurred text',
    soft: true,
    build: (x, y) =>
      createTextFixture({ x, y, width: 200, height: 100, text: 'HO', fontFamily: 'Barlow', fontSize: 70, fill: '#ff0000', blurRadius: 5 }),
  },
  // The shadow is cast from the blurred shape.
  {
    id: 'blur and soft shadow',
    soft: true,
    build: (x, y) =>
      createRectangleFixture({
        x,
        y,
        width: 160,
        height: 50,
        fill: '#ff0000',
        blurRadius: 4,
        shadow: { color: SHADOW, blur: 8, offsetX: 30, offsetY: 50, opacity: 1 },
      }),
  },
];

const PLACED = CASES.map((entry, index) => {
  const cell = { x: (index % COLUMNS) * CELL.width, y: Math.floor(index / COLUMNS) * CELL.height };
  return { id: entry.id, cell, item: { ...entry.build(cell.x + AT.dx, cell.y + AT.dy), id: `filter-case-${index}`, zIndex: index } };
});

const CANVAS = { width: COLUMNS * CELL.width, height: Math.ceil(CASES.length / COLUMNS) * CELL.height };

/** How far apart the faint outer edge of a blur may be, in px, and how much its opacity may differ, of 255. */
const SOFT_EDGE_PX = 2;
const SOFT_ALPHA = 12;

interface Report {
  id: string;
  /** Bounds of everything painted (alpha 24 of 255 and up): left, top, right, bottom, in px of the cell. */
  svgBox: number[] | null;
  canvasBox: number[] | null;
  /** Pixels solid in one and empty in the other. */
  disagree: number;
  /** The most the SVG's opacity at a pixel is outside the canvas's at that pixel and its neighbours, of 255, and where. */
  alphaOff: number;
  alphaOffAt: string;
}

async function compareSvgWithCanvas(page: Page, svg: string, pngBase64: string): Promise<Report[]> {
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
              if (data[(y * cell.width + x) * 4 + 3] < 24) continue;
              box = box
                ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
                : [x, y, x, y];
            }
          }
          return box;
        };
        let disagree = 0;
        let alphaOff = 0;
        let alphaOffAt = '';
        for (let at = 0; at < a.length; at += 4) {
          if ((a[at + 3] >= 250 && b[at + 3] <= 5) || (b[at + 3] >= 250 && a[at + 3] <= 5)) disagree += 1;
          // Held against the canvas's pixels around it too: the sharp edge of
          // the item itself can fall a pixel apart in the two.
          const x = (at / 4) % cell.width;
          const y = Math.floor(at / 4 / cell.width);
          let low = 255;
          let high = 0;
          for (let ny = Math.max(0, y - 1); ny <= Math.min(cell.height - 1, y + 1); ny += 1) {
            for (let nx = Math.max(0, x - 1); nx <= Math.min(cell.width - 1, x + 1); nx += 1) {
              const alpha = b[(ny * cell.width + nx) * 4 + 3];
              low = Math.min(low, alpha);
              high = Math.max(high, alpha);
            }
          }
          const off = Math.max(0, a[at + 3] - high, low - a[at + 3]);
          if (off > alphaOff) {
            alphaOff = off;
            alphaOffAt = `${x},${y}: SVG ${a[at + 3]}, canvas ${low} to ${high} around it`;
          }
        }
        return { id: entry.id, svgBox: bounds(a), canvasBox: bounds(b), disagree, alphaOff, alphaOffAt };
      });
    },
    { svg, pngBase64, placed: PLACED.map(({ id, cell }) => ({ id, cell })), cell: CELL },
  );
}

test.describe('SVG export of blur and drop shadow', () => {
  test('cuts off nothing the canvas draws', async ({ page }) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(page, {
      ...createProjectDocument(PLACED.map((entry) => entry.item)),
      canvas: CANVAS,
    });

    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await pngDownload.path());
    // Kept with the test's output: what to look at when a check fails.
    await fs.writeFile(test.info().outputPath('canvas.png'), png);

    const svgDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    const svg = await fs.readFile(await svgDownload.path(), 'utf8');
    await fs.writeFile(test.info().outputPath('export.svg'), svg);

    for (const report of await compareSvgWithCanvas(page, svg, png.toString('base64'))) {
      const entry = CASES.find((candidate) => candidate.id === report.id)!;
      expect.soft(report.canvasBox, `${report.id}: the canvas draws the item`).not.toBeNull();
      expect.soft(report.svgBox, `${report.id}: the SVG draws the item`).not.toBeNull();
      const offBy = (report.svgBox ?? []).map((edge, index) => Math.abs(edge - (report.canvasBox?.[index] ?? NaN)));
      expect
        .soft(
          offBy.length === 4 ? Math.max(...offBy) : NaN,
          `${report.id}: SVG paints ${report.svgBox}, the canvas ${report.canvasBox} (left, top, right, bottom)`,
        )
        .toBeLessThanOrEqual(entry.soft ? SOFT_EDGE_PX : 1);
      expect.soft(report.disagree, `${report.id}: pixels painted in only one of SVG and canvas`).toBeLessThanOrEqual(8);
      if (entry.soft) {
        expect
          .soft(report.alphaOff, `${report.id}: opacity differs most at ${report.alphaOffAt}`)
          .toBeLessThanOrEqual(SOFT_ALPHA);
      }
    }
  });
});
