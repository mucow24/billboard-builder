import { expect, test } from '@playwright/test';

import {
  addGenerator,
  captureDownload,
  clickToolbarPopoverItem,
  openFreshEditor,
  readDownloadedSvg,
} from './support/editor';

// Real-browser validation of the parts unit tests can't exercise: a generator
// rasterized through a real 2D canvas, the download, and the SVG actually parsing
// and rendering. Glyph-shape/text fidelity is covered by the node + unit tests.
test.describe('SVG export', () => {
  test('downloads a well-formed SVG with the generator rasterized as an image', async ({ page }) => {
    await openFreshEditor(page);
    await addGenerator(page, 'Diagonal Bands');

    const download = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    expect(download.suggestedFilename()).toMatch(/\.svg$/);

    const svg = await readDownloadedSvg(download);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<image'); // generator rasterized + embedded
    expect(svg).not.toContain('<text'); // outlines/raster only — never renderer-dependent text

    // The exported SVG parses and renders as an image in the browser.
    const naturalWidth = await page.evaluate(async (markup) => {
      const img = new Image();
      img.src = `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
      await img.decode();
      return img.naturalWidth;
    }, svg);
    expect(naturalWidth).toBeGreaterThan(0);
  });
});
