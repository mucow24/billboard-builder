import { describe, expect, it } from 'vitest';

import { reorderItemsBySelection } from './reorderItems';
import {
  createEllipseItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';

describe('reorderItemsBySelection', () => {
  it('returns the current order when nothing is selected', () => {
    const first = createTextItem({ id: 'first', zIndex: 2 });
    const second = createRectangleItem({ id: 'second', zIndex: 0 });
    const third = createEllipseItem({ id: 'third', zIndex: 1 });

    const result = reorderItemsBySelection([first, second, third], [], 'front');

    expect(result.map((item) => item.id)).toEqual(['second', 'third', 'first']);
    expect(result.map((item) => item.zIndex)).toEqual([0, 1, 2]);
  });

  it('moves selected items to the front while preserving their relative order', () => {
    const first = createTextItem({ id: 'first', zIndex: 0 });
    const second = createRectangleItem({ id: 'second', zIndex: 1 });
    const third = createEllipseItem({ id: 'third', zIndex: 2 });

    const result = reorderItemsBySelection([first, second, third], ['first', 'third'], 'front');

    expect(result.map((item) => item.id)).toEqual(['second', 'first', 'third']);
    expect(result.map((item) => item.zIndex)).toEqual([0, 1, 2]);
  });

  it('moves selected items to the back while preserving their relative order', () => {
    const first = createTextItem({ id: 'first', zIndex: 0 });
    const second = createRectangleItem({ id: 'second', zIndex: 1 });
    const third = createEllipseItem({ id: 'third', zIndex: 2 });

    const result = reorderItemsBySelection([first, second, third], ['second', 'third'], 'back');

    expect(result.map((item) => item.id)).toEqual(['second', 'third', 'first']);
    expect(result.map((item) => item.zIndex)).toEqual([0, 1, 2]);
  });

  it('moves selected items one step forward across unselected neighbors', () => {
    const first = createTextItem({ id: 'first', zIndex: 0 });
    const second = createRectangleItem({ id: 'second', zIndex: 1 });
    const third = createEllipseItem({ id: 'third', zIndex: 2 });
    const fourth = createRectangleItem({ id: 'fourth', zIndex: 3 });

    const result = reorderItemsBySelection(
      [first, second, third, fourth],
      ['second', 'third'],
      'forward'
    );

    expect(result.map((item) => item.id)).toEqual(['first', 'fourth', 'second', 'third']);
  });

  it('moves selected items one step backward across unselected neighbors', () => {
    const first = createTextItem({ id: 'first', zIndex: 0 });
    const second = createRectangleItem({ id: 'second', zIndex: 1 });
    const third = createEllipseItem({ id: 'third', zIndex: 2 });
    const fourth = createRectangleItem({ id: 'fourth', zIndex: 3 });

    const result = reorderItemsBySelection(
      [first, second, third, fourth],
      ['second', 'third'],
      'backward'
    );

    expect(result.map((item) => item.id)).toEqual(['second', 'third', 'first', 'fourth']);
  });
});
