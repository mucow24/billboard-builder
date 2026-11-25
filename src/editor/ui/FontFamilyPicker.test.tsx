import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FontFamilyPicker } from './FontFamilyPicker';
import { FontImportProvider } from './FontImportContext';
import { FontMenuProvider } from './FontMenuContext';

const FONT_OPTIONS = [
  { family: 'Arial', sourceName: 'Arial', kind: 'system' as const },
  { family: 'Georgia', sourceName: 'Georgia', kind: 'system' as const },
  { family: 'Verdana', sourceName: 'Verdana', kind: 'system' as const },
];

function renderFontFamilyPicker(
  onChange = vi.fn(),
  value = 'Arial',
  { disabled = false, mixed = false }: { disabled?: boolean; mixed?: boolean } = {}
) {
  render(
    <div>
      <span id="font-family-label">Font family</span>
      <FontFamilyPicker
        disabled={disabled}
        fonts={FONT_OPTIONS}
        labelId="font-family-label"
        mixed={mixed}
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

  it('names each font in a tooltip, for the fonts whose preview cannot be read', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFontFamilyPicker();

    await user.click(trigger);

    expect(screen.getByRole('option', { name: 'Georgia' })).toHaveAttribute('title', 'Georgia');
  });

  it('lists the fonts under one header, without stars, outside the editor', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFontFamilyPicker();

    await user.click(trigger);

    expect(
      screen.getAllByRole('group').map((section) => section.getAttribute('data-testid')),
    ).toEqual(['font-menu-section-all']);
    expect(screen.getByRole('button', { name: 'All fonts' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: /favorites/ })).not.toBeInTheDocument();
  });

  it('shows a mixed trigger state while still cycling from the first selected value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderFontFamilyPicker(onChange, 'Georgia', { mixed: true });

    expect(screen.getByRole('button', { name: 'Font family' })).toHaveTextContent(
      'Mixed fonts',
    );

    await user.click(screen.getByRole('button', { name: 'Next font' }));
    expect(onChange).toHaveBeenCalledWith('Verdana');
  });
});

// The flat list as the inspector builds it: sorted by name, one entry per weight.
const FAMILY_FONT_OPTIONS = [
  'Arial',
  'Barlow',
  'Barlow Black',
  'Barlow Light',
  'Georgia',
].map((family) => ({ family, sourceName: family, kind: 'bundled' as const }));

function renderFamilyPicker(onChange = vi.fn(), value = 'Arial') {
  render(
    <div>
      <span id="font-family-label">Font family</span>
      <FontFamilyPicker
        fonts={FAMILY_FONT_OPTIONS}
        labelId="font-family-label"
        onChange={onChange}
        value={value}
      />
    </div>,
  );
  return { onChange, trigger: screen.getByRole('button', { name: 'Font family' }) };
}

