import { describe, expect, it } from 'vitest';

import {
  createEllipseItem,
  createNgonItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import { buildGradientFillProps } from './gradientFill';

describe('gradientFill', () => {
  it('derives a vertical item-local gradient for rectangle and ellipse items', () => {
    const rectangle = createRectangleItem({
      fill: '#112233ff',
      secondaryFill: '#aabbccff',
      gradientEnabled: true,
      width: 80,
      height: 40,
    });
    const ellipse = createEllipseItem({
      fill: '#123456ff',
      secondaryFill: '#fedcbaff',
      gradientEnabled: true,
      width: 120,
      height: 70,
    });

    expect(buildGradientFillProps(rectangle, { width: 80, height: 40 })).toEqual({
      fillLinearGradientColorStops: [0, '#112233ff', 1, '#aabbccff'],
      fillLinearGradientStartPoint: { x: 40, y: 0 },
      fillLinearGradientEndPoint: { x: 40, y: 40 },
      fillPriority: 'linear-gradient',
    });
    expect(buildGradientFillProps(ellipse, { width: 120, height: 70 })).toEqual({
      fillLinearGradientColorStops: [0, '#123456ff', 1, '#fedcbaff'],
      fillLinearGradientStartPoint: { x: 60, y: 0 },
      fillLinearGradientEndPoint: { x: 60, y: 70 },
      fillPriority: 'linear-gradient',
    });
  });

  it('anchors text gradients to the full text item frame instead of its padding box', () => {
    const text = createTextItem({
      fill: '#ffffff',
      secondaryFill: '#ff0000',
      gradientEnabled: true,
      width: 320,
      height: 96,
      padding: { top: 12, right: 18, bottom: 24, left: 30 },
    });

    expect(buildGradientFillProps(text, { width: 320, height: 96 })).toEqual({
      fillLinearGradientColorStops: [0, '#ffffff', 1, '#ff0000'],
      fillLinearGradientStartPoint: { x: 160, y: -12 },
      fillLinearGradientEndPoint: { x: 160, y: 84 },
      fillPriority: 'linear-gradient',
    });
  });

  it('derives a vertical gradient for ngon items', () => {
    const ngon = createNgonItem({
      fill: '#8b5cf6ff',
      secondaryFill: '#6d28d9ff',
      gradientEnabled: true,
      width: 100,
      height: 100,
    });

    expect(buildGradientFillProps(ngon, { width: 100, height: 100 })).toEqual({
      fillLinearGradientColorStops: [0, '#8b5cf6ff', 1, '#6d28d9ff'],
      fillLinearGradientStartPoint: { x: 50, y: 0 },
      fillLinearGradientEndPoint: { x: 50, y: 100 },
      fillPriority: 'linear-gradient',
    });
  });

  it('rotates gradient to left-to-right at 90 degrees', () => {
    const rectangle = createRectangleItem({
      fill: '#ff0000',
      secondaryFill: '#0000ff',
      gradientEnabled: true,
      gradientAngle: 90,
      width: 100,
      height: 60,
    });

    const result = buildGradientFillProps(rectangle, { width: 100, height: 60 })!;
    expect(result.fillLinearGradientColorStops).toEqual([0, '#ff0000', 1, '#0000ff']);
    expect(result.fillLinearGradientStartPoint.x).toBeCloseTo(0);
    expect(result.fillLinearGradientStartPoint.y).toBeCloseTo(30);
    expect(result.fillLinearGradientEndPoint.x).toBeCloseTo(100);
    expect(result.fillLinearGradientEndPoint.y).toBeCloseTo(30);
    expect(result.fillPriority).toBe('linear-gradient');
  });

  it('rotates gradient to right-to-left at -90 degrees', () => {
    const rectangle = createRectangleItem({
      fill: '#ff0000',
      secondaryFill: '#0000ff',
      gradientEnabled: true,
      gradientAngle: -90,
      width: 100,
      height: 60,
    });

    const result = buildGradientFillProps(rectangle, { width: 100, height: 60 })!;
    expect(result.fillLinearGradientStartPoint.x).toBeCloseTo(100);
    expect(result.fillLinearGradientStartPoint.y).toBeCloseTo(30);
    expect(result.fillLinearGradientEndPoint.x).toBeCloseTo(0);
    expect(result.fillLinearGradientEndPoint.y).toBeCloseTo(30);
  });

  it('rotates gradient diagonally at 45 degrees on a square', () => {
    const rectangle = createRectangleItem({
      fill: '#ff0000',
      secondaryFill: '#0000ff',
      gradientEnabled: true,
      gradientAngle: 45,
      width: 100,
      height: 100,
    });

    const result = buildGradientFillProps(rectangle, { width: 100, height: 100 })!;
    expect(result.fillLinearGradientStartPoint.x).toBeCloseTo(0);
    expect(result.fillLinearGradientStartPoint.y).toBeCloseTo(0);
    expect(result.fillLinearGradientEndPoint.x).toBeCloseTo(100);
    expect(result.fillLinearGradientEndPoint.y).toBeCloseTo(100);
  });

  it('returns no gradient props when the item stays in solid-fill mode', () => {
    const rectangle = createRectangleItem({
      gradientEnabled: false,
    });

    expect(buildGradientFillProps(rectangle, { width: 80, height: 40 })).toBeNull();
  });
});
