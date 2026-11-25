import type { Container, Filter } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import {
  configureZoomScaledFilter,
  configureZoomScaledFilters,
  registerZoomScaledFilter,
} from './zoomScaledFilters';

const fakeFilter = () => ({}) as Filter;

function fakeContainer(filters: Filter[] | Filter | null, children: Container[] = []): Container {
  return { filters, children } as unknown as Container;
}

describe('registerZoomScaledFilter', () => {
  it('returns the filter and does not configure it yet', () => {
    const filter = fakeFilter();
    const configure = vi.fn();

    expect(registerZoomScaledFilter(filter, configure)).toBe(filter);
    expect(configure).not.toHaveBeenCalled();
  });
});

describe('configureZoomScaledFilter', () => {
  it('configures a registered filter, for the screen unless told otherwise', () => {
    const configure = vi.fn();
    const filter = registerZoomScaledFilter(fakeFilter(), configure);

    expect(configureZoomScaledFilter(filter, 2, 1.5)).toBe(true);
    expect(configure).toHaveBeenLastCalledWith(2, 1.5, 'screen');

    expect(configureZoomScaledFilter(filter, 1, 1, 'export')).toBe(true);
    expect(configure).toHaveBeenLastCalledWith(1, 1, 'export');
  });

  it('leaves a filter alone that was never registered', () => {
    expect(configureZoomScaledFilter(fakeFilter(), 2, 1)).toBe(false);
  });
});

describe('configureZoomScaledFilters', () => {
  it('configures every registered filter under a container and counts them', () => {
    const onRoot = vi.fn();
    const onChild = vi.fn();
    const onGrandchild = vi.fn();
    const root = fakeContainer(
      [registerZoomScaledFilter(fakeFilter(), onRoot), fakeFilter()],
      [
        fakeContainer(null),
        fakeContainer(registerZoomScaledFilter(fakeFilter(), onChild), [
          fakeContainer([registerZoomScaledFilter(fakeFilter(), onGrandchild)]),
        ]),
      ],
    );

    expect(configureZoomScaledFilters(root, 1, 2, 'export')).toBe(3);
    for (const configure of [onRoot, onChild, onGrandchild]) {
      expect(configure).toHaveBeenCalledTimes(1);
      expect(configure).toHaveBeenCalledWith(1, 2, 'export');
    }

    expect(configureZoomScaledFilters(root, 3, 1.25)).toBe(3);
    expect(onGrandchild).toHaveBeenLastCalledWith(3, 1.25, 'screen');
  });
});
