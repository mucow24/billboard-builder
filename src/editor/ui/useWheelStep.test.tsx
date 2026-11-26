import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { BareNumberInput, NumberInput } from './inspector/inspectorControls';
import { wheelDisplayDigits, wheelStepSize } from './useWheelStep';

const WHEEL_UP = { deltaY: -100 };
const WHEEL_DOWN = { deltaY: 100 };

function Box({
  initial,
  onChange,
  ...props
}: {
  digits?: number;
  initial: number;
  integer?: boolean;
  max?: number;
  min?: number;
  onChange?: (value: number) => void;
  step?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <BareNumberInput
      label="Box"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      {...props}
    />
  );
}

function focusedBox(): HTMLInputElement {
  const input = screen.getByLabelText('Box') as HTMLInputElement;
  input.focus();
  return input;
}

describe('wheelStepSize', () => {
  it('is a step, five steps with Shift and a tenth of a step with Ctrl', () => {
    expect(wheelStepSize(1, { ctrlKey: false, shiftKey: false })).toBe(1);
    expect(wheelStepSize(1, { ctrlKey: false, shiftKey: true })).toBe(5);
    expect(wheelStepSize(1, { ctrlKey: true, shiftKey: false })).toBe(0.1);
    expect(wheelStepSize(0.1, { ctrlKey: true, shiftKey: false })).toBe(0.01);
    expect(wheelStepSize(0.5, { ctrlKey: true, shiftKey: false })).toBe(0.05);
    expect(wheelStepSize(0.001, { ctrlKey: true, shiftKey: false })).toBe(0.0001);
  });

  it('never moves a whole-number field by less than 1', () => {
    expect(wheelStepSize(1, { ctrlKey: true, shiftKey: false }, true)).toBe(1);
    expect(wheelStepSize(1, { ctrlKey: false, shiftKey: true }, true)).toBe(5);
  });
});

describe('wheelDisplayDigits', () => {
  it('adds the decimal place a Ctrl+wheel step needs', () => {
    expect(wheelDisplayDigits(0, 1)).toBe(1);
    expect(wheelDisplayDigits(1, 1)).toBe(1);
    expect(wheelDisplayDigits(1, 0.1)).toBe(2);
    expect(wheelDisplayDigits(1, 0.5)).toBe(2);
    expect(wheelDisplayDigits(3, 0.001)).toBe(4);
  });

  it('leaves a whole-number field as it is', () => {
    expect(wheelDisplayDigits(0, 1, true)).toBe(0);
  });
});

describe('wheel over a number box', () => {
  it('steps the focused box up and down by its step', () => {
    const onChange = vi.fn();
    render(<Box initial={40} digits={0} step={1} onChange={onChange} />);
    const input = focusedBox();

    fireEvent.wheel(input, WHEEL_UP);
    expect(onChange).toHaveBeenLastCalledWith(41);
    expect(input.value).toBe('41');

    fireEvent.wheel(input, WHEEL_DOWN);
    fireEvent.wheel(input, WHEEL_DOWN);
    expect(onChange).toHaveBeenLastCalledWith(39);
    expect(input.value).toBe('39');
  });

  it('steps by five with Shift, which arrives as a sideways scroll', () => {
    render(<Box initial={40} digits={0} step={1} />);
    const input = focusedBox();

    fireEvent.wheel(input, { deltaX: -100, deltaY: 0, shiftKey: true });
    expect(input.value).toBe('45');
    fireEvent.wheel(input, { deltaY: 100, shiftKey: true });
    expect(input.value).toBe('40');
  });

  it('steps by a tenth with Ctrl, shows the extra decimal and cancels the page zoom', () => {
    render(<Box initial={40} digits={0} step={1} />);
    const input = focusedBox();

    const notCancelled = fireEvent.wheel(input, { ...WHEEL_UP, ctrlKey: true });
    expect(notCancelled).toBe(false);
    expect(input.value).toBe('40.1');

    fireEvent.wheel(input, { ...WHEEL_UP, ctrlKey: true });
    fireEvent.wheel(input, { ...WHEEL_UP, ctrlKey: true });
    expect(input.value).toBe('40.3');
  });

  it('shows hundredths in a box that steps by tenths', () => {
    render(<Box initial={0.5} digits={1} step={0.1} />);
    const input = focusedBox();

    fireEvent.wheel(input, { ...WHEEL_DOWN, ctrlKey: true });
    expect(input.value).toBe('0.49');
    fireEvent.wheel(input, WHEEL_UP);
    expect(input.value).toBe('0.59');
  });

  it('moves a whole-number box by 1 with Ctrl', () => {
    render(<Box initial={6} digits={0} step={1} integer />);
    const input = focusedBox();

    fireEvent.wheel(input, { ...WHEEL_UP, ctrlKey: true });
    expect(input.value).toBe('7');
  });

  it('stops at the limits', () => {
    const onChange = vi.fn();
    render(<Box initial={98} digits={0} step={1} min={0} max={100} onChange={onChange} />);
    const input = focusedBox();

    fireEvent.wheel(input, { ...WHEEL_UP, shiftKey: true });
    expect(input.value).toBe('100');
    onChange.mockClear();
    fireEvent.wheel(input, WHEEL_UP);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves a box without focus alone', () => {
    const onChange = vi.fn();
    render(<Box initial={40} onChange={onChange} />);
    const input = screen.getByLabelText('Box') as HTMLInputElement;

    const notCancelled = fireEvent.wheel(input, WHEEL_UP);
    expect(notCancelled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("steps a slider's number box past the slider's range", () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        label="Angle"
        digits={0}
        min={-180}
        max={180}
        textMin={-Infinity}
        textMax={Infinity}
        slider
        step={1}
        value={179}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Angle value') as HTMLInputElement;
    input.focus();

    fireEvent.wheel(input, { ...WHEEL_UP, shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(184);
  });
});
