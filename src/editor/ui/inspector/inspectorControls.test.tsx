import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NumberInput } from './inspectorControls';

describe('NumberInput text vs slider clamping', () => {
  it('clamps text input to textMin/textMax on blur, not slider min/max', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <NumberInput
        label="Band Count"
        min={2}
        max={64}
        textMin={1}
        textMax={Infinity}
        slider={true}
        step={1}
        value={50}
        onChange={onChange}
      />,
    );

    const textInput = getByLabelText('Band Count value');

    // Typing 500 — beyond slider max (64) but textMax is Infinity, so accepted
    fireEvent.change(textInput, { target: { value: '500' } });
    fireEvent.blur(textInput);
    expect(onChange).toHaveBeenLastCalledWith(500);

    // Typing -5 — below textMin (1), so clamped to 1
    fireEvent.change(textInput, { target: { value: '-5' } });
    fireEvent.blur(textInput);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('does not call onChange while typing, only on blur', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <NumberInput
        label="Band Count"
        min={2}
        max={64}
        textMin={1}
        textMax={Infinity}
        slider={true}
        step={1}
        value={50}
        onChange={onChange}
      />,
    );

    const textInput = getByLabelText('Band Count value');

    fireEvent.focus(textInput);
    fireEvent.change(textInput, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(textInput, { target: { value: '5' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(textInput);
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('falls back to min/max when textMin/textMax absent', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <NumberInput
        label="Opacity"
        min={0}
        max={100}
        slider={true}
        step={1}
        value={50}
        onChange={onChange}
      />,
    );

    const textInput = getByLabelText('Opacity value');

    // Typing 150 — beyond max (100), clamped because no textMax override
    fireEvent.change(textInput, { target: { value: '150' } });
    fireEvent.blur(textInput);
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('keeps slider range on min/max regardless of textMin/textMax', () => {
    const { getByLabelText } = render(
      <NumberInput
        label="Band Count"
        min={2}
        max={64}
        textMin={1}
        textMax={Infinity}
        slider={true}
        step={1}
        value={50}
        onChange={() => {}}
      />,
    );

    const slider = getByLabelText('Band Count') as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('2');
    expect(slider.max).toBe('64');
  });
});
