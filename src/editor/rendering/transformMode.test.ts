import { describe, expect, it } from 'vitest';

import { shouldApplyLiveTransform } from './transformMode';

describe('transform mode helpers', () => {
  it('applies live updates for resize handles but not the rotation handle', () => {
    expect(shouldApplyLiveTransform('top-left')).toBe(true);
    expect(shouldApplyLiveTransform('middle-right')).toBe(true);
    expect(shouldApplyLiveTransform('rotater')).toBe(false);
    expect(shouldApplyLiveTransform(null)).toBe(false);
  });
});
