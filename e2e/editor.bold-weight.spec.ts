import fs from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import {
  captureDownload,
  clickItem,
  clickToolbarPopoverItem,
  createProjectDocument,
  createTextFixture,
  openFreshEditor,
  openPropertiesTab,
  saveAndReadProject,
  uploadProject,
  waitForBundledFonts,
} from './support/editor';

/**
 * Bold text is drawn in a heavier weight of its typeface where the typeface
 * has one: the weight nearest to 300 above the text's own. Where nothing is
 * heavier, as in a font with one weight, the bold is the browser's to fake.
 *
 * Barlow is bundled in every weight, each a font of its own in the font menu.
 * The checks compare text set in one weight and made bold with text set in the
 * heavier weight itself: the two must come out the same.
 */

const CELL = { width: 620, height: 200 };

const CASES = [
  { id: 'light, bold', fontFamily: 'Barlow Light', fontWeight: 'bold', text: 'Hamburg' },
  { id: 'semibold', fontFamily: 'Barlow Semibold', fontWeight: 'normal', text: 'Hamburg' },
  { id: 'light, tagged bold', fontFamily: 'Barlow Light', fontWeight: 'normal', text: '<b>Hamburg</b>' },
  { id: 'light', fontFamily: 'Barlow Light', fontWeight: 'normal', text: 'Hamburg' },
  // A font with one weight.
  { id: 'single, bold', fontFamily: 'Poiret One', fontWeight: 'bold', text: 'Hamburg' },
  { id: 'single', fontFamily: 'Poiret One', fontWeight: 'normal', text: 'Hamburg' },
] as const;

type CaseId = (typeof CASES)[number]['id'];

function boldWeightDocument() {
  return {
    ...createProjectDocument(
      CASES.map((entry, index) =>
        createTextFixture({
          id: `bold-weight-${index}`,
          name: entry.id,
          zIndex: index + 1,
          text: entry.text,
          fontFamily: entry.fontFamily,
          fontWeight: entry.fontWeight,
          fontSize: 120,
          x: index * CELL.width + 20,
          y: 20,
          width: CELL.width - 40,
          height: CELL.height - 40,
        }),
      ),
    ),
    canvas: { width: CASES.length * CELL.width, height: CELL.height },
  };
}

interface CellInk {
  /** How much the cell differs from the background, in whole pixels of full difference. */
  ink: number;
  /** A checksum of every pixel of the cell. */
  checksum: number;
}

/** What each case's cell of the image at `src` holds. */
async function inkOfCells(page: Page, src: string): Promise<Record<CaseId, CellInk>> {
  const cells = await page.evaluate(
    async ({ url, cell, count }) => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('failed to decode the exported image'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = cell.width * count;
      canvas.height = cell.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const background = ctx.getImageData(0, 0, 1, 1).data;
      return Array.from({ length: count }, (_, index) => {
        const { data } = ctx.getImageData(index * cell.width, 0, cell.width, cell.height);
        let ink = 0;
        let checksum = 2166136261;
        for (let i = 0; i < data.length; i += 4) {
          ink +=
            (Math.abs(data[i] - background[0]) +
              Math.abs(data[i + 1] - background[1]) +
              Math.abs(data[i + 2] - background[2])) /
            765;
          for (let channel = 0; channel < 4; channel += 1) {
            checksum = Math.imul(checksum ^ data[i + channel], 16777619) >>> 0;
          }
        }
        return { ink, checksum };
      });
    },
    { url: src, cell: CELL, count: CASES.length },
  );
  return Object.fromEntries(CASES.map((entry, index) => [entry.id, cells[index]])) as Record<CaseId, CellInk>;
}

test.describe('bold in a typeface with several weights', () => {
  test('is drawn in the heavier weight, and faked where there is none', async ({ page }) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(page, boldWeightDocument());

    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await pngDownload.path());
    await fs.writeFile(test.info().outputPath('bold-weight.png'), png);
    const canvas = await inkOfCells(page, `data:image/png;base64,${png.toString('base64')}`);

    // Light made bold is SemiBold, pixel for pixel.
    expect(canvas['light, bold'].checksum).toBe(canvas.semibold.checksum);
    expect(canvas['light, bold'].ink).toBeGreaterThan(canvas.light.ink * 1.3);
    // A tagged run is drawn as a fragment of its own: the same glyphs.
    expect(canvas['light, tagged bold'].ink / canvas.semibold.ink).toBeCloseTo(1, 2);
    // A font with one weight has nothing heavier: its bold is the browser's, and adds to it.
    expect(canvas['single, bold'].ink).toBeGreaterThan(canvas.single.ink * 1.03);

    const svgDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    const svg = await fs.readFile(await svgDownload.path(), 'utf8');
    await fs.writeFile(test.info().outputPath('bold-weight.svg'), svg);
    const exported = await inkOfCells(page, `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);

    // The export outlines the files the canvas draws with: SemiBold for Light made bold.
    expect(exported['light, bold'].checksum).toBe(exported.semibold.checksum);
    expect(exported['light, tagged bold'].ink / exported.semibold.ink).toBeCloseTo(1, 2);
    expect(exported['light, bold'].ink).toBeGreaterThan(exported.light.ink * 1.3);
    expect(exported['single, bold'].ink).toBeGreaterThan(exported.single.ink * 1.03);
  });

  test('the Bold button keeps the font the text is set in, and the document references the heavier weight', async ({
    page,
  }) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);
    await uploadProject(
      page,
      createProjectDocument([
        createTextFixture({ id: 'headline', text: 'Hamburg', fontFamily: 'Barlow Light', fontSize: 80, x: 40, y: 40 }),
      ]),
    );

    await clickItem(page, 'headline');
    await openPropertiesTab(page);
    await page.getByRole('button', { name: 'Bold' }).click();
    await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Font', exact: true })).toContainText('Barlow Light');

    const saved = await saveAndReadProject(page);
    const [headline] = saved.nodes as Array<Record<string, unknown>>;
    expect(headline).toMatchObject({ fontFamily: 'Barlow Light', fontWeight: 'bold' });
    const families = (saved.fonts as Array<{ family: string }>).map((font) => font.family);
    expect(families).toContain('Barlow Light');
    expect(families).toContain('Barlow Semibold');
  });
});
