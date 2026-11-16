import fs from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  captureDownload,
  clickToolbarPopoverItem,
  createProjectDocument,
  createTextFixture,
  openFreshEditor,
  readDownloadedSvg,
  uploadProject,
  waitForBundledFonts,
} from './support/editor';

/**
 * Emoji that the font of a text layer lacks are drawn from the bundled Noto
 * Emoji, a black-and-white font, in the layer's own fill, rather than from the
 * system's colour emoji font. That holds for emoji typed with the emoji
 * presentation selector (U+FE0F) too, which on its own makes Chromium go to a
 * colour font whatever the text names, and for emoji with a skin tone and
 * joined sequences. SVG export outlines them the same way.
 *
 * Export > PNG is the canvas as Pixi drew it, so the checks read that.
 */

const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

/**
 * `drawn` is the text as the canvas is given it, which the reference is drawn
 * from: without U+FE0F, and with keycaps as the private-use characters the
 * bundled Noto Emoji maps to its keycap glyphs (see `drawnText`).
 */
const CASES = [
  { id: 'emoji', text: chars(0x1f600), drawn: chars(0x1f600) },
  { id: 'emoji typed with the presentation selector', text: chars(0x2764, 0xfe0f), drawn: chars(0x2764) },
  { id: 'emoji with a skin tone', text: chars(0x1f44d, 0x1f3fd), drawn: chars(0x1f44d, 0x1f3fd) },
  {
    id: 'joined sequence',
    text: chars(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467),
    drawn: chars(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467),
  },
  // Barlow has the 1 and the # but not the keycap mark.
  { id: 'keycaps', text: chars(0x31, 0xfe0f, 0x20e3, 0x23, 0xfe0f, 0x20e3), drawn: chars(0x100001, 0x10000a) },
];

const FONT_SIZE = 110;
const ROW = 200;
const FILL = '#ff0000';

function buildDocument() {
  return createProjectDocument(
    CASES.map((entry, index) =>
      createTextFixture({
        id: `emoji-case-${index}`,
        name: entry.id,
        zIndex: index + 1,
        text: entry.text,
        // Barlow has none of these emoji.
        fontFamily: 'Barlow',
        fontSize: FONT_SIZE,
        fill: FILL,
        secondaryFill: FILL,
        x: 100,
        y: 30 + index * ROW,
        width: 800,
        height: 170,
      }),
    ),
  );
}

interface CellReport {
  id: string;
  /** Opaque pixels of the canvas that are not the fill colour: a colour emoji has many. */
  offColour: number;
  /** Ink of the canvas, of the exported SVG, and of the emoji drawn in Noto Emoji alone (sum of alpha). */
  canvasInk: number;
  svgInk: number;
  notoInk: number;
  /** Where the ink of the exported SVG is centred, less where the canvas's is, in px. */
  svgOffset: { x: number; y: number };
}

