import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCanvasFontDeclaration,
  getCombinedFontStyle,
  getRenderableCanvasFontDeclaration,
  getRenderableCombinedFontStyle,
} from './fontStyles';
import { createTextItem } from '../document/documentDefaults';

interface FontSetMock {
  addEventListener: ReturnType<typeof vi.fn>;
  check?: ReturnType<typeof vi.fn>;
  dispatch: (eventName: string) => void;
}

function createFontSetMock(mockCheck?: ReturnType<typeof vi.fn>): FontSetMock {
  const listeners = new Map<string, Set<() => void>>();

  return {
    addEventListener: vi.fn((eventName: string, listener: () => void) => {
      const current = listeners.get(eventName) ?? new Set<() => void>();
      current.add(listener);
      listeners.set(eventName, current);
    }),
    check: mockCheck,
    dispatch(eventName: string) {
      listeners.get(eventName)?.forEach((listener) => listener());
    },
  };
}

function setFontCheck(mockCheck?: ReturnType<typeof vi.fn>) {
  if (!mockCheck) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {},
    });
    return null;
  }

  const fontSet = createFontSetMock(mockCheck);

  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: fontSet,
  });

  return fontSet;
}

describe('fontStyles', () => {
  afterEach(() => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {},
    });
  });

  it('combines authoring style flags into canvas font styles', () => {
    expect(getCombinedFontStyle('normal', 'normal')).toBe('normal');
    expect(getCombinedFontStyle('normal', 'bold')).toBe('bold');
    expect(getCombinedFontStyle('italic', 'normal')).toBe('italic');
    expect(getCombinedFontStyle('italic', 'bold')).toBe('bold italic');
  });

  it('falls back through available font variants when bold italic is unavailable', () => {
    const check = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    setFontCheck(check);

    const item = createTextItem({
      fontFamily: 'Poster Sans',
      fontStyle: 'italic',
      fontWeight: 'bold',
    });

    expect(getRenderableCombinedFontStyle(item)).toBe('italic');
    expect(check).toHaveBeenCalledWith('italic 700 16px "Poster Sans"');
    expect(check).toHaveBeenCalledWith('italic 400 16px "Poster Sans"');
  });

  it('falls back to normal when the requested bold or italic variants are unavailable', () => {
    const check = vi.fn().mockReturnValue(false);
    setFontCheck(check);

    expect(
      getRenderableCombinedFontStyle(
        createTextItem({ fontFamily: 'Poster Sans', fontWeight: 'bold' })
      )
    ).toBe('normal');
    expect(
      getRenderableCombinedFontStyle(
        createTextItem({ fontFamily: 'Poster Sans', fontStyle: 'italic' })
      )
    ).toBe('normal');
  });

  it('treats missing font availability APIs as permissive', () => {
    setFontCheck();

    const item = createTextItem({
      fontFamily: 'Poster Sans',
      fontStyle: 'italic',
      fontWeight: 'bold',
    });

    expect(getRenderableCombinedFontStyle(item)).toBe('bold italic');
  });

  it('builds exact canvas font declaration strings', () => {
    const item = createTextItem({
      fontFamily: 'Poster Sans',
      fontSize: 72,
      fontStyle: 'italic',
      fontWeight: 'bold',
    });
    const check = vi.fn().mockReturnValue(true);
    setFontCheck(check);

    expect(getCanvasFontDeclaration(item)).toBe('italic bold 72px "Poster Sans"');
    expect(getRenderableCanvasFontDeclaration(item)).toBe('italic bold 72px "Poster Sans"');
  });

  it('caches repeated font variant checks for the same family, weight, and style', () => {
    const check = vi.fn().mockReturnValue(true);
    setFontCheck(check);
    const item = createTextItem({
      fontFamily: 'Poster Sans',
      fontStyle: 'italic',
      fontWeight: 'bold',
    });

    expect(getRenderableCombinedFontStyle(item)).toBe('bold italic');
    expect(getRenderableCombinedFontStyle(item)).toBe('bold italic');
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('clears cached font variant checks when the font set finishes loading', () => {
    const check = vi.fn().mockReturnValue(true);
    const fontSet = setFontCheck(check);
    const item = createTextItem({
      fontFamily: 'Poster Sans',
      fontStyle: 'italic',
      fontWeight: 'bold',
    });

    expect(getRenderableCombinedFontStyle(item)).toBe('bold italic');
    expect(getRenderableCombinedFontStyle(item)).toBe('bold italic');
    expect(check).toHaveBeenCalledTimes(1);

    fontSet?.dispatch('loadingdone');

    expect(getRenderableCombinedFontStyle(item)).toBe('bold italic');
    expect(check).toHaveBeenCalledTimes(2);
  });
});
