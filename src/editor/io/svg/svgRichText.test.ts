import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import type { TextCanvasItem } from '../../document/documentTypes';
import { fakeMeasurer, fakeOutlineFont, makeSvgDeps, fakeRasterizer } from '../../../test/svgExportFakes';
import { documentToSvg } from './documentToSvg';
import { exportToSvg } from './exportToSvg';
import type { OutlineResult } from './svgExportTypes';

/**
 * Text with tags, as `svgText` writes it. That it looks like the canvas is proven
 * against a real browser in e2e; these tests pin down what is written.
 *
 * The fakes make every character 10 wide with its baseline 8 below the top of
 * its line, and write a glyph as `M<penX> <baselineY>h10v-10h-10Z`.
 */

const layer = (overrides: Partial<TextCanvasItem>) =>
  createTextItem({
    id: 'layer',
    fontSize: 20,
    lineHeight: 1,
    width: 400,
    height: 100,
    fill: '#ffffff',
    ...overrides,
  });

function exportLayer(
  overrides: Partial<TextCanvasItem>,
  getOutlineFont: (item: TextCanvasItem) => OutlineResult = () => ({ ok: true, font: fakeOutlineFont }),
) {
  return documentToSvg(
    { ...createDefaultProjectDocument(), nodes: [layer(overrides)] },
    makeSvgDeps({ fontOutlines: { getOutlineFont }, measurer: fakeMeasurer }),
  );
}

const pathTags = (svg: string) => svg.match(/<path [^>]*>/g) ?? [];
const penPositions = (tag: string) =>
  [...tag.matchAll(/M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)h/g)].map((match) => [Number(match[1]), Number(match[2])]);

describe('text with tags exported to SVG', () => {
  it('writes one path per fragment, each with its run\'s colour, and none of the tags', () => {
    const { svg, warnings } = exportLayer({ text: 'ab<color=#f00>cd</color>\n<b>e</b>' });
    expect(warnings).toEqual([]);

    const tags = pathTags(svg);
    expect(tags).toHaveLength(3);
    expect(tags.map((tag) => tag.match(/fill="([^"]+)"/)?.[1])).toEqual(['#ffffff', '#ff0000', '#ffffff']);
    expect(tags.map(penPositions)).toEqual([
      [[0, 8], [10, 8]],
      [[20, 8], [30, 8]],
      [[0, 28]],
    ]);
  });

  it('runs a tagged gradient across the fragment\'s own box, on every line it is on', () => {
    const { svg } = exportLayer({
      text: 'ab <gradient start=#f00 end=#00f angle=90>cdef ghij</gradient>',
      width: 80,
    });

    // "ab cdef" fits 80 px; "ghij" wraps. Each fragment is 40 wide in a 20 px line box.
    const gradients = [...svg.matchAll(/<linearGradient id="([^"]+)"[^>]* x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map(
      (match) => [match[1], ...match.slice(2).map(Number)],
    );
    expect(gradients).toEqual([
      ['grad-layer-1', 30, 10, 70, 10],
      ['grad-layer-2', 0, 30, 40, 30],
    ]);
    expect(pathTags(svg).map((tag) => tag.match(/fill="([^"]+)"/)?.[1])).toEqual([
      '#ffffff',
      'url(#grad-layer-1)',
      'url(#grad-layer-2)',
    ]);
  });

  it('runs a gradient without an angle from the top of the line box to its bottom', () => {
    const { svg } = exportLayer({ text: '<gradient start=#f00 end=#00f>ab</gradient>' });
    expect(svg).toMatch(/<linearGradient id="grad-layer-0"[^>]* x1="10" y1="0" x2="10" y2="20">/);
  });

  it('defines the layer\'s own gradient once and fills every untagged fragment with it', () => {
    const { svg } = exportLayer({
      text: 'a<b>b</b>c',
      gradientEnabled: true,
      gradientAngle: 90,
      fill: '#ff0000',
      secondaryFill: '#0000ff',
    });
    expect(svg.match(/<linearGradient /g)).toHaveLength(1);
    expect(pathTags(svg).map((tag) => tag.match(/fill="([^"]+)"/)?.[1])).toEqual([
      'url(#grad-layer)',
      'url(#grad-layer)',
      'url(#grad-layer)',
    ]);
  });

  it('asks for the font of each run\'s own weight and style', () => {
    const asked: string[] = [];
    exportLayer({ text: 'a<b>b<i>c</i></b><i>d</i>' }, (item) => {
      asked.push(`${item.fontWeight} ${item.fontStyle}`);
      return { ok: true, font: fakeOutlineFont };
    });
    expect(asked).toEqual(['normal normal', 'bold normal', 'bold italic', 'normal italic']);
  });

  it('fakes bold for the runs whose font file lacks it, and only for those', () => {
    const { svg } = exportLayer({ text: 'a<b>b</b>' }, (item) => ({
      ok: true,
      font: fakeOutlineFont,
      ...(item.fontWeight === 'bold' ? { synthetic: { bold: true, italic: false } } : {}),
    }));
    expect(pathTags(svg).map((tag) => / stroke-width="/.test(tag))).toEqual([false, true]);
  });

  it('leaves the layer out, with one warning, when a run has no outline font', () => {
    const { svg, warnings } = exportLayer({ text: 'a<b>b</b><b><i>c</i></b>' }, (item) =>
      item.fontWeight === 'bold' ? { ok: false, reason: 'no-bytes' } : { ok: true, font: fakeOutlineFont },
    );
    expect(pathTags(svg)).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ itemId: 'layer', reason: 'no-bytes' });
  });

  it('loads the font file of every run before exporting', async () => {
    const loaded: string[] = [];
    await exportToSvg(
      { ...createDefaultProjectDocument(), nodes: [layer({ text: 'a<b>b</b><i>c</i>' })] },
      {
        loadFontBytes: async (item) => {
          loaded.push(`${item.fontWeight} ${item.fontStyle}`);
          return { kind: 'bundled', bytes: null };
        },
        measurer: fakeMeasurer,
        rasterizer: fakeRasterizer,
      },
    );
    expect(loaded).toEqual(['normal normal', 'bold normal', 'normal italic']);
  });
});
