import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultProjectDocument,
  createTextItem,
} from '../../document/documentDefaults';
import type { ProjectDocument, TextCanvasItem } from '../../document/documentTypes';
import { fakeMeasurer, fakeRasterizer } from '../../../test/svgExportFakes';
import { exportToSvg } from './exportToSvg';

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(resolve('src/assets/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function docWith(nodes: ProjectDocument['nodes']): ProjectDocument {
  return { ...createDefaultProjectDocument(), nodes };
}

describe('exportToSvg', () => {
  it('outlines embeddable fonts and warns on system fonts', async () => {
    const bytes = loadFont('Audiowide-Regular.ttf');
    const loadFontBytes = vi.fn(async (item) =>
      item.fontFamily === 'Arial'
        ? { kind: 'system' as const, bytes: null }
        : { kind: 'bundled' as const, bytes },
    );

    const { svg, warnings } = await exportToSvg(
      docWith([
        createTextItem({ id: 'ok', text: 'A', fontFamily: 'Audiowide' }),
        createTextItem({ id: 'sys', text: 'B', fontFamily: 'Arial' }),
      ]),
      { loadFontBytes, measurer: fakeMeasurer, rasterizer: fakeRasterizer },
    );

    expect(svg).toContain('<path');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ itemId: 'sys', fontFamily: 'Arial', reason: 'system-font' });
  });

  it('resolves each distinct font variant only once', async () => {
    const loadFontBytes = vi.fn(async () => ({ kind: 'system' as const, bytes: null }));

    await exportToSvg(
      docWith([
        createTextItem({ id: 'a', text: 'A', fontFamily: 'Arial' }),
        createTextItem({ id: 'b', text: 'B', fontFamily: 'Arial' }),
      ]),
      { loadFontBytes, measurer: fakeMeasurer, rasterizer: fakeRasterizer },
    );

    expect(loadFontBytes).toHaveBeenCalledTimes(1);
  });

  it('outlines each weight and style of one family from its own font bytes', async () => {
    const roman = loadFont('Barlow-Regular.ttf');
    const bold = loadFont('Barlow-Bold.ttf');
    const italic = loadFont('Barlow-Italic.ttf');
    const loadFontBytes = vi.fn(async (item: TextCanvasItem) => ({
      kind: 'bundled' as const,
      bytes: item.fontStyle === 'italic' ? italic : item.fontWeight === 'bold' ? bold : roman,
    }));
    const variant = (id: string, overrides: Partial<TextCanvasItem>) =>
      createTextItem({ id, text: 'a', fontFamily: 'Barlow', x: 0, y: 0, ...overrides });

    const { svg, warnings } = await exportToSvg(
      docWith([
        variant('regular', {}),
        variant('bold', { fontWeight: 'bold' }),
        variant('italic', { fontStyle: 'italic' }),
        variant('regular-again', {}),
      ]),
      { loadFontBytes, measurer: fakeMeasurer, rasterizer: fakeRasterizer },
    );

    expect(warnings).toEqual([]);
    // One lookup per family + weight + style, not one per family.
    expect(loadFontBytes).toHaveBeenCalledTimes(3);
    // Same glyph, same position: the outlines differ only when the font bytes do.
    const [regularPath, boldPath, italicPath, regularAgainPath] = [
      ...svg.matchAll(/<path d="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(new Set([regularPath, boldPath, italicPath]).size).toBe(3);
    expect(regularAgainPath).toBe(regularPath);
  });
});
