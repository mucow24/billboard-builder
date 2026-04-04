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
      fillLinearGradientEndPoint: { x: 0, y: 40 },
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillPriority: 'linear-gradient',
    });
    expect(buildGradientFillProps(ellipse, { width: 120, height: 70 })).toEqual({
      fillLinearGradientColorStops: [0, '#123456ff', 1, '#fedcbaff'],
      fillLinearGradientEndPoint: { x: 0, y: 70 },
      fillLinearGradientStartPoint: { x: 0, y: 0 },
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
      fillLinearGradientEndPoint: { x: 0, y: 84 },
      fillLinearGradientStartPoint: { x: 0, y: -12 },
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
      fillLinearGradientEndPoint: { x: 0, y: 100 },
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillPriority: 'linear-gradient',
    });
  });

  it('returns no gradient props when the item stays in solid-fill mode', () => {
    const rectangle = createRectangleItem({
      gradientEnabled: false,
    });

    expect(buildGradientFillProps(rectangle, { width: 80, height: 40 })).toBeNull();
  });
});
