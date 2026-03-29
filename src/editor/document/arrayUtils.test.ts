import { describe, expect, it } from 'vitest';

import { moveArrayItem } from './arrayUtils';

describe('moveArrayItem', () => {
  it('moves an item forward in the array', () => {
    expect(moveArrayItem(['A', 'B', 'C', 'D'], 0, 2)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('moves an item backward in the array', () => {
    expect(moveArrayItem(['A', 'B', 'C', 'D'], 3, 1)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('returns unchanged array when fromIndex equals toIndex', () => {
    const input = ['A', 'B', 'C'];
    expect(moveArrayItem(input, 1, 1)).toEqual(['A', 'B', 'C']);
  });

  it('returns unchanged array when indices are out of bounds', () => {
    const input = ['A', 'B'];
    expect(moveArrayItem(input, -1, 0)).toEqual(['A', 'B']);
    expect(moveArrayItem(input, 0, 5)).toEqual(['A', 'B']);
  });

  it('handles moving to the last position', () => {
    expect(moveArrayItem(['A', 'B', 'C'], 0, 2)).toEqual(['B', 'C', 'A']);
  });

  it('handles a single-element array', () => {
    expect(moveArrayItem(['A'], 0, 0)).toEqual(['A']);
  });
});
