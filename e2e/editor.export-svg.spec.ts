import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
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

  // Regression: the exporter moved the pen by each character's own width, which
  // leaves out the kerning the canvas draws with, so kerned text drifted right of
  // where the canvas shows it. "AVATAR Toy" in Albertus is kerned at almost every
  // pair: at 120px the exported line ended 96px late. Kerning exists only in a
  // real browser's text shaping, and the reference is the canvas itself
  // (Export > PNG), so this lives in e2e. Letter spacing takes a different
  // drawing path on the canvas (character by character), hence the second layer.
  test('places kerned text where the canvas draws it, with and without letter spacing', async ({ page }) => {
    await openFreshEditor(page);
    // The canvas must not draw the layers before their font has arrived.
    await page.waitForFunction(() =>
      [...document.fonts].some((face) => face.family.replace(/["']/g, '') === 'Albertus MT Std'),
    );

    const layers = [
      { id: 'kerned', letterSpacing: 0, x: 20, y: 40, width: 980, height: 170 },
      { id: 'kerned-spaced', letterSpacing: 10, x: 20, y: 240, width: 980, height: 170 },
    ];
    const doc = {
      ...createProjectDocument(
        layers.map((layer, index) =>
          createTextFixture({
            ...layer,
            name: layer.id,
            text: 'AVATAR Toy',
            fontFamily: 'Albertus MT Std',
            fontSize: 120,
            zIndex: index + 1,
          }),
        ),
      ),
      fonts: [{ family: 'Albertus MT Std', sourceName: 'Albertus MT Std Regular.otf', kind: 'bundled' }],
    };
    await uploadProject(page, doc, 'kerned-text.json');

    const svg = await readDownloadedSvg(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'Export', 'SVG');
      }),
    );
    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = readFileSync(await pngDownload.path()).toString('base64');

    const compared = await compareInkWithCanvas(page, svg, png, doc.canvas.width, layers);

    expect(compared).toHaveLength(layers.length);
    for (const layer of compared) {
      // The canvas drew the line, and it fits its box (nothing cut off at the edges).
      expect(layer.canvas.pixels).toBeGreaterThan(10_000);
      expect(layer.canvas.right).toBeLessThan(layer.boxRight - 2);
      // The exported line starts and ends where the canvas line does. Before the
      // fix the end was 96px out; 2px allows for anti-aliasing differences.
      expect(Math.abs(layer.exported.left - layer.canvas.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(layer.exported.right - layer.canvas.right)).toBeLessThanOrEqual(2);
      // And the glyphs in between sit on top of the canvas ones: shared ink over
      // ink in either. About 0.94 when placed right, 0.2 before the fix.
      expect(layer.overlap).toBeGreaterThan(0.8);
    }
  });
});

interface InkComparison {
  boxRight: number;
  canvas: { left: number; right: number; pixels: number };
  exported: { left: number; right: number; pixels: number };
  overlap: number;
}

/**
 * Compare what the canvas shows (`pngBase64`, from Export > PNG) with an exported
 * SVG rendered at the same size, inside each box (canvas coordinates): where the
 * ink of each starts and ends horizontally, how much there is, and how much of it
 * the two share. All values are in PNG pixels.
 */
async function compareInkWithCanvas(
  page: Page,
  svg: string,
  pngBase64: string,
  canvasWidth: number,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
): Promise<InkComparison[]> {
  return page.evaluate(
    async ({ svg, pngBase64, canvasWidth, boxes }) => {
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
      const alphaOf = (image: HTMLImageElement) => {
        const surface = document.createElement('canvas');
        surface.width = width;
        surface.height = height;
        const context = surface.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);
        return (x: number, y: number) => data[(y * width + x) * 4 + 3];
      };
      const canvasAlpha = alphaOf(canvasImage);
      const exportedAlpha = alphaOf(exportedImage);
      const scale = width / canvasWidth;
      const addInk = (ink: { left: number; right: number; pixels: number }, x: number) => {
        ink.pixels += 1;
        if (x < ink.left) ink.left = x;
        if (x > ink.right) ink.right = x;
      };

      return boxes.map((box) => {
        const x0 = Math.max(0, Math.round(box.x * scale));
        const x1 = Math.min(width, Math.round((box.x + box.width) * scale));
        const y0 = Math.max(0, Math.round(box.y * scale));
        const y1 = Math.min(height, Math.round((box.y + box.height) * scale));
        const canvas = { left: Infinity, right: -Infinity, pixels: 0 };
        const exported = { left: Infinity, right: -Infinity, pixels: 0 };
        let shared = 0;
        let either = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const onCanvas = canvasAlpha(x, y) > 127;
            const onExport = exportedAlpha(x, y) > 127;
            if (onCanvas) addInk(canvas, x);
            if (onExport) addInk(exported, x);
            if (onCanvas && onExport) shared += 1;
            if (onCanvas || onExport) either += 1;
          }
        }
        return { boxRight: x1, canvas, exported, overlap: either > 0 ? shared / either : 0 };
      });
    },
    { svg, pngBase64, canvasWidth, boxes },
  );
}
