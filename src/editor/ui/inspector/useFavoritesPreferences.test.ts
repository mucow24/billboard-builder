import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FAVORITES_PREFERENCES_STORAGE_KEY,
  loadFavoritesPreferences,
  saveFavoritesPreferences,
  useFavoritesPreferences,
} from './useFavoritesPreferences';

const KEY = FAVORITES_PREFERENCES_STORAGE_KEY;

describe('loadFavoritesPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns defaults when the store is empty', () => {
    expect(loadFavoritesPreferences()).toEqual({
      sortField: 'manual',
      sortDirection: 'asc',
    });
  });

  it('round-trips a saved value', () => {
    saveFavoritesPreferences({ sortField: 'name', sortDirection: 'desc' });
    expect(loadFavoritesPreferences()).toEqual({
      sortField: 'name',
      sortDirection: 'desc',
    });
  });

  it('returns defaults and clears the key when the stored JSON is malformed', () => {
    window.localStorage.setItem(KEY, '{ not valid json');
    expect(loadFavoritesPreferences()).toEqual({
      sortField: 'manual',
      sortDirection: 'asc',
    });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('returns defaults when the stored value has an unknown sortField', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, sortField: 'size', sortDirection: 'asc' }),
    );
    expect(loadFavoritesPreferences()).toEqual({
      sortField: 'manual',
      sortDirection: 'asc',
    });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('returns defaults when the stored value has the wrong version', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ version: 2, sortField: 'name', sortDirection: 'asc' }),
    );
    expect(loadFavoritesPreferences()).toEqual({
      sortField: 'manual',
      sortDirection: 'asc',
    });
  });
});

describe('useFavoritesPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('lazily hydrates from localStorage on first mount', () => {
    saveFavoritesPreferences({ sortField: 'color', sortDirection: 'desc' });
    const { result } = renderHook(() => useFavoritesPreferences());
    expect(result.current.sortField).toBe('color');
    expect(result.current.sortDirection).toBe('desc');
  });

  it('falls back to defaults when storage is empty', () => {
    const { result } = renderHook(() => useFavoritesPreferences());
    expect(result.current.sortField).toBe('manual');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('persists setSortField updates back to localStorage', () => {
    const { result } = renderHook(() => useFavoritesPreferences());
    act(() => {
      result.current.setSortField('name');
    });
    expect(result.current.sortField).toBe('name');
    expect(loadFavoritesPreferences().sortField).toBe('name');
  });

  it('persists setSortDirection updates back to localStorage', () => {
    const { result } = renderHook(() => useFavoritesPreferences());
    act(() => {
      result.current.setSortDirection('desc');
    });
    expect(result.current.sortDirection).toBe('desc');
    expect(loadFavoritesPreferences().sortDirection).toBe('desc');
  });

  it('a fresh mount after set reads the updated value (simulates tab-switch remount)', () => {
    const first = renderHook(() => useFavoritesPreferences());
    act(() => {
      first.result.current.setSortField('parts');
      first.result.current.setSortDirection('desc');
    });
    first.unmount();

    const second = renderHook(() => useFavoritesPreferences());
    expect(second.result.current.sortField).toBe('parts');
    expect(second.result.current.sortDirection).toBe('desc');
  });
});
