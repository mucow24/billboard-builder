import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ColorPickerControl } from './ColorPickerControl';
import { computePickerPosition } from './colorPickerPosition';

vi.mock('@uiw/react-color', async () => {
  const actual =
    await vi.importActual<typeof import('@uiw/react-color')>(
      '@uiw/react-color',
    );
  return {
    ...actual,
    Wheel: ({
      onChange,
      ...props
    }: {
      onChange?: (color: { hexa: string }) => void;
    }) => (
      <button
        type="button"
        {...props}
        onClick={() => onChange?.({ hexa: '#12345678' })}
      >
        Mock wheel
      </button>
    ),
  };
});

describe('ColorPickerControl', () => {
  it('toggles the inline picker open and closed', async () => {
    const user = userEvent.setup();

    render(
      <ColorPickerControl label="Fill" value="#33669980" onChange={vi.fn()} />,
    );

    expect(screen.queryByLabelText('Fill hex')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /fill/i }));
    expect(screen.getByLabelText('Fill hex')).toHaveValue('#33669980');

    await user.click(screen.getByRole('button', { name: /fill/i }));
    expect(screen.queryByLabelText('Fill hex')).not.toBeInTheDocument();
  });

  it('commits valid hex input on enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ColorPickerControl label="Fill" value="#33669980" onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: /fill/i }));
    const input = screen.getByLabelText('Fill hex');

    await user.clear(input);
    await user.type(input, '#abcdef33{Enter}');

    expect(onChange).toHaveBeenCalledWith('#abcdef33');
    expect(screen.queryByLabelText('Fill hex')).not.toBeInTheDocument();
  });

  it('reverts invalid hex input on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ColorPickerControl label="Fill" value="#33669980" onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: /fill/i }));
    const input = screen.getByLabelText('Fill hex');

    await user.clear(input);
    await user.type(input, 'nope');
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Fill hex')).not.toBeInTheDocument();
  });

  it('updates the stored color from the HSL sliders', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ColorPickerControl label="Fill" value="#ff000080" onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: /fill/i }));
    fireEvent.change(screen.getByLabelText('Fill hue'), {
      target: { value: '120' },
    });

    expect(onChange).toHaveBeenCalledWith('#00ff0080');
  });

  it('adapts wheel changes to the stored hex format', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ColorPickerControl label="Fill" value="#33669980" onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: /fill/i }));
    await user.click(screen.getByRole('button', { name: 'Mock wheel' }));

    expect(onChange).toHaveBeenCalledWith('#12345678');
  });

  it('supports a compact trigger variant without the inline label copy', async () => {
    const user = userEvent.setup();

    render(
      <ColorPickerControl
        label="Canvas background"
        value="#33669980"
        onChange={vi.fn()}
        variant="compact"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Canvas background' });
    expect(trigger).toHaveClass('color-picker-trigger-compact');
    expect(screen.queryByText('Canvas background')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByLabelText('Canvas background hex')).toHaveValue('#33669980');
  });

  it('opens the picker and accepts color changes in inline mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ColorPickerControl
        label="Canvas background"
        value="#33669980"
        onChange={onChange}
        variant="compact"
        inline
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Canvas background' }));
    const input = screen.getByLabelText('Canvas background hex');
    expect(input).toHaveValue('#33669980');

    await user.clear(input);
    await user.type(input, '#aabbccff{Enter}');
    expect(onChange).toHaveBeenCalledWith('#aabbccff');
  });

  it('closes the picker when clicking outside the control', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <ColorPickerControl label="Fill" value="#33669980" onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /fill/i }));
    expect(screen.getByLabelText('Fill hex')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByLabelText('Fill hex')).not.toBeInTheDocument();
  });
});

describe('computePickerPosition', () => {
  const trigger = { top: 100, bottom: 130, left: 700, right: 800 };

  it('opens below the trigger when there is room', () => {
    const pos = computePickerPosition(trigger, 400, 1200, 900);
    expect(pos).toEqual({ top: 130, right: 400 });
  });

  it('opens to the left when the panel would overflow the bottom', () => {
    const pos = computePickerPosition(trigger, 400, 1200, 500);
    expect(pos).toEqual({ top: 100, right: 504 });
  });

  it('opens below when the panel exactly fits', () => {
    const pos = computePickerPosition(trigger, 770, 1200, 900);
    expect(pos).toEqual({ top: 130, right: 400 });
  });

  it('clamps top to 0 when the panel is taller than the viewport', () => {
    const pos = computePickerPosition(trigger, 600, 1200, 500);
    expect(pos).toEqual({ top: 0, right: 504 });
  });
});
