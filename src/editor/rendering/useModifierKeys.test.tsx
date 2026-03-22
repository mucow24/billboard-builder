import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useModifierKeys } from './useModifierKeys';

describe('useModifierKeys', () => {
  it('lets explicit false overrides clear a tracked pressed modifier', () => {
    const { result } = renderHook(() => useModifierKeys());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Shift',
          shiftKey: true,
        }),
      );
    });

    expect(result.current.resolveModifierKeys({ shiftKey: false }).shiftKey).toBe(false);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Shift',
        }),
      );
    });
  });
});
