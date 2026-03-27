import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFavoriteReorder } from './useFavoriteReorder';

function createListRef(itemCount: number) {
  const el = document.createElement('div');
  for (let i = 0; i < itemCount; i++) {
    el.appendChild(document.createElement('div'));
  }
  return { current: el };
}

describe('useFavoriteReorder', () => {
  it('initializes with null drag and drop state', () => {
    const listRef = createListRef(3);
    const { result } = renderHook(() => useFavoriteReorder(listRef, 3, vi.fn()));

    expect(result.current.dragIndex).toBeNull();
    expect(result.current.dropTargetIndex).toBeNull();
  });

  it('keyboard Alt+ArrowDown moves item down', () => {
    const onReorder = vi.fn();
    const listRef = createListRef(3);
    const { result } = renderHook(() => useFavoriteReorder(listRef, 3, onReorder));

    const props = result.current.getDragHandleProps(1);
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    props.onKeyDown(event as unknown as React.KeyboardEvent);

    expect(onReorder).toHaveBeenCalledWith(1, 2);
  });

  it('keyboard Alt+ArrowUp moves item up', () => {
    const onReorder = vi.fn();
    const listRef = createListRef(3);
    const { result } = renderHook(() => useFavoriteReorder(listRef, 3, onReorder));

    const props = result.current.getDragHandleProps(1);
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    props.onKeyDown(event as unknown as React.KeyboardEvent);

    expect(onReorder).toHaveBeenCalledWith(1, 0);
  });

  it('keyboard Alt+ArrowUp is a no-op at index 0', () => {
    const onReorder = vi.fn();
    const listRef = createListRef(3);
    const { result } = renderHook(() => useFavoriteReorder(listRef, 3, onReorder));

    const props = result.current.getDragHandleProps(0);
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    props.onKeyDown(event as unknown as React.KeyboardEvent);

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('keyboard Alt+ArrowDown is a no-op at last index', () => {
    const onReorder = vi.fn();
    const listRef = createListRef(3);
    const { result } = renderHook(() => useFavoriteReorder(listRef, 3, onReorder));

    const props = result.current.getDragHandleProps(2);
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    props.onKeyDown(event as unknown as React.KeyboardEvent);

    expect(onReorder).not.toHaveBeenCalled();
  });
});
