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
  openFreshEditor,
  uploadProject,
} from './support/editor';

/**
 * The SVG export draws the blur and the drop shadow of a shape, line or image
 * with an SVG filter, and a filter paints nothing outside its region. The
 * region has to hold the item's box, its stroke, and as far as blur and shadow
 * reach: one measured from the bounding box of the geometry alone leaves out a
 * wide stroke and a shadow longer than half the item, and is empty for a
 * horizontal line.
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
   * What the SVG has to paint (left, top, right, bottom, in px of the cell),
   * for a case that cannot be compared with the canvas.
   */
  svgPaints?: number[];
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
  // The blur reaches further past the item than half its height. The canvas
  // blurs about twice as far as the SVG does, so this case is held against the
  // Gaussian the SVG asks for (a standard deviation of 8 px): it fades to the
  // alpha the bounds are read at 14 px from the middle of the bar and 5.5 px
  // past its ends.
  {
    id: 'blur',
    svgPaints: [AT.dx - 5.5, AT.dy + 4 - 14, AT.dx + 200 + 4.5, AT.dy + 3 + 14],
    build: (x, y) => createRectangleFixture({ x, y, width: 200, height: 8, fill: '#ff0000', blurRadius: 16 }),
  },
];

const PLACED = CASES.map((entry, index) => {
  const cell = { x: (index % COLUMNS) * CELL.width, y: Math.floor(index / COLUMNS) * CELL.height };
  return { id: entry.id, cell, item: { ...entry.build(cell.x + AT.dx, cell.y + AT.dy), id: `filter-case-${index}`, zIndex: index } };
});

const CANVAS = { width: COLUMNS * CELL.width, height: Math.ceil(CASES.length / COLUMNS) * CELL.height };

interface Report {
  id: string;
  /** Bounds of everything painted (alpha 24 of 255 and up): left, top, right, bottom, in px of the cell. */
  svgBox: number[] | null;
  canvasBox: number[] | null;
  /** Pixels solid in one and empty in the other. */
  disagree: number;
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
        for (let at = 0; at < a.length; at += 4) {
          if ((a[at + 3] >= 250 && b[at + 3] <= 5) || (b[at + 3] >= 250 && a[at + 3] <= 5)) disagree += 1;
        }
        return { id: entry.id, svgBox: bounds(a), canvasBox: bounds(b), disagree };
      });
    },
    { svg, pngBase64, placed: PLACED.map(({ id, cell }) => ({ id, cell })), cell: CELL },
  );
}

test.describe('SVG export of blur and drop shadow', () => {
  test('cuts off nothing the canvas draws', async ({ page }) => {
    await openFreshEditor(page);
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
      const expected = entry.svgPaints ?? report.canvasBox;
      const offBy = (report.svgBox ?? []).map((edge, index) => Math.abs(edge - (expected?.[index] ?? NaN)));
      expect
        .soft(
          offBy.length === 4 ? Math.max(...offBy) : NaN,
          `${report.id}: SVG paints ${report.svgBox}, ${entry.svgPaints ? 'not' : 'the canvas'} ${expected} (left, top, right, bottom)`,
        )
        .toBeLessThanOrEqual(entry.svgPaints ? 1.5 : 1);
      if (!entry.svgPaints) {
        expect.soft(report.disagree, `${report.id}: pixels painted in only one of SVG and canvas`).toBeLessThanOrEqual(8);
      }
    }
  });
});
