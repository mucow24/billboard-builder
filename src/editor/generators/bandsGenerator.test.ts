import { describe, expect, it } from 'vitest';

import type { BandsGeneratorParams } from '../document/documentTypes';

import { bandsGeneratorSpec } from './bandsGenerator';
import { mixColor, mulberry32, rgba } from './colorUtils';

type Call = [string, ...unknown[]];

/** A 2D context that only records what is done to it. */
function createRecordingContext() {
  const calls: Call[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push([name, ...args]);
  };
  const ctx = {
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    getTransform: () => ({ a: 1 }),
    set fillStyle(value: unknown) {
      calls.push(['fillStyle', value]);
    },
    set globalAlpha(value: unknown) {
      calls.push(['globalAlpha', value]);
    },
    set filter(value: unknown) {
      calls.push(['filter', value]);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/**
 * Where each band crosses the item's center line, in the bands' own rotated
 * frame, which has the item's center at 0. The glow, when on, traces the same
 * outline as the band, so only the outlines that are filled at full strength
 * (the last of each pair) are kept.
 */
function bandsAcrossCenterLine(calls: Call[]): { left: number; right: number }[] {
  const outlines: number[][] = [];
  for (const [name, ...args] of calls) {
    if (name === 'moveTo') outlines.push([args[0] as number]);
    if (name === 'lineTo') outlines[outlines.length - 1].push(args[0] as number);
  }
  const glowOn = calls.some(([name]) => name === 'filter');
  const bands = glowOn ? outlines.filter((_, i) => i % 2 === 1) : outlines;
  // Corners run top left, top right, bottom right, bottom left, and the top
  // and bottom ends are equally far from the center line.
  return bands.map(([topLeft, topRight, bottomRight, bottomLeft]) => ({
    left: (topLeft + bottomLeft) / 2,
    right: (topRight + bottomRight) / 2,
  }));
}

function draw(width: number, height: number, params: BandsGeneratorParams, seed: number): Call[] {
  const { ctx, calls } = createRecordingContext();
  bandsGeneratorSpec.draw(ctx, width, height, params, seed);
  return calls;
}

/**
 * The bands as they were drawn before they were centered on the item, kept
 * here unchanged: layers saved back then must still be drawn exactly this way.
 */
function drawBandsBeforeCentering(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: BandsGeneratorParams,
  rng: () => number,
): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((params.stripeAngle * Math.PI) / 180);
  const span = Math.hypot(w, h) * 1.6;
  const start = -span / 2;
  const nominal = params.stripeThickness;
  let cursor = start - span * params.stripeOffset;
  for (let i = 0; i < params.stripeCount; i++) {
    const jitter = (rng() - 0.5) * nominal * params.stripeSpacingJitter * 2;
    const thickness = Math.max(4, nominal + jitter);
    const skew = (rng() - 0.5) * span * params.stripeSkew;
    const t = i / Math.max(1, params.stripeCount - 1);
    const color = mixColor(
      params.bandColorA,
      params.bandColorB,
      Math.pow(t, Math.max(0.01, params.stripeContrast)),
    );
    if (params.stripeGlow > 0) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = params.stripeGlow;
      const physicalScale = ctx.getTransform().a;
      ctx.filter = `blur(${Math.max(1, thickness * 0.35) * physicalScale}px)`;
      ctx.beginPath();
      ctx.moveTo(cursor, -span / 2);
      ctx.lineTo(cursor + thickness, -span / 2);
      ctx.lineTo(cursor + thickness + skew, span / 2);
      ctx.lineTo(cursor + skew, span / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cursor, -span / 2);
    ctx.lineTo(cursor + thickness, -span / 2);
    ctx.lineTo(cursor + thickness + skew, span / 2);
    ctx.lineTo(cursor + skew, span / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(params.shadowColor, 0.18);
    ctx.fillRect(cursor + thickness - 4, -span / 2, 6, span);
    cursor += thickness;
  }
  ctx.restore();
}

const SIZES: [number, number][] = [
  [2048, 2048],
  [1920, 1080],
  [4800, 1400],
  [1400, 4800],
  [320, 180],
];
const SEEDS = [0, 1, 123456789, 0xffffffff];

describe('bandsGeneratorSpec', () => {
  it('defaults to centered bands with no offset', () => {
    expect(bandsGeneratorSpec.createDefaultParams()).toMatchObject({
      stripeOffset: 0,
      stripeCentered: true,
    });
  });

  it.each([
    ['the default settings', {}],
    ['the strongest skew', { stripeSkew: 3 }],
    ['the widest jitter', { stripeSpacingJitter: 5 }],
    ['many thick bands', { stripeCount: 64, stripeThickness: 220 }],
    ['level bands', { stripeAngle: 90 }],
    ['two bands', { stripeCount: 2 }],
  ])('lays %s side by side across the middle of the item, centered on it', (_, overrides) => {
    for (const [width, height] of SIZES) {
      for (const seed of SEEDS) {
        const params = { ...bandsGeneratorSpec.createDefaultParams(), ...overrides };
        const bands = bandsAcrossCenterLine(draw(width, height, params, seed));

        expect(bands).toHaveLength(params.stripeCount);
        for (let i = 1; i < bands.length; i++) {
          expect(bands[i].left).toBeCloseTo(bands[i - 1].right, 6);
        }
        const left = bands[0].left;
        const right = bands[bands.length - 1].right;
        expect(left).toBeLessThan(0);
        expect(right).toBeGreaterThan(0);
        expect(left + right).toBeCloseTo(0, 6);
      }
    }
  });

  it('slides the bands by Band Offset, in parts of 1.6 times the item\'s diagonal', () => {
    const params = { ...bandsGeneratorSpec.createDefaultParams(), stripeOffset: 0.25 };

    const bands = bandsAcrossCenterLine(draw(1920, 1080, params, 7));

    const middle = (bands[0].left + bands[bands.length - 1].right) / 2;
    expect(middle).toBeCloseTo(-0.25 * 1.6 * Math.hypot(1920, 1080), 6);
  });

  it.each([
    ['the old default settings', { stripeOffset: 0.1 }],
    ['an offset that brought them into view', { stripeOffset: -0.4 }],
    ['no glow and a strong skew', { stripeGlow: 0, stripeSkew: 2.5, stripeCount: 5 }],
    ['a band count that is not a whole number', { stripeCount: 3.5 }],
  ])('draws bands saved before they were centered exactly as before, with %s', (_, overrides) => {
    const params: BandsGeneratorParams = {
      ...bandsGeneratorSpec.createDefaultParams(),
      ...overrides,
      stripeCentered: false,
    };
    for (const [width, height] of SIZES) {
      for (const seed of SEEDS) {
        const before = createRecordingContext();
        drawBandsBeforeCentering(before.ctx, width, height, params, mulberry32(seed));

        expect(draw(width, height, params, seed)).toEqual(before.calls);
      }
    }
  });
});
