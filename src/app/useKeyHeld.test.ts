import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useKeyHeld } from './useKeyHeld';

function fireKeyDown(key: string, options: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...options });
  window.dispatchEvent(event);
  return event;
}

function fireKeyUp(key: string) {
  const event = new KeyboardEvent('keyup', { key, bubbles: true });
  window.dispatchEvent(event);
  return event;
}

describe('useKeyHeld', () => {
  describe('spacebar', () => {
    it('returns false initially', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      expect(result.current).toBe(false);
    });

    it('returns true while space is held down', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      act(() => { fireKeyDown(' '); });
      expect(result.current).toBe(true);
    });

    it('returns false after space is released', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      act(() => { fireKeyDown(' '); });
      act(() => { fireKeyUp(' '); });
      expect(result.current).toBe(false);
    });

    it('ignores repeat events', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      act(() => { fireKeyDown(' '); });
      expect(result.current).toBe(true);
      act(() => { fireKeyDown(' ', { repeat: true }); });
      expect(result.current).toBe(true);
    });

    it('ignores space when target is an input element', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        act(() => {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        });
        expect(result.current).toBe(false);
      } finally {
        input.remove();
      }
    });

    it('ignores space when target is a textarea element', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      try {
        act(() => {
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        });
        expect(result.current).toBe(false);
      } finally {
        textarea.remove();
      }
    });

    it('ignores space when target has data-editor-interactive', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      const div = document.createElement('div');
      div.setAttribute('data-editor-interactive', 'true');
      document.body.appendChild(div);
      try {
        act(() => {
          div.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        });
        expect(result.current).toBe(false);
      } finally {
        div.remove();
      }
    });

    it('resets on window blur', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      act(() => { fireKeyDown(' '); });
      expect(result.current).toBe(true);
      act(() => { window.dispatchEvent(new Event('blur')); });
      expect(result.current).toBe(false);
    });

    it('ignores non-space keys', () => {
      const { result } = renderHook(() => useKeyHeld(' '));
      act(() => { fireKeyDown('a'); });
      expect(result.current).toBe(false);
    });
  });

  describe('letter key', () => {
    it('tracks a letter key hold', () => {
      const { result } = renderHook(() => useKeyHeld('b'));
      expect(result.current).toBe(false);
      act(() => { fireKeyDown('b'); });
      expect(result.current).toBe(true);
      act(() => { fireKeyUp('b'); });
      expect(result.current).toBe(false);
    });

    it('matches case-insensitively', () => {
      const { result } = renderHook(() => useKeyHeld('b'));
      act(() => { fireKeyDown('B'); });
      expect(result.current).toBe(true);
      act(() => { fireKeyUp('B'); });
      expect(result.current).toBe(false);
    });
  });
});
