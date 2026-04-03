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

  it('does not commit empty or NaN drafts until blur reverts them', () => {
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
    // Empty value — not committed on change
    fireEvent.change(textInput, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();

    // Blur with empty draft — reverts, no onChange
    fireEvent.blur(textInput);
    expect(onChange).not.toHaveBeenCalled();
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

  it('commits immediately when step arrows are clicked', () => {
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

    // Step-arrow clicks produce events without inputType.
    // fireEvent.change in jsdom also lacks inputType, so it exercises this path.
    fireEvent.change(textInput, { target: { value: '51' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(51);
  });

  it('does not commit empty or invalid values on change', () => {
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

    fireEvent.change(textInput, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(textInput, { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();
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