describe('FontFamilyPicker families', () => {
  it('shows the weights of a typeface as one row, and its weights in a submenu', async () => {
    const user = userEvent.setup();
    const { onChange, trigger } = renderFamilyPicker();

    await user.click(trigger);

    const menu = screen.getByRole('listbox', { name: 'Font family' });
    expect(
      [...menu.querySelectorAll('[role="option"]')].map((row) => row.textContent),
    ).toEqual(['Arial', 'Barlow', 'Georgia']);
    const family = screen.getByRole('option', { name: 'Barlow' });
    expect(family).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', { name: 'Barlow weights' })).not.toBeInTheDocument();

    await user.click(family);

    expect(family).toHaveAttribute('aria-expanded', 'true');
    const submenu = screen.getByRole('listbox', { name: 'Barlow weights' });
    expect(
      [...submenu.querySelectorAll('[role="option"]')].map((row) => row.textContent),
    ).toEqual(['Light', 'Regular', 'Black']);
    // Each weight is shown in its own face.
    expect(screen.getByRole('option', { name: 'Barlow Black' }).getAttribute('style')).toContain(
      'Barlow Black',
    );
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('option', { name: 'Barlow Black' }));

    expect(onChange).toHaveBeenCalledWith('Barlow Black');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('marks the family of the selected font, and its weight in the submenu', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFamilyPicker(vi.fn(), 'Barlow Light');

    await user.click(trigger);

    const menu = screen.getByRole('listbox', { name: 'Font family' });
    const family = screen.getByRole('option', { name: 'Barlow' });
    expect(family).toHaveAttribute('aria-selected', 'true');
    expect(menu.getAttribute('aria-activedescendant')).toBe(family.id);

    await user.keyboard('{ArrowLeft}');

    const light = screen.getByRole('option', { name: 'Barlow Light' });
    expect(light).toHaveAttribute('aria-selected', 'true');
    expect(menu.getAttribute('aria-activedescendant')).toBe(light.id);
  });

  it('opens a submenu from the keyboard, moves within it and picks a weight', async () => {
    const user = userEvent.setup();
    const { onChange, trigger } = renderFamilyPicker();

    await user.click(trigger);
    const menu = screen.getByRole('listbox', { name: 'Font family' });
    await user.keyboard('{ArrowDown}{Enter}');

    // The submenu opens on the regular weight when the selected font is not in it.
    expect(menu.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Barlow Regular' }).id,
    );
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{End}');
    expect(menu.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Barlow Black' }).id,
    );
    await user.keyboard('{Home}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('Barlow Black');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('leaves a submenu with the right arrow or escape, and the menu with escape after that', async () => {
    const user = userEvent.setup();
    const { onChange, trigger } = renderFamilyPicker();

    await user.click(trigger);
    const menu = screen.getByRole('listbox', { name: 'Font family' });
    await user.keyboard('{ArrowDown}{ArrowLeft}');
    expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.queryByRole('listbox', { name: 'Barlow weights' })).not.toBeInTheDocument();
    expect(menu.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Barlow' }).id,
    );

    await user.keyboard('{ArrowLeft}{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Barlow weights' })).not.toBeInTheDocument();
    expect(menu).toBeInTheDocument();

    // Back in the menu, the arrows move between its rows again.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('Georgia');

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens a submenu when the pointer comes onto its family', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFamilyPicker();

    await user.click(trigger);
    await user.hover(screen.getByRole('option', { name: 'Barlow' }));

    expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();
  });

  it('keeps a submenu open while the pointer crosses another row on its way in', async () => {
    vi.useFakeTimers();
    try {
      const { trigger } = renderFamilyPicker();
      fireEvent.click(trigger);
      fireEvent.pointerMove(screen.getByRole('option', { name: 'Barlow' }));
      expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();

      fireEvent.pointerMove(screen.getByRole('option', { name: 'Georgia' }));
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();

      // Reaching the submenu in time keeps it. React takes pointerenter from pointerover.
      fireEvent.pointerOver(screen.getByRole('listbox', { name: 'Barlow weights' }));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();

      // Staying on another row closes it.
      fireEvent.pointerMove(screen.getByRole('option', { name: 'Arial' }));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByRole('listbox', { name: 'Barlow weights' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes a submenu when the pointer leaves the menu and does not go to the submenu', async () => {
    vi.useFakeTimers();
    try {
      const { trigger } = renderFamilyPicker();
      fireEvent.click(trigger);
      const family = screen.getByRole('option', { name: 'Barlow' });
      fireEvent.pointerMove(family);
      expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();

      // React takes pointerleave from pointerout: here, out of the menu onto the page.
      fireEvent.pointerOut(family, { relatedTarget: document.body });
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.queryByRole('listbox', { name: 'Barlow weights' })).not.toBeInTheDocument();
      expect(screen.getByRole('listbox', { name: 'Font family' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not open the submenus of the rows that scroll past under a resting pointer', async () => {
    const { trigger } = renderFamilyPicker();
    fireEvent.click(trigger);
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Arial' }), { clientX: 40, clientY: 40 });

    // The list scrolls, and the browser reports the row now under the pointer.
    fireEvent.scroll(screen.getByTestId('font-family-picker-scroller'));
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Barlow' }), { clientX: 40, clientY: 40 });
    expect(screen.queryByRole('listbox', { name: 'Barlow weights' })).not.toBeInTheDocument();

    // The pointer itself moving onto the row opens it.
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Barlow' }), { clientX: 41, clientY: 40 });
    expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();

    // A scroll that leaves the row where it is, reported late, changes nothing.
    fireEvent.scroll(screen.getByTestId('font-family-picker-scroller'));
    expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();

    // Scrolling on closes it: its row is moving away.
    const family = screen.getByRole('option', { name: 'Barlow' });
    vi.spyOn(family, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -30, 100, 20));
    fireEvent.scroll(screen.getByTestId('font-family-picker-scroller'));
    expect(screen.queryByRole('listbox', { name: 'Barlow weights' })).not.toBeInTheDocument();
  });

  it('closes on a pointerdown outside the menu and its submenu, not on one inside the submenu', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFamilyPicker();

    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Barlow' }));

    fireEvent.pointerDown(screen.getByRole('listbox', { name: 'Barlow weights' }));
    expect(screen.getByRole('listbox', { name: 'Font family' })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('steps through every weight, in list order, with the arrow buttons', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <div>
        <span id="font-family-label">Font family</span>
        <FontFamilyPicker
          fonts={FAMILY_FONT_OPTIONS}
          labelId="font-family-label"
          onChange={onChange}
          value="Barlow"
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Next font' }));
    expect(onChange).toHaveBeenLastCalledWith('Barlow Black');

    rerender(
      <div>
        <span id="font-family-label">Font family</span>
        <FontFamilyPicker
          fonts={FAMILY_FONT_OPTIONS}
          labelId="font-family-label"
          onChange={onChange}
          value="Barlow Black"
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Next font' }));
    expect(onChange).toHaveBeenLastCalledWith('Barlow Light');
    await user.click(screen.getByRole('button', { name: 'Previous font' }));
    expect(onChange).toHaveBeenLastCalledWith('Barlow');
  });
});

describe('FontFamilyPicker imports', () => {
  function renderWithImports(importFromGoogle: (() => void) | null) {
    const importFromFile = vi.fn();
    render(
      <FontImportProvider importFromFile={importFromFile} importFromGoogle={importFromGoogle}>
        <span id="font-family-label">Font family</span>
        <FontFamilyPicker
          fonts={FONT_OPTIONS}
          labelId="font-family-label"
          onChange={vi.fn()}
          value="Arial"
        />
      </FontImportProvider>,
    );
    return { importFromFile, trigger: screen.getByRole('button', { name: 'Font family' }) };
  }

  it('offers no import outside the editor', async () => {
    const user = userEvent.setup();
    const { trigger } = renderFontFamilyPicker();

    await user.click(trigger);

    expect(screen.queryByRole('button', { name: /Import font/ })).not.toBeInTheDocument();
  });

  it('imports from a file and closes the menu', async () => {
    const user = userEvent.setup();
    const { importFromFile, trigger } = renderWithImports(vi.fn());

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Import font from file…' }));

    expect(importFromFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the Google import with the focus back on the trigger, for the dialog to return it there', async () => {
    const user = userEvent.setup();
    let focusedWhenOpened: Element | null = null;
    const importFromGoogle = vi.fn(() => {
      focusedWhenOpened = document.activeElement;
    });
    const { importFromFile, trigger } = renderWithImports(importFromGoogle);

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Import font from Google…' }));

    expect(importFromGoogle).toHaveBeenCalledTimes(1);
    expect(importFromFile).not.toHaveBeenCalled();
    expect(focusedWhenOpened).toBe(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('lists Google greyed out, with the reason, when the build has no key for it', async () => {
    const user = userEvent.setup();
    const { importFromFile, trigger } = renderWithImports(null);

    await user.click(trigger);

    expect(screen.getByRole('button', { name: 'Import font from file…' })).toBeInTheDocument();
    const google = screen.getByRole('button', { name: 'Import font from Google…' });
    expect(google).toHaveAttribute('aria-disabled', 'true');
    expect(google.title).toContain('VITE_GOOGLE_FONTS_API_KEY');

    // Clicking it does nothing, and the menu stays open.
    await user.click(google);
    expect(importFromFile).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox', { name: 'Font family' })).toBeInTheDocument();
  });

  it('does not grey Google out when the build has a key for it', async () => {
    const user = userEvent.setup();
    const { trigger } = renderWithImports(vi.fn());

    await user.click(trigger);

    const google = screen.getByRole('button', { name: 'Import font from Google…' });
    expect(google).not.toHaveAttribute('aria-disabled');
    expect(google).not.toHaveAttribute('title');
  });
});

describe('FontFamilyPicker sections', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  interface HarnessProps {
    canvasFamilies?: string[];
    initialFavorites?: string[];
    onChange?: (family: string) => void;
    onToggleFavorite?: (name: string) => void;
    value?: string;
  }

  /** The picker as the editor shows it: with the import commands, the canvas's fonts and favorites that are kept. */
  function Harness({
    canvasFamilies = ['Arial'],
    initialFavorites = [],
    onChange = () => {},
    onToggleFavorite,
    value = 'Arial',
  }: HarnessProps) {
    const [favoriteNames, setFavoriteNames] = useState(initialFavorites);
    const toggleFavorite = useCallback(
      (name: string) => {
        onToggleFavorite?.(name);
        setFavoriteNames((current) =>
          current.includes(name) ? current.filter((other) => other !== name) : [...current, name],
        );
      },
      [onToggleFavorite],
    );
    return (
      <FontImportProvider importFromFile={() => {}} importFromGoogle={null}>
        <FontMenuProvider
          canvasFamilies={canvasFamilies}
          favoriteNames={favoriteNames}
          toggleFavorite={toggleFavorite}
        >
          <span id="font-family-label">Font family</span>
          <FontFamilyPicker
            fonts={FAMILY_FONT_OPTIONS}
            labelId="font-family-label"
            onChange={onChange}
            value={value}
          />
        </FontMenuProvider>
      </FontImportProvider>
    );
  }

  const section = (id: string) => within(screen.getByTestId(`font-menu-section-${id}`));
  const rowNames = (id: string) =>
    section(id)
      .queryAllByRole('option')
      .map((row) => row.textContent);

  it('lists the import commands, the fonts of the canvas, the favorites and every font, each under a header', async () => {
    const user = userEvent.setup();
    render(<Harness canvasFamilies={['Georgia', 'Barlow Light']} initialFavorites={['Arial']} />);

    await user.click(screen.getByRole('button', { name: 'Font family' }));

    const popover = screen.getByTestId('font-family-picker-scroller');
    expect(
      [...popover.querySelectorAll('.font-menu-section-toggle')].map((header) => header.textContent),
    ).toEqual(['Import▾', 'In this canvas▾', 'Favorites▾', 'All fonts▾']);
    expect(section('import').getByRole('button', { name: 'Import font from file…' })).toBeInTheDocument();
    // A family is in the canvas when one of its weights is.
    expect(rowNames('canvas')).toEqual(['Barlow', 'Georgia']);
    expect(rowNames('favorites')).toEqual(['Arial']);
    // Every font, the ones of the other sections included.
    expect(rowNames('all')).toEqual(['Arial', 'Barlow', 'Georgia']);
  });

  it('says so when a section has nothing in it', async () => {
    const user = userEvent.setup();
    render(<Harness canvasFamilies={[]} />);

    await user.click(screen.getByRole('button', { name: 'Font family' }));

    expect(rowNames('favorites')).toEqual([]);
    expect(section('favorites').getByText('Star a font to keep it here.')).toBeInTheDocument();
    expect(section('canvas').getByText('No text on the canvas yet.')).toBeInTheDocument();
  });

  it('shows one star for a font wherever it is listed, and keeps the menu open when it is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Font family' }));
    const menu = screen.getByRole('listbox', { name: 'Font family' });
    expect(screen.getAllByRole('button', { name: 'Add Arial to favorites' })).toHaveLength(2);

    await user.click(section('all').getByRole('button', { name: 'Add Arial to favorites' }));

    // In the canvas, in the favorites and in the full list: the same filled star.
    expect(rowNames('favorites')).toEqual(['Arial']);
    const stars = screen.getAllByRole('button', { name: 'Remove Arial from favorites' });
    expect(stars).toHaveLength(3);
    for (const star of stars) {
      expect(star).toHaveAttribute('aria-pressed', 'true');
    }
    expect(
      section('all').getByRole('button', { name: 'Add Georgia to favorites' }),
    ).toHaveAttribute('aria-pressed', 'false');
    // Starring picks nothing, and the keys still go to the list.
    expect(onChange).not.toHaveBeenCalled();
    expect(menu).toHaveFocus();

    await user.click(section('canvas').getByRole('button', { name: 'Remove Arial from favorites' }));

    expect(rowNames('favorites')).toEqual([]);
    expect(screen.getAllByRole('button', { name: 'Add Arial to favorites' })).toHaveLength(2);
    expect(screen.getByRole('listbox', { name: 'Font family' })).toBeInTheDocument();
  });

  it('stars a family as a whole, by its name', async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    render(<Harness onToggleFavorite={onToggleFavorite} />);

    await user.click(screen.getByRole('button', { name: 'Font family' }));
    await user.click(screen.getByRole('button', { name: 'Add Barlow to favorites' }));

    expect(onToggleFavorite).toHaveBeenCalledWith('Barlow');
    // The favorite is the family's row, which opens the same submenu.
    const favorite = section('favorites').getByRole('option', { name: 'Barlow' });
    await user.click(favorite);
    expect(favorite).toHaveAttribute('aria-expanded', 'true');
    expect(section('all').getByRole('option', { name: 'Barlow' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('listbox', { name: 'Barlow weights' })).toBeInTheDocument();
  });

  it('marks the selected font in every section, and opens on its first row', async () => {
    const user = userEvent.setup();
    render(<Harness canvasFamilies={['Georgia']} initialFavorites={['Georgia']} value="Georgia" />);

    await user.click(screen.getByRole('button', { name: 'Font family' }));

    const rows = screen.getAllByRole('option', { name: 'Georgia' });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveAttribute('aria-selected', 'true');
    }
    expect(
      screen.getByRole('listbox', { name: 'Font family' }).getAttribute('aria-activedescendant'),
    ).toBe(section('canvas').getByRole('option', { name: 'Georgia' }).id);
  });

  it('moves through the rows of all sections with the arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness canvasFamilies={['Georgia']} onChange={onChange} value="Georgia" />);

    await user.click(screen.getByRole('button', { name: 'Font family' }));
    const menu = screen.getByRole('listbox', { name: 'Font family' });
    // From the one row of the canvas, past the empty favorites, into the full list.
    await user.keyboard('{ArrowDown}');
    expect(menu.getAttribute('aria-activedescendant')).toBe(
      section('all').getByRole('option', { name: 'Arial' }).id,
    );
    await user.keyboard('{End}');
    expect(menu.getAttribute('aria-activedescendant')).toBe(
      section('all').getByRole('option', { name: 'Georgia' }).id,
    );
    await user.keyboard('{Home}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('Arial');
  });

  it('closes and opens a section from its header, and remembers which are closed', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Font family' }));
    const menu = screen.getByRole('listbox', { name: 'Font family' });
    const header = screen.getByRole('button', { name: 'All fonts' });
    await user.click(header);

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(rowNames('all')).toEqual([]);
    expect(rowNames('canvas')).toEqual(['Arial']);
    expect(menu).toHaveFocus();
    // The keyboard stays within the rows that are shown.
    await user.keyboard('{End}');
    expect(menu.getAttribute('aria-activedescendant')).toBe(
      section('canvas').getByRole('option', { name: 'Arial' }).id,
    );

    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.queryByRole('button', { name: 'Import font from file…' })).not.toBeInTheDocument();

    unmount();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Font family' }));

    expect(screen.getByRole('button', { name: 'All fonts' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Import' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'All fonts' }));
    expect(rowNames('all')).toEqual(['Arial', 'Barlow', 'Georgia']);
  });
});
