import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FontFamilyPicker } from './FontFamilyPicker';

const FONT_OPTIONS = [
  { family: 'Arial', sourceName: 'Arial', kind: 'system' as const },
  { family: 'Georgia', sourceName: 'Georgia', kind: 'system' as const },
  { family: 'Verdana', sourceName: 'Verdana', kind: 'system' as const },
];

function renderFontFamilyPicker(onChange = vi.fn(), value = 'Arial') {
  render(
    <div>
      <span id="font-family-label">Font family</span>
      <FontFamilyPicker
        fonts={FONT_OPTIONS}
        labelId="font-family-label"
        onChange={onChange}
        value={value}
      />
      <button type="button">Outside</button>
    </div>
  );

  return {
    onChange,
    outsideButton: screen.getByRole('button', { name: 'Outside' }),
    trigger: screen.getByRole('button', { name: 'Font family' }),
  };
}

describe('FontFamilyPicker', () => {
  it('renders the selected family in the trigger and previews listbox options in their own font', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFontFamilyPicker();

    expect(trigger).toHaveTextContent('Arial');
    expect(trigger.getAttribute('style')).toContain('Arial');

    await user.click(trigger);

    const listbox = screen.getByRole('listbox', { name: 'Font family' });
    const selectedOption = screen.getByRole('option', { name: 'Arial' });
    const previewOption = screen.getByRole('option', { name: 'Georgia' });

    expect(listbox).toHaveFocus();
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');
    expect(previewOption.getAttribute('style')).toContain('Georgia');
  });

  it('supports keyboard navigation with home and end, and restores focus after selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { trigger } = renderFontFamilyPicker(onChange);

    await user.click(trigger);
    const listbox = screen.getByRole('listbox', { name: 'Font family' });
    await user.keyboard('{End}');
    expect(listbox.getAttribute('aria-activedescendant')).toContain('option-2');

    await user.keyboard('{Home}');
    expect(listbox.getAttribute('aria-activedescendant')).toContain('option-0');

    await user.keyboard('{End}{Enter}');

    expect(onChange).toHaveBeenCalledWith('Verdana');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('commits the active option on space and closes on escape or outside pointerdown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { outsideButton, trigger } = renderFontFamilyPicker(onChange);

    await user.click(trigger);
    await user.keyboard('{ArrowDown} ');

    expect(onChange).toHaveBeenCalledWith('Georgia');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(trigger);
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Font family' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });

    await user.click(trigger);
    fireEvent.pointerDown(outsideButton);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens from trigger arrow keys, toggles closed on trigger click, and closes on tab without restoring focus', async () => {
    const user = userEvent.setup();
    const { outsideButton, trigger } = renderFontFamilyPicker();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox', { name: 'Font family' })).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    const listbox = screen.getByRole('listbox', { name: 'Font family' });
    fireEvent.keyDown(listbox, { key: 'Tab' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(outsideButton).not.toHaveFocus();
  });

  it('falls back to the first option when the current value is missing', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFontFamilyPicker(vi.fn(), 'Missing Family');

    expect(trigger).toHaveTextContent('Missing Family');

    await user.click(trigger);

    const listbox = screen.getByRole('listbox', { name: 'Font family' });
    expect(listbox.getAttribute('aria-activedescendant')).toContain('option-0');
  });

  it('renders previous and next controls that cycle with wraparound', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderFontFamilyPicker(onChange, 'Georgia');

    await user.click(screen.getByRole('button', { name: 'Previous font' }));
    await user.click(screen.getByRole('button', { name: 'Next font' }));

    expect(onChange).toHaveBeenNthCalledWith(1, 'Arial');
    expect(onChange).toHaveBeenNthCalledWith(2, 'Verdana');
  });

  it('wraps the cycling controls and falls back to the first option when the current value is missing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <div>
        <span id="font-family-label">Font family</span>
        <FontFamilyPicker
          fonts={FONT_OPTIONS}
          labelId="font-family-label"
          onChange={onChange}
          value="Arial"
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Previous font' }));
    expect(onChange).toHaveBeenLastCalledWith('Verdana');

    rerender(
      <div>
        <span id="font-family-label">Font family</span>
        <FontFamilyPicker
          fonts={FONT_OPTIONS}
          labelId="font-family-label"
          onChange={onChange}
          value="Missing Family"
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Next font' }));
    expect(onChange).toHaveBeenLastCalledWith('Georgia');
  });

  it('renders open-menu previews with a larger font size', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFontFamilyPicker();

    await user.click(trigger);

    expect(screen.getByRole('option', { name: 'Georgia' })).toHaveStyle({
      fontSize: '1.3em',
    });
  });
});
