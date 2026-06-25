import { expect, test } from '@playwright/test';

import {
  addGenerator,
  captureDownload,
  clickToolbarPopoverItem,
  createProjectDocument,
  createTextFixture,
  openFreshEditor,
  readDownloadedSvg,
  uploadProject,
} from './support/editor';

/**
 * Vertical bounds of each top-level `<g transform="translate(x y)">…<path>` (one
 * per text layer) in the exported SVG, in absolute canvas coords. Used to assert
 * baseline placement, which only a real browser's `measureText` can exercise.
 */
function parseTextGroupBounds(svg: string): Array<{ top: number; bottom: number }> {
  const groupRe = /<g transform="translate\(([-\d.]+) ([-\d.]+)\)"[^>]*>.*?<path d="([^"]+)"/gs;
  const out: Array<{ top: number; bottom: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = groupRe.exec(svg)) !== null) {
    const ty = Number.parseFloat(match[2]);
    const toks = match[3].match(/[MLCQZ]|-?\d+\.?\d*/g) ?? [];
    let minY = Infinity;
    let maxY = -Infinity;
    let cmd = '';
    let i = 0;
    const readPoint = () => {
      i++; // skip x
      const y = Number.parseFloat(toks[i++]);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    while (i < toks.length) {
      const t = toks[i];
      if (/[MLCQZ]/.test(t)) { cmd = t; i++; continue; }
      if (cmd === 'M' || cmd === 'L') readPoint();
      else if (cmd === 'C') { readPoint(); readPoint(); readPoint(); }
      else if (cmd === 'Q') { readPoint(); readPoint(); }
      else i++;
    }
    out.push({ top: minY + ty, bottom: maxY + ty });
  }
  return out;
}

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

  // Regression for the Metro.json bug: text baselines must be placed by Pixi's
  // actual-ink ascent (measureText('|ÉqÅM').actualBoundingBoxAscent), NOT the
  // font's nominal fontBoundingBoxAscent. Modernia's accented caps tower above
  // the nominal ascent, so the old exporter put the big "M" ~43px too high and
  // the gap to "METRO" ballooned (~53px vs the ~13px shown on the canvas). Only
  // a real browser measures these metrics, so this lives in e2e.
  test('places text baselines by ink ascent so a decorative-font cap tucks tight to the line below', async ({ page }) => {
    await openFreshEditor(page);

    const bigM = createTextFixture({
      id: 'big-m',
      text: 'M',
      fontFamily: 'Modernia',
      fontSize: 142,
      x: 0,
      y: -68,
      width: 300,
      height: 300,
      align: 'center',
      verticalAlign: 'middle',
      lineHeight: 1,
    });
    const wordmark = createTextFixture({
      id: 'wordmark',
      text: 'METRO',
      fontFamily: 'Helvetica Neue Black',
      fontSize: 51,
      x: -30,
      y: 147,
      width: 360,
      height: 127,
      align: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.1,
    });
    const doc = {
      ...createProjectDocument([bigM, wordmark]),
      fonts: [
        { family: 'Modernia', sourceName: 'Modernia.otf', kind: 'bundled' },
        { family: 'Helvetica Neue Black', sourceName: 'HelveticaNeueBlack.otf', kind: 'bundled' },
      ],
    };
    await uploadProject(page, doc, 'metro-baseline.json');

    const svg = await readDownloadedSvg(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'Export', 'SVG');
      }),
    );

    // Both layers vectorized (no block+warn, no renderer-dependent <text>).
    expect(svg).not.toContain('<text');
    const groups = parseTextGroupBounds(svg);
    expect(groups).toHaveLength(2);

    // groups[0] = M (drawn first), groups[1] = METRO. Gap from the M's baseline
    // (it has no descender) to the top of METRO. Pre-fix this was ~53px.
    const gap = groups[1].top - groups[0].bottom;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(30);
  });
});
