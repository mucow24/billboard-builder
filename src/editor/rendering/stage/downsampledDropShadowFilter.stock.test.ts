import { DropShadowFilter } from 'pixi-filters';
import { describe, expect, it } from 'vitest';

import { DownsampledDropShadowFilter } from './downsampledDropShadowFilter';

/**
 * `DownsampledDropShadowFilter` borrows two passes that pixi-filters keeps
 * private, and its `apply` stands in for the stock one. Its own tests mock
 * pixi-filters, so they would still pass if an upgrade renamed either pass.
 * This one runs against the real package: when it fails, read
 * `DropShadowFilter.apply` in the new version and bring
 * `DownsampledDropShadowFilter.apply` in line with it.
 */
describe('the pixi-filters drop shadow that DownsampledDropShadowFilter is built on', () => {
  it.each([
    ['the stock filter', () => new DropShadowFilter()],
    ['the downsampling filter', () => new DownsampledDropShadowFilter()],
  ])('%s has the blur and copy passes under the names used', (_name, create) => {
    const passes = create() as unknown as {
      _blurFilter?: { apply?: unknown };
      _basePass?: { apply?: unknown };
    };

    expect(typeof passes._blurFilter?.apply, '_blurFilter.apply').toBe('function');
    expect(typeof passes._basePass?.apply, '_basePass.apply').toBe('function');
  });

  it('takes its blur strength and shadow-only switch from the properties read here', () => {
    const filter = new DropShadowFilter({ blur: 7, shadowOnly: true });

    expect(filter.blur).toBe(7);
    expect(filter.shadowOnly).toBe(true);
  });
});
