// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createDefaultProjectDocument, createTextItem } from '../../document/documentDefaults';
import { fakeMeasurer, fakeRasterizer } from '../../../test/svgExportFakes';
import { parsePathData } from '../../../test/svgPathData';
import { exportToSvg } from './exportToSvg';

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** `!` to `~`: every printable ASCII character that draws something. */
const PRINTABLE_ASCII = Array.from({ length: 94 }, (_, index) =>
  String.fromCharCode(0x21 + index),
).join('');

describe('text layers exported as glyph outlines', () => {
  // All glyphs of a layer share one <path>, and a renderer stops at the first command it
  // cannot read, so one unreadable number costs the layer the rest of its text. The fake
  // measurer puts every glyph at a whole-number x on a whole-number baseline, which is
  // where opentype.js's own serializer used to write `NaN`.
  it.each([
    { file: 'Albertus MT Std Regular.otf', fontSize: 120 },
    { file: 'Barlow-Italic.ttf', fontSize: 144 },
    { file: 'Barlow-Regular.ttf', fontSize: 100 },
    { file: 'Modernia.otf', fontSize: 42 },
  ])('writes a path that reads to its end for $file at $fontSize px', async ({ file, fontSize }) => {
    const bytes = loadFont(file);
    const layer = createTextItem({ text: PRINTABLE_ASCII, fontFamily: 'Bundled', fontSize });

    const { svg, warnings } = await exportToSvg(
      { ...createDefaultProjectDocument(), nodes: [layer] },
      {
        loadFontBytes: async () => ({ kind: 'bundled', bytes }),
        measurer: fakeMeasurer,
        rasterizer: fakeRasterizer,
      },
    );

    expect(warnings).toEqual([]);
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).not.toContain('NaN');
    // Throws on anything that is not a number, or a command with the wrong count of them.
    const commands = parsePathData(paths[0]);
    // No character was dropped: every glyph's outline starts with a move.
    expect(commands.filter((command) => command.type === 'M').length).toBeGreaterThanOrEqual(
      PRINTABLE_ASCII.length,
    );
  });
});
