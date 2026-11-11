import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import opentype from 'opentype.js';

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

/**
 * A path's coordinates with its top-left corner moved to the origin: the glyph's
 * shape, independent of where the exporter placed it.
 */
function pathShape(d: string): { commands: string; coords: number[] } {
  const tokens = d.match(/[MLCQZ]|-?\d+\.?\d*/g) ?? [];
  const commands = tokens.filter((token) => /[MLCQZ]/.test(token)).join('');
  const coords = tokens
    .filter((token) => !/[MLCQZ]/.test(token))
    .map((token) => Number.parseFloat(token));
  // Every command opentype emits takes x,y pairs, so even indices are x.
  const minX = Math.min(...coords.filter((_, index) => index % 2 === 0));
  const minY = Math.min(...coords.filter((_, index) => index % 2 === 1));
  return {
    commands,
    coords: coords.map((value, index) => value - (index % 2 === 0 ? minX : minY)),
  };
}

function sameShape(left: string, right: string): boolean {
  const a = pathShape(left);
  const b = pathShape(right);
  return (
    a.commands === b.commands &&
    a.coords.length === b.coords.length &&
    // Both sides round to 2 decimals after different translations.
    a.coords.every((value, index) => Math.abs(value - b.coords[index]) < 0.05)
  );
}

/** The outline of `ch` in a bundled font file: what a text layer set in that file must export as. */
function bundledGlyphOutline(fontFile: string, ch: string, fontSize: number): string {
  const bytes = readFileSync(path.join(process.cwd(), 'src/assets/fonts', fontFile));
  const font = opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return font.charToGlyph(ch).getPath(0, 0, fontSize).toPathData(2);
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

  // Regression: a family that ships several files (Regular, Bold, Italic, ...)
  // used to export every layer with whichever file registered first, so regular
  // text came out with bold glyphs. Which file a layer gets depends on the fonts
  // the running app registered, so the per-variant choice is proven here.
  test('outlines each weight and style of a multi-file family with its own font file', async ({ page }) => {
    await openFreshEditor(page);

    const fontSize = 100;
    const variants = [
      { id: 'regular', fontWeight: 'normal', fontStyle: 'normal', file: 'HelveticaNeueRoman.otf' },
      { id: 'bold', fontWeight: 'bold', fontStyle: 'normal', file: 'HelveticaNeueBold.otf' },
      { id: 'italic', fontWeight: 'normal', fontStyle: 'italic', file: 'HelveticaNeueItalic.ttf' },
      { id: 'bold-italic', fontWeight: 'bold', fontStyle: 'italic', file: 'HelveticaNeueBoldItalic.otf' },
    ];
    const doc = {
      ...createProjectDocument(
        variants.map(({ id, fontWeight, fontStyle }, index) =>
          createTextFixture({
            id,
            text: 'a',
            fontFamily: 'Helvetica Neue',
            fontSize,
            fontWeight,
            fontStyle,
            x: 40 + index * 180,
            y: 40,
            width: 160,
            height: 160,
            zIndex: index + 1,
          }),
        ),
      ),
      // What the app saves for this family: a single reference, naming the file
      // that registered first. For Helvetica Neue that is the bold one.
      fonts: [{ family: 'Helvetica Neue', sourceName: 'HelveticaNeueBold.otf', kind: 'bundled' }],
    };
    await uploadProject(page, doc, 'font-variants.json');

    const svg = await readDownloadedSvg(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'Export', 'SVG');
      }),
    );

    // One <path> per text layer, in layer order. A coordinate that failed to
    // serialize would make every shape comparison below meaningless.
    const exportedPaths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
    expect(exportedPaths).toHaveLength(variants.length);
    expect(exportedPaths.join(' ')).not.toContain('NaN');

    const files = variants.map(({ file }) => file);
    const exportedWith = exportedPaths.map((exportedPath) =>
      files.filter((file) => sameShape(exportedPath, bundledGlyphOutline(file, 'a', fontSize))),
    );
    expect(exportedWith).toEqual(files.map((file) => [file]));
  });
});
