import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultProjectDocument,
  createEllipseItem,
  createGeneratorItem,
  createGroupNode,
  createImageItem,
  createLineItem,
  createNgonItem,
  createPolygonItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import type { CanvasNode, ProjectDocument } from '../../document/documentTypes';
import { fakeOutlineFont, makeSvgDeps, nullOutlineProvider } from '../../../test/svgExportFakes';
import type { FontOutlineProvider } from './svgExportTypes';
import { documentToSvg } from './documentToSvg';

/** Pull the pen-X start of every glyph out of the emitted `<path d>` (fake glyph encodes it as `M{penX} {baselineY}`). */
function glyphPositions(svg: string): { penX: number; baselineY: number }[] {
  const d = svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
  return [...d.matchAll(/M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => ({
    penX: Number(m[1]),
    baselineY: Number(m[2]),
  }));
}

function docWith(overrides: Partial<ProjectDocument>): ProjectDocument {
  return { ...createDefaultProjectDocument(), ...overrides };
}

function svgOf(nodes: CanvasNode[]): string {
  return documentToSvg(docWith({ nodes }), makeSvgDeps()).svg;
}

describe('documentToSvg — document scaffold', () => {
  it('emits an <svg> root with xmlns, viewBox and pixel size matching the canvas', () => {
    const doc = docWith({ canvas: { width: 2048, height: 1024 }, nodes: [] });
    const { svg } = documentToSvg(doc, makeSvgDeps());

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 2048 1024"');
    expect(svg).toContain('width="2048"');
    expect(svg).toContain('height="1024"');
  });

  it('paints an opaque background as a full-canvas rect', () => {
    const doc = docWith({ canvas: { width: 800, height: 600 }, background: '#ff0000', nodes: [] });
    const { svg } = documentToSvg(doc, makeSvgDeps());

    expect(svg).toMatch(/<rect[^>]*width="800"[^>]*height="600"[^>]*fill="#ff0000"/);
  });

  it('omits the background rect when the background is fully transparent', () => {
    const doc = docWith({ canvas: { width: 800, height: 600 }, background: '#ffffff00', nodes: [] });
    const { svg } = documentToSvg(doc, makeSvgDeps());

    expect(svg).not.toContain('<rect');
  });

  it('returns no warnings for an empty document', () => {
    const { warnings } = documentToSvg(docWith({ nodes: [] }), makeSvgDeps());
    expect(warnings).toEqual([]);
  });
});

describe('documentToSvg — rectangle', () => {
  it('wraps the item in a translate group and draws the rect in local space', () => {
    const svg = svgOf([
      createRectangleItem({ x: 10, y: 20, width: 100, height: 50, fill: '#abcdef', strokeWidth: 0 }),
    ]);
    expect(svg).toContain('transform="translate(10 20)"');
    expect(svg).toContain('<rect x="0" y="0" width="100" height="50" fill="#abcdef"/>');
  });

  it('emits rx for a rounded rectangle', () => {
    const svg = svgOf([createRectangleItem({ width: 100, height: 50, cornerRadius: 8 })]);
    expect(svg).toMatch(/<rect[^>]*rx="8"/);
  });

  it('emits stroke + stroke-width when strokeWidth > 0 and omits it otherwise', () => {
    const stroked = svgOf([createRectangleItem({ strokeWidth: 4, stroke: '#112233ff' })]);
    expect(stroked).toContain('stroke="#112233"');
    expect(stroked).toContain('stroke-width="4"');

    const plain = svgOf([createRectangleItem({ strokeWidth: 0 })]);
    expect(plain).not.toContain('stroke-width');
  });
});

describe('documentToSvg — ellipse', () => {
  it('emits an <ellipse> centred in its box', () => {
    const svg = svgOf([createEllipseItem({ x: 0, y: 0, width: 100, height: 60, strokeWidth: 0 })]);
    expect(svg).toContain('<ellipse cx="50" cy="30" rx="50" ry="30"');
  });
});

describe('documentToSvg — ngon', () => {
  it('emits a <polygon> with exactly `sides` vertices', () => {
    const svg = svgOf([createNgonItem({ width: 100, height: 100, sides: 6, strokeWidth: 0 })]);
    const match = svg.match(/<polygon points="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1].trim().split(/\s+/)).toHaveLength(6);
  });
});

describe('documentToSvg — polygon', () => {
  const vertices = [
    { x: 10, y: 20 },
    { x: 110, y: 20 },
    { x: 60, y: 120 },
  ];

  it('emits a closed <path> in local space inside a translate group', () => {
    const svg = svgOf([
      createPolygonItem({ vertices, fill: '#abcdef', strokeWidth: 0 }),
    ]);
    expect(svg).toContain('transform="translate(10 20)"');
    const d = svg.match(/<path d="([^"]+)"/)?.[1];
    expect(d).toBe('M 0 0 L 100 0 L 50 100 Z');
    expect(svg).toContain('fill="#abcdef"');
  });

  it('emits an open stroke-only path with round caps when closed is false', () => {
    const svg = svgOf([
      createPolygonItem({ vertices, closed: false, stroke: '#112233ff', strokeWidth: 4 }),
    ]);
    const d = svg.match(/<path d="([^"]+)"/)?.[1];
    expect(d).toBe('M 0 0 L 100 0 L 50 100');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-width="4"');
  });

  it('rounds corners with quadratic curves when curveRadius > 0', () => {
    const svg = svgOf([
      createPolygonItem({ vertices, curveRadius: 10, strokeWidth: 0 }),
    ]);
    const d = svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
    expect(d.match(/Q /g)).toHaveLength(3);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('documentToSvg — line', () => {
  it('emits a <line> with absolute endpoints and no transform wrapper', () => {
    const svg = svgOf([
      createLineItem({ startX: 5, startY: 5, endX: 50, endY: 80, strokeWidth: 6, stroke: '#ffffffff' }),
    ]);
    expect(svg).toContain('<line x1="5" y1="5" x2="50" y2="80"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('stroke-width="6"');
  });
});

describe('documentToSvg — image', () => {
  it('emits an <image> referencing the source data URL inside its translate group', () => {
    const svg = svgOf([
      createImageItem({
        src: 'data:image/png;base64,IMG',
        mimeType: 'image/png',
        originalWidth: 40,
        originalHeight: 40,
        x: 1,
        y: 2,
      }),
    ]);
    expect(svg).toContain('transform="translate(1 2)"');
    expect(svg).toContain('href="data:image/png;base64,IMG"');
  });
});

describe('documentToSvg — gradient fills', () => {
  it('emits a userSpaceOnUse <linearGradient> referenced by fill=url(#id)', () => {
    const svg = svgOf([
      createRectangleItem({
        id: 'g1',
        width: 100,
        height: 40,
        gradientEnabled: true,
        gradientAngle: 90,
        fill: '#000000',
        secondaryFill: '#ffffff',
        strokeWidth: 0,
      }),
    ]);
    expect(svg).toContain('<linearGradient id="grad-g1"');
    expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('fill="url(#grad-g1)"');
    expect(svg).toContain('<stop offset="0" stop-color="#000000"');
    expect(svg).toContain('<stop offset="1" stop-color="#ffffff"');
  });

  it('places gradient endpoints from the shared angle formula (90° → horizontal)', () => {
    const svg = svgOf([
      createRectangleItem({
        id: 'g2',
        width: 100,
        height: 40,
        gradientEnabled: true,
        gradientAngle: 90,
        strokeWidth: 0,
      }),
    ]);
    expect(svg).toMatch(/x1="0" y1="20" x2="100" y2="20"/);
  });
});

describe('documentToSvg — shadow / blur filters', () => {
  it('emits a feDropShadow filter when the shadow is visible', () => {
    const svg = svgOf([
      createRectangleItem({
        id: 's1',
        shadow: { color: '#000000', blur: 4, offsetX: 2, offsetY: 3, opacity: 0.5 },
      }),
    ]);
    expect(svg).toContain('<filter id="fx-s1"');
    expect(svg).toMatch(/<feDropShadow[^>]*dx="2"[^>]*dy="3"/);
    expect(svg).toContain('flood-opacity="0.5"');
    expect(svg).toContain('filter="url(#fx-s1)"');
  });

  it('omits the shadow filter when shadow opacity is 0', () => {
    expect(svgOf([createRectangleItem({})])).not.toContain('feDropShadow');
  });

  it('emits a feGaussianBlur filter for blurRadius', () => {
    const svg = svgOf([createRectangleItem({ id: 'b1', blurRadius: 6 })]);
    expect(svg).toMatch(/<feGaussianBlur[^>]*stdDeviation="3"/);
    expect(svg).toContain('filter="url(#fx-b1)"');
  });
});

describe('documentToSvg — opacity and colour alpha', () => {
  it('puts effective opacity on the group and omits it at full opacity', () => {
    expect(svgOf([createRectangleItem({ opacity: 0.4 })])).toContain('opacity="0.4"');
    expect(svgOf([createRectangleItem({ opacity: 1 })])).not.toMatch(/<g[^>]*opacity=/);
  });

  it('splits 8-digit hex into fill + fill-opacity', () => {
    const svg = svgOf([createRectangleItem({ fill: '#ff000080', strokeWidth: 0 })]);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill-opacity="0.502"');
  });
});

describe('documentToSvg — transforms, groups, order', () => {
  it('adds rotate() to the transform for a rotated item', () => {
    const svg = svgOf([createRectangleItem({ x: 10, y: 20, rotation: 30 })]);
    expect(svg).toContain('transform="translate(10 20) rotate(30)"');
  });

  it('composes group opacity down onto leaf items', () => {
    const rect = createRectangleItem({ opacity: 0.5 });
    const group = createGroupNode([rect]);
    group.opacity = 0.5;
    expect(svgOf([group])).toContain('opacity="0.25"');
  });

  it('skips hidden items', () => {
    const svg = svgOf([
      createRectangleItem({ fill: '#abcdef' }),
      createRectangleItem({ fill: '#123456', hidden: true }),
    ]);
    expect(svg).toContain('#abcdef');
    expect(svg).not.toContain('#123456');
  });

  it('skips every descendant of a hidden group', () => {
    const group = createGroupNode([createRectangleItem({ fill: '#654321' })]);
    group.hidden = true;
    expect(svgOf([group])).not.toContain('#654321');
  });

  it('preserves back-to-front document order', () => {
    const svg = svgOf([
      createRectangleItem({ fill: '#aa0000' }),
      createRectangleItem({ fill: '#00bb00' }),
    ]);
    expect(svg.indexOf('#aa0000')).toBeLessThan(svg.indexOf('#00bb00'));
  });
});

describe('documentToSvg — text outlines (font available)', () => {
  it('emits <path> glyphs and no <text> element', () => {
    const svg = svgOf([createTextItem({ text: 'AB' })]);
    expect(svg).toContain('<path d="');
    expect(svg).not.toContain('<text');
    expect(glyphPositions(svg)).toHaveLength(2);
  });

  it('advances consecutive glyphs by the measured width', () => {
    const positions = glyphPositions(svgOf([createTextItem({ text: 'AB' })]));
    expect(positions.map((p) => p.penX)).toEqual([0, 10]);
  });

  it('places the baseline at the font ascent below the line top', () => {
    const positions = glyphPositions(svgOf([createTextItem({ text: 'A' })]));
    expect(positions[0].baselineY).toBeCloseTo(8); // fake fontAscent
  });

  it('adds letterSpacing to the glyph advance', () => {
    const positions = glyphPositions(svgOf([createTextItem({ text: 'AB', letterSpacing: 5 })]));
    expect(positions.map((p) => p.penX)).toEqual([0, 15]);
  });

  it('wraps to a new line at the content width', () => {
    const positions = glyphPositions(
      svgOf([
        createTextItem({
          text: 'AAAA BBBB',
          width: 60,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        }),
      ]),
    );
    const baselines = positions.map((p) => p.baselineY);
    expect(Math.min(...baselines)).toBeCloseTo(8);
    expect(Math.max(...baselines)).toBeCloseTo(8 + 42 * 1.1); // second line one lineHeight down
  });

  it('shifts the line origin for centre and right alignment', () => {
    const left = glyphPositions(svgOf([createTextItem({ text: 'AB', align: 'left' })]))[0].penX;
    const centre = glyphPositions(svgOf([createTextItem({ text: 'AB', align: 'center' })]))[0].penX;
    const right = glyphPositions(svgOf([createTextItem({ text: 'AB', align: 'right' })]))[0].penX;
    expect(left).toBe(0);
    expect(centre).toBeCloseTo((320 - 20) / 2); // contentWidth 320, line width 20
    expect(right).toBeCloseTo(320 - 20);
  });
});

describe('documentToSvg — text fallback (no outline)', () => {
  it('omits the text and records an unvectorizable-text warning with the reason', () => {
    const { svg, warnings } = documentToSvg(
      docWith({ nodes: [createTextItem({ id: 'sys', fontFamily: 'Arial', name: 'Headline' })] }),
      makeSvgDeps({ fontOutlines: nullOutlineProvider }),
    );
    expect(svg).not.toContain('<path');
    expect(svg).not.toContain('<text');
    expect(warnings).toEqual([
      {
        kind: 'unvectorizable-text',
        itemId: 'sys',
        itemName: 'Headline',
        fontFamily: 'Arial',
        reason: 'system-font',
      },
    ]);
  });

  it('falls back per item — outlineable text still renders alongside a system font', () => {
    const mixedProvider: FontOutlineProvider = {
      getOutlineFont: (item) =>
        item.fontFamily === 'Arial'
          ? { ok: false, reason: 'system-font' }
          : { ok: true, font: fakeOutlineFont },
    };
    const { svg, warnings } = documentToSvg(
      docWith({
        nodes: [
          createTextItem({ id: 'ok', text: 'A', fontFamily: 'Audiowide' }),
          createTextItem({ id: 'sys', text: 'B', fontFamily: 'Arial' }),
        ],
      }),
      makeSvgDeps({ fontOutlines: mixedProvider }),
    );
    expect(svg).toContain('<path');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].itemId).toBe('sys');
  });
});

describe('documentToSvg — generator', () => {
  it('embeds the rasterized bitmap as a full-frame <image>', () => {
    const svg = svgOf([createGeneratorItem('scanlines', 800, 600)]);
    expect(svg).toContain('href="data:image/png;base64,STUB"');
    expect(svg).toMatch(/<image[^>]*width="800"[^>]*height="600"/);
  });

  it('calls the rasterizer once per generator and not for other kinds', () => {
    const rasterizer = { rasterizeGenerator: vi.fn(() => 'data:image/png;base64,STUB') };

    documentToSvg(
      docWith({ nodes: [createGeneratorItem('bands', 800, 600), createGeneratorItem('noise', 800, 600)] }),
      makeSvgDeps({ rasterizer }),
    );
    expect(rasterizer.rasterizeGenerator).toHaveBeenCalledTimes(2);

    rasterizer.rasterizeGenerator.mockClear();
    documentToSvg(
      docWith({ nodes: [createRectangleItem({}), createTextItem({ text: 'A' })] }),
      makeSvgDeps({ rasterizer }),
    );
    expect(rasterizer.rasterizeGenerator).not.toHaveBeenCalled();
  });
});
