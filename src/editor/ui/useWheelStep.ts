import { useEffect, type RefObject } from 'react';

/** Shift+wheel changes a number box by this many steps. */
export const WHEEL_COARSE_FACTOR = 5;
/** Ctrl+wheel changes a number box by this share of a step. */
export const WHEEL_FINE_FACTOR = 0.1;

function countDecimals(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const [mantissa, exponent] = String(value).split('e');
  const decimals = (mantissa.split('.')[1] ?? '').length;
  return Math.max(0, decimals - Number(exponent ?? 0));
}

/** A tenth of `step`, without the noise binary fractions add (0.1 * 0.1). */
function fineStepOf(step: number): number {
  return Number((step * WHEEL_FINE_FACTOR).toFixed(countDecimals(step) + 1));
}

/**
 * Decimal places a number box shows: at least `digits`, and enough for the
 * value a Ctrl+wheel step leaves. A whole-number field has no finer step.
 */
export function wheelDisplayDigits(digits: number, step: number, integer = false): number {
  if (integer || !Number.isFinite(step) || step <= 0) {
    return digits;
  }
  return Math.max(digits, countDecimals(fineStepOf(step)));
}

interface WheelModifiers {
  ctrlKey: boolean;
  shiftKey: boolean;
}

/**
 * How far one wheel notch moves the value: a step, five with Shift, a tenth
 * with Ctrl. A whole-number field never moves by less than 1.
 */
export function wheelStepSize(step: number, modifiers: WheelModifiers, integer = false): number {
  if (modifiers.ctrlKey) {
    const fine = fineStepOf(step);
    return integer ? Math.max(1, Math.round(fine)) : fine;
  }
  if (modifiers.shiftKey) {
    return step * WHEEL_COARSE_FACTOR;
  }
  return step;
}

interface WheelStepOptions {
  /** Decimal places the stepped value is rounded to. */
  digits: number;
  integer?: boolean;
  max?: number;
  min?: number;
  onStep: (value: number) => void;
  step: number;
}

/**
 * Step a focused number box with the mouse wheel. This replaces the browser's
 * own wheel stepping, which has no modifiers: Ctrl+wheel would zoom the page
 * and Shift+wheel would scroll sideways. A box without focus is left alone, so
 * the wheel still scrolls the panel under the pointer.
 */
export function useWheelStep(
  inputRef: RefObject<HTMLInputElement | null>,
  { digits, integer = false, max, min, onStep, step }: WheelStepOptions,
): void {
  // No dependency list: the listener is cheap to swap and always sees the
  // current props. It is native because React's wheel listener is passive and
  // cannot cancel the page zoom.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return undefined;
    }

    function handleWheel(event: WheelEvent) {
      if (!input || document.activeElement !== input || input.disabled || input.readOnly) {
        return;
      }
      // Shift turns the wheel into a sideways scroll on Windows and Linux.
      const delta = event.deltaY || event.deltaX;
      if (delta === 0) {
        return;
      }
      event.preventDefault();

      const current = Number(input.value);
      if (input.value === '' || Number.isNaN(current)) {
        return;
      }
      const size = wheelStepSize(step, event, integer);
      let next = Number((current + (delta < 0 ? size : -size)).toFixed(digits));
      if (min !== undefined) {
        next = Math.max(min, next);
      }
      if (max !== undefined) {
        next = Math.min(max, next);
      }
      if (next !== current) {
        onStep(next);
      }
    }

    input.addEventListener('wheel', handleWheel, { passive: false });
    return () => input.removeEventListener('wheel', handleWheel);
  });
}