test.describe('emoji fallback', () => {
  test('draws emoji the font lacks from Noto Emoji in the text colour, on the canvas and in SVG', async ({
    page,
  }) => {
    await openFreshEditor(page);
    await uploadProject(page, buildDocument());
    await waitForBundledFonts(page);

    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await pngDownload.path());
    const svgDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    const svg = await readDownloadedSvg(svgDownload);

    const reports: CellReport[] = await page.evaluate(
      async ({ pngBase64, svgText, cases, row, fontSize }) => {
        const decode = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        };
        const pixelsOf = (image: HTMLImageElement, width: number, height: number) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          context.drawImage(image, 0, 0, width, height);
          return context.getImageData(0, 0, width, height).data;
        };

        const pngImage = await decode(`data:image/png;base64,${pngBase64}`);
        const width = pngImage.naturalWidth;
        const height = pngImage.naturalHeight;
        const canvasPixels = pixelsOf(pngImage, width, height);
        const svgPixels = pixelsOf(
          await decode(URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))),
          width,
          height,
        );

        return cases.map((entry, index) => {
          const top = index * row + 10;
          const bottom = Math.min(height, top + row);
          let offColour = 0;
          const ink = { canvas: 0, svg: 0 };
          const centre = { canvas: { x: 0, y: 0 }, svg: { x: 0, y: 0 } };
          for (let y = top; y < bottom; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const at = (y * width + x) * 4;
              const canvasAlpha = canvasPixels[at + 3] / 255;
              const svgAlpha = svgPixels[at + 3] / 255;
              ink.canvas += canvasAlpha;
              ink.svg += svgAlpha;
              centre.canvas.x += canvasAlpha * x;
              centre.canvas.y += canvasAlpha * y;
              centre.svg.x += svgAlpha * x;
              centre.svg.y += svgAlpha * y;
              if (
                canvasPixels[at + 3] >= 192 &&
                (canvasPixels[at] < 200 || canvasPixels[at + 1] > 60 || canvasPixels[at + 2] > 60)
              ) {
                offColour += 1;
              }
            }
          }

          // The same emoji, as the canvas is given it, drawn in Noto Emoji alone.
          const reference = document.createElement('canvas');
          reference.width = width;
          reference.height = row * 2;
          const context = reference.getContext('2d', { willReadFrequently: true })!;
          context.font = `${fontSize}px "Noto Emoji"`;
          context.fillStyle = '#ff0000';
          context.fillText(entry.drawn, 20, row);
          const referencePixels = context.getImageData(0, 0, width, row * 2).data;
          let notoInk = 0;
          for (let at = 3; at < referencePixels.length; at += 4) notoInk += referencePixels[at] / 255;

          return {
            id: entry.id,
            offColour,
            canvasInk: Math.round(ink.canvas),
            svgInk: Math.round(ink.svg),
            notoInk: Math.round(notoInk),
            svgOffset: {
              x: centre.svg.x / ink.svg - centre.canvas.x / ink.canvas,
              y: centre.svg.y / ink.svg - centre.canvas.y / ink.canvas,
            },
          };
        });
      },
      { pngBase64: png.toString('base64'), svgText: svg, cases: CASES, row: ROW, fontSize: FONT_SIZE },
    );

    for (const report of reports) {
      expect(report.offColour, `${report.id}: canvas pixels not in the fill colour`).toBe(0);
      expect(report.canvasInk, `${report.id}: canvas ink`).toBeGreaterThan(500);
      expect(
        Math.abs(report.canvasInk - report.notoInk) / report.notoInk,
        `${report.id}: canvas ink ${report.canvasInk} against Noto Emoji's ${report.notoInk}`,
      ).toBeLessThan(0.1);
      expect(
        Math.abs(report.svgInk - report.canvasInk) / report.canvasInk,
        `${report.id}: SVG ink ${report.svgInk} against the canvas's ${report.canvasInk}`,
      ).toBeLessThan(0.1);
      expect(Math.abs(report.svgOffset.x), `${report.id}: SVG ink left or right of the canvas's`).toBeLessThan(1.5);
      expect(Math.abs(report.svgOffset.y), `${report.id}: SVG ink above or below the canvas's`).toBeLessThan(1.5);
    }
  });

  // Pixi adds letter spacing once per grapheme, and an emoji with a skin tone or
  // a family of joined emoji is one grapheme of several code points. SVG export
  // has to space them the same, and centre the line on the same width.
  test('places letter-spaced emoji in SVG where the canvas has them', async ({ page }) => {
    const thumbsUpMediumSkin = chars(0x1f44d, 0x1f3fd);
    const family = chars(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    await openFreshEditor(page);
    await uploadProject(
      page,
      createProjectDocument([
        createTextFixture({
          id: 'spaced-emoji',
          name: 'spaced emoji',
          zIndex: 1,
          text: `A${thumbsUpMediumSkin}B${family}C`,
          fontFamily: 'Barlow',
          fontSize: 80,
          letterSpacing: 24,
          align: 'center',
          fill: FILL,
          secondaryFill: FILL,
          x: 40,
          y: 300,
          width: 940,
          height: 160,
        }),
      ]),
    );
    await waitForBundledFonts(page);

    const pngDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'PNG');
    });
    const png = await fs.readFile(await pngDownload.path());
    const svgDownload = await captureDownload(page, async () => {
      await clickToolbarPopoverItem(page, 'Export', 'SVG');
    });
    const svg = await readDownloadedSvg(svgDownload);

    const { canvas, svg: exported } = await page.evaluate(
      async ({ pngBase64, svgText }) => {
        const decode = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        };
        const pngImage = await decode(`data:image/png;base64,${pngBase64}`);
        const svgImage = await decode(URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' })));
        const width = pngImage.naturalWidth;
        const height = pngImage.naturalHeight;
        // Ink (sum of alpha), where it is centred, and where it starts and ends.
        const inkOf = (image: HTMLImageElement) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true })!;
          context.drawImage(image, 0, 0, width, height);
          const data = context.getImageData(0, 0, width, height).data;
          let ink = 0;
          let x = 0;
          let y = 0;
          let left = width;
          let right = 0;
          for (let at = 3; at < data.length; at += 4) {
            const alpha = data[at] / 255;
            if (alpha === 0) continue;
            const pixel = (at - 3) / 4;
            ink += alpha;
            x += alpha * (pixel % width);
            y += alpha * Math.floor(pixel / width);
            if (alpha > 0.5) {
              left = Math.min(left, pixel % width);
              right = Math.max(right, pixel % width);
            }
          }
          return { ink, x: x / ink, y: y / ink, left, right };
        };
        return { canvas: inkOf(pngImage), svg: inkOf(svgImage) };
      },
      { pngBase64: png.toString('base64'), svgText: svg },
    );

    expect(canvas.ink, 'canvas ink').toBeGreaterThan(1000);
    expect(Math.abs(exported.ink - canvas.ink) / canvas.ink, 'SVG ink against the canvas').toBeLessThan(0.1);
    expect(Math.abs(exported.x - canvas.x), 'SVG ink left or right of the canvas').toBeLessThan(1.5);
    expect(Math.abs(exported.y - canvas.y), 'SVG ink above or below the canvas').toBeLessThan(1.5);
    expect(Math.abs(exported.left - canvas.left), 'where the line starts').toBeLessThanOrEqual(2);
    expect(Math.abs(exported.right - canvas.right), 'where the line ends').toBeLessThanOrEqual(2);
  });

  // Noto Emoji has the space, the digits, "#" and "*", as wide as an emoji. Its
  // face is used for nothing below U+80, so text whose font lacks them, or is
  // missing, measures as it would without the fallback. (Keycaps reach it as
  // private-use characters; see the case above.)
  test('leaves ASCII to the text font or the system, not to Noto Emoji', async ({ page }) => {
    await openFreshEditor(page);
    await waitForBundledFonts(page);

    const measured = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d')!;
      const measure = (families: string, text: string) => {
        context.font = `72px ${families}`;
        const metrics = context.measureText(text);
        return [Math.round(metrics.width * 10) / 10, metrics.fontBoundingBoxAscent, metrics.fontBoundingBoxDescent];
      };
      const emoji = String.fromCodePoint(0x1f600);
      return {
        missingFont: [measure('"No Such Font", "Noto Emoji"', 'Sale 50 #*'), measure('"No Such Font"', 'Sale 50 #*')],
        fontWithoutDigits: [measure('"DASH Early", "Noto Emoji"', 'SALE 50'), measure('"DASH Early"', 'SALE 50')],
        emoji: [measure('"Barlow", "Noto Emoji"', emoji), measure('"Noto Emoji"', emoji)],
      };
    });

    expect(measured.missingFont[0], 'text in a missing font').toEqual(measured.missingFont[1]);
    expect(measured.fontWithoutDigits[0], 'digits of a font that has none').toEqual(measured.fontWithoutDigits[1]);
    // The fallback is still used where it is meant to be. (Only the advance: the
    // line metrics are those of the first family, which Noto Emoji alone is not.)
    expect(measured.emoji[0][0], 'an emoji').toBe(measured.emoji[1][0]);
  });
});
