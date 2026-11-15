import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultProjectDocument,
  createTextItem,
} from '../../document/documentDefaults';
import type { ProjectDocument, TextCanvasItem } from '../../document/documentTypes';
import { fakeMeasurer, fakeRasterizer } from '../../../test/svgExportFakes';
import { exportToSvg, type FontBytes } from './exportToSvg';

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

  it('outlines emoji the font lacks from the emoji fallback, asked once per font variant that needs it', async () => {
    const barlow = loadFont('Barlow-Regular.ttf');
    const notoEmoji = loadFont('NotoEmoji-Regular.ttf');
    const loadFontBytes = vi.fn(async () => ({ kind: 'bundled' as const, bytes: barlow }));
    const loadFallbackFontBytes = vi.fn<(item: TextCanvasItem) => Promise<FontBytes>>(async () => ({
      kind: 'bundled',
      bytes: notoEmoji,
    }));
    const smile = String.fromCodePoint(0x1f600);

    const { svg, warnings } = await exportToSvg(
      docWith([
        createTextItem({ id: 'letters', text: 'Hello', fontFamily: 'Barlow' }),
        createTextItem({ id: 'emoji', text: `Hi ${smile}`, fontFamily: 'Barlow' }),
        createTextItem({ id: 'emoji-again', text: smile, fontFamily: 'Barlow' }),
      ]),
      { loadFontBytes, loadFallbackFontBytes, measurer: fakeMeasurer, rasterizer: fakeRasterizer },
    );

    expect(warnings).toEqual([]);
    expect(loadFallbackFontBytes).toHaveBeenCalledTimes(1);
    expect(loadFallbackFontBytes.mock.calls[0][0]).toMatchObject({ id: 'emoji' });
    // "Hello" in one path; "Hi" and its emoji in two; the lone emoji in one.
    expect([...svg.matchAll(/<path d="/g)]).toHaveLength(4);
  });

  it('does not ask for the fallback when the font has every character', async () => {
    const loadFallbackFontBytes = vi.fn(async () => ({ kind: 'system' as const, bytes: null }));

    await exportToSvg(docWith([createTextItem({ text: 'Hello 123 #*', fontFamily: 'Barlow' })]), {
      loadFontBytes: async () => ({ kind: 'bundled' as const, bytes: loadFont('Barlow-Regular.ttf') }),
      loadFallbackFontBytes,
      measurer: fakeMeasurer,
      rasterizer: fakeRasterizer,
    });

    expect(loadFallbackFontBytes).not.toHaveBeenCalled();
  });

  it('does not ask for the fallback for line breaks, nor for ASCII the font lacks, which it never draws', async () => {
    const loadFallbackFontBytes = vi.fn(async () => ({ kind: 'system' as const, bytes: null }));

    await exportToSvg(
      docWith([
        // Barlow has no glyph for a line break, as most fonts have none.
        createTextItem({ id: 'lines', text: 'Two\nlines\r\nhere', fontFamily: 'Barlow' }),
        // DASH Early has no digits.
        createTextItem({ id: 'digits', text: 'SALE 50', fontFamily: 'DASH Early' }),
      ]),
      {
        loadFontBytes: async (item) => ({
          kind: 'bundled' as const,
          bytes: loadFont(item.fontFamily === 'Barlow' ? 'Barlow-Regular.ttf' : 'DASH-Early.ttf'),
        }),
        loadFallbackFontBytes,
        measurer: fakeMeasurer,
        rasterizer: fakeRasterizer,
      },
    );

    expect(loadFallbackFontBytes).not.toHaveBeenCalled();
  });

  it('outlines ASCII the font lacks from the font, never from the fallback', async () => {
    const smile = String.fromCodePoint(0x1f600);
    // The emoji's path, the last one, for text whose font lacks its first two characters or has them.
    const emojiPath = async (text: string) => {
      const { svg } = await exportToSvg(docWith([createTextItem({ id: 'text', text, fontFamily: 'DASH Early' })]), {
        loadFontBytes: async () => ({ kind: 'bundled' as const, bytes: loadFont('DASH-Early.ttf') }),
        loadFallbackFontBytes: async () => ({ kind: 'bundled' as const, bytes: loadFont('NotoEmoji-Regular.ttf') }),
        measurer: fakeMeasurer,
        rasterizer: fakeRasterizer,
      });
      return [...svg.matchAll(/<path d="([^"]+)"/g)].at(-1)?.[1];
    };

    const afterDigits = await emojiPath(`50 ${smile}`);
    expect(afterDigits).toBeDefined();
    expect(afterDigits).toBe(await emojiPath(`SA ${smile}`));
  });
});
