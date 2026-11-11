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

interface ShapeComparison {
  /** Ink pixels of the canvas picture and of the exported one inside the box. */
  canvasInk: number;
  exportedInk: number;
  /** Ink pixels of either picture with no ink of the other within `reach` pixels. */
  stray: number;
}

/**
 * How far the shapes of an exported SVG are from what the canvas shows
 * (`pngBase64`, from Export > PNG), inside each box (canvas coordinates). Both are
 * drawn at the PNG's size. Ink that the other picture has nowhere near it is
 * `stray`: nothing for the same glyphs in the same place, however differently
 * their edges are smoothed, and a visible lump for a glyph that is missing, extra
 * or another shape.
 */
async function compareShapesWithCanvas(
  page: Page,
  svg: string,
  pngBase64: string,
  canvasWidth: number,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  reach = 2,
): Promise<ShapeComparison[]> {
  return page.evaluate(
    async ({ svg, pngBase64, canvasWidth, boxes, reach }) => {
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
      const inkOf = (image: HTMLImageElement) => {
        const surface = document.createElement('canvas');
        surface.width = width;
        surface.height = height;
        const context = surface.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);
        const ink = new Uint8Array(width * height);
        for (let i = 0; i < ink.length; i += 1) ink[i] = data[i * 4 + 3] > 127 ? 1 : 0;
        return ink;
      };
      const canvasInk = inkOf(canvasImage);
      const exportedInk = inkOf(exportedImage);
      const scale = width / canvasWidth;

      return boxes.map((box) => {
        const x0 = Math.max(0, Math.round(box.x * scale));
        const x1 = Math.min(width, Math.round((box.x + box.width) * scale));
        const y0 = Math.max(0, Math.round(box.y * scale));
        const y1 = Math.min(height, Math.round((box.y + box.height) * scale));
        const near = (ink: Uint8Array, x: number, y: number) => {
          for (let dy = -reach; dy <= reach; dy += 1) {
            const row = y + dy;
            if (row < 0 || row >= height) continue;
            for (let dx = -reach; dx <= reach; dx += 1) {
              const column = x + dx;
              if (column >= 0 && column < width && ink[row * width + column]) return true;
            }
          }
          return false;
        };
        const result = { canvasInk: 0, exportedInk: 0, stray: 0 };
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const onCanvas = canvasInk[y * width + x] === 1;
            const onExport = exportedInk[y * width + x] === 1;
            if (onCanvas) result.canvasInk += 1;
            if (onExport) result.exportedInk += 1;
            if (onCanvas && !near(exportedInk, x, y)) result.stray += 1;
            if (onExport && !near(canvasInk, x, y)) result.stray += 1;
          }
        }
        return result;
      });
    },
    { svg, pngBase64, canvasWidth, boxes, reach },
  );
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

  // Regression: with letter spacing 0 the canvas draws a line of text in one
  // piece, so the browser joins letters into the font's ligatures: in Albertus,
  // f + i become one glyph without a dot on the i. The exporter outlined every
  // character on its own, so the exported text had other shapes than the canvas.
  // With any other letter spacing the canvas draws character by character and
  // forms no ligature, and the export must not either. Which glyphs the browser
  // draws only shows in a real browser, and the reference is the canvas itself
  // (Export > PNG), so this lives in e2e.
  test('exports the ligatures the canvas draws, and only where it draws them', async ({ page }) => {
    await openFreshEditor(page);
    // Wait for startup to finish, which the Properties tab shows by counting the
    // registered fonts. Before that the bundled fonts are still loading, so the
    // canvas would draw the layers in a fallback font, and the end of startup can
    // replace a project loaded in the meantime with the saved canvas.
    await expect(page.getByText(/\d+ uploaded font\(s\) ready in this session/)).toBeVisible({
      timeout: 30_000,
    });

    const fontSize = 200;
    const albertus = { family: 'Albertus MT Std', file: 'Albertus MT Std Regular.otf' };
    const futura = { family: 'Futura Light Condensed', file: 'Futura Light Condensed.otf' };
    // `glyphs`: the characters whose outlines the layer must export as, in order.
    // U+FB01 and U+FB02 are the fi and fl ligatures as characters of their own,
    // which Albertus maps to the glyphs it joins f + i and f + l into.
    const layers = [
      { id: 'fi', font: albertus, text: 'fi', letterSpacing: 0, glyphs: ['\ufb01'] },
      { id: 'fl', font: albertus, text: 'fl', letterSpacing: 0, glyphs: ['\ufb02'] },
      { id: 'fi-spaced', font: albertus, text: 'fi', letterSpacing: 10, glyphs: ['f', 'i'] },
      // A font without ligatures: nothing to join, with or without the fix.
      { id: 'fi-plain-font', font: futura, text: 'fi', letterSpacing: 0, glyphs: ['f', 'i'] },
    ].map((layer, index) => ({
      ...layer,
      x: 40 + (index % 2) * 480,
      y: 40 + Math.floor(index / 2) * 300,
      width: 440,
      height: 260,
    }));
    const doc = {
      ...createProjectDocument(
        layers.map((layer, index) =>
          createTextFixture({
            id: layer.id,
            name: layer.id,
            text: layer.text,
            fontFamily: layer.font.family,
            fontSize,
            letterSpacing: layer.letterSpacing,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            zIndex: index + 1,
          }),
        ),
      ),
      fonts: [albertus, futura].map((font) => ({ family: font.family, sourceName: font.file, kind: 'bundled' })),
    };
    await uploadProject(page, doc, 'ligatures.json');

    const svg = await readDownloadedSvg(
      await captureDownload(page, async () => {
        await clickToolbarPopoverItem(page, 'Export', 'SVG');
      }),
    );
    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = readFileSync(await pngDownload.path()).toString('base64');

    // One <path> per layer, in layer order.
    const exportedPaths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
    expect(exportedPaths).toHaveLength(layers.length);
    expect(exportedPaths.join(' ')).not.toContain('NaN');

    // Each layer exports exactly the glyphs named for it: the ligature where the
    // canvas joins the letters, the two letters where it does not.
    const commandsOf = (d: string) => d.match(/[MLCQZ][^MLCQZ]*/g) ?? [];
    layers.forEach((layer, index) => {
      let rest = commandsOf(exportedPaths[index]);
      for (const ch of layer.glyphs) {
        const expected = bundledGlyphOutline(layer.font.file, ch, fontSize);
        const count = commandsOf(expected).length;
        expect(
          sameShape(rest.slice(0, count).join(''), expected),
          `layer ${layer.id} draws the glyph of ${JSON.stringify(ch)}`,
        ).toBe(true);
        rest = rest.slice(count);
      }
      expect(rest, `layer ${layer.id} draws nothing else`).toEqual([]);
    });

    // ...and those glyphs are what the canvas shows. The letter-spaced layer is left
    // out here: where its second letter goes is a question of how the canvas spaces
    // letters, not of which glyphs it draws.
    const compared = await compareShapesWithCanvas(page, svg, png, doc.canvas.width, layers);
    expect(compared).toHaveLength(layers.length);
    layers.forEach((layer, index) => {
      // The canvas drew the text, in the font: two letters at 200px are thousands of pixels.
      expect(compared[index].canvasInk, `canvas ink of ${layer.id}`).toBeGreaterThan(3_000);
      if (layer.letterSpacing !== 0) return;
      // Every exported shape lies on a canvas shape and the other way round: 0 stray
      // pixels when the glyphs are the same. The separate f and i of the unfixed
      // exporter left the dot of the i and the hook of the f, which the ligature
      // does not have, as 907 stray pixels (1,526 for f and l).
      expect(compared[index].stray, `stray pixels of ${layer.id}`).toBeLessThan(100);
    });
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
