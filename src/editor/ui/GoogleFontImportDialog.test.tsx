import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GoogleFontFamily } from '../fonts/googleFonts/googleFontsApi';
import { parseGoogleFontVariant } from '../fonts/googleFonts/googleFontVariants';
import {
  GoogleFontImportDialog,
  type GoogleFontImportRequest,
  type GoogleFontImportResult,
} from './GoogleFontImportDialog';

const { mockLoadCatalog, mockLoadPreview, mockReleasePreviews } = vi.hoisted(() => ({
  mockLoadCatalog: vi.fn(),
  mockLoadPreview: vi.fn(),
  mockReleasePreviews: vi.fn(),
}));

vi.mock('../fonts/googleFonts/googleFontsApi', () => ({ loadGoogleFontCatalog: mockLoadCatalog }));
vi.mock('../fonts/googleFonts/googleFontPreview', () => ({
  loadGoogleFontPreview: mockLoadPreview,
  releaseGoogleFontPreviews: mockReleasePreviews,
}));

function family(name: string, category: string, ...keys: string[]): GoogleFontFamily {
  return {
    family: name,
    category,
    variants: keys.flatMap((key) => parseGoogleFontVariant(key) ?? []),
  };
}

// In catalog order: most used first.
const CATALOG = [
  family('Playfair Display', 'serif', 'regular', 'italic', '700', '900'),
  family('Play', 'sans-serif', 'regular', '700'),
  family('Playball', 'display', 'regular'),
  family('Buda', 'display', '300'),
];

type OnImport = (request: GoogleFontImportRequest) => Promise<GoogleFontImportResult>;

function renderDialog({
  existingFamilies = [],
  bundledFamilies = [],
  onImport = vi.fn<OnImport>(async (request) => ({ added: request.variants.length, failed: [] })),
}: { existingFamilies?: string[]; bundledFamilies?: string[]; onImport?: OnImport } = {}) {
  const onClose = vi.fn();
  render(
    <GoogleFontImportDialog
      apiKey="test-key"
      existingFamilies={existingFamilies}
      bundledFamilies={bundledFamilies}
      onClose={onClose}
      onImport={onImport}
    />,
  );
  return { onClose, onImport, input: screen.getByRole('combobox', { name: 'Font name' }) };
}

/** The suggestion for the family of exactly that name. */
function suggestion(name: string) {
  const option = screen
    .getAllByRole('option')
    .find((entry) => entry.querySelector('.google-font-suggestion-name')?.textContent === name);
  if (!option) {
    throw new Error('No suggestion for ' + name);
  }
  return option;
}

function suggestionNames() {
  return screen
    .queryAllByRole('option')
    .map((option) => option.querySelector('.google-font-suggestion-name')?.textContent);
}

beforeEach(() => {
  mockLoadCatalog.mockReset();
  mockLoadPreview.mockReset();
  mockReleasePreviews.mockReset();
  mockLoadCatalog.mockResolvedValue(CATALOG);
  mockLoadPreview.mockImplementation(async ({ id }: { id: string }) => ({
    cssFamily: `gf-preview-${id}`,
  }));
});

describe('GoogleFontImportDialog', () => {
  it('opens on the text box, with nothing to add yet', async () => {
    const { input } = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Import font from Google' })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Loading the list of Google Fonts');
    expect(screen.getByRole('button', { name: 'Add font' })).toBeDisabled();
    expect(mockLoadCatalog).toHaveBeenCalledWith('test-key');
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
  });

  it('lists the matching families while typing, each set in its own typeface', async () => {
    const user = userEvent.setup();
    const { input } = renderDialog();

    await user.type(input, 'play');

    expect(suggestionNames()).toEqual(['Play', 'Playfair Display', 'Playball']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(suggestion('Playfair Display')).toHaveTextContent('Serif · 4 styles');
    expect(suggestion('Play')).toHaveTextContent('Sans serif · 2 styles');
    // A family of one style has nothing to count.
    expect(suggestion('Playball').querySelector('.google-font-suggestion-detail')).toHaveTextContent(
      /^Display$/,
    );

    await waitFor(() => {
      expect(
        suggestion('Playfair Display').querySelector('span'),
      ).toHaveStyle({ fontFamily: '"gf-preview-name:Playfair Display", sans-serif' });
    });
    // The name is all that is loaded of the family, in its regular style.
    expect(mockLoadPreview).toHaveBeenCalledWith({
      id: 'name:Playfair Display',
      family: 'Playfair Display',
      variants: [{ key: 'regular', weight: 400, italic: false }],
      text: 'Playfair Display',
      asRegular: true,
    });
  });

  it('marks the families that have an entry in the font list', async () => {
    const user = userEvent.setup();
    // "Play Hairline" is no weight of Play, whose styles are regular and bold.
    const { input } = renderDialog({
      existingFamilies: ['playball', 'Playfair Display Black', 'Play Hairline'],
    });

    await user.type(input, 'play');

    expect(suggestion('Playball')).toHaveTextContent('Display · in your fonts');
    // One weight of a family is enough.
    expect(suggestion('Playfair Display')).toHaveTextContent('Serif · in your fonts');
    expect(suggestion('Play')).toHaveTextContent('Sans serif · 2 styles');
  });

  it('previews a family without a regular style in the first style it has', async () => {
    const user = userEvent.setup();
    const { input } = renderDialog();

    await user.type(input, 'buda');

    await waitFor(() => {
      expect(mockLoadPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'name:Buda',
          variants: [{ key: '300', weight: 300, italic: false }],
        }),
      );
    });
  });

  it('says so when no family matches', async () => {
    const user = userEvent.setup();
    const { input } = renderDialog();

    await user.type(input, 'zzz');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No Google font is called “zzz”.');
  });

  it('picks a family with the keyboard and shows a line in each of its styles', async () => {
    const user = userEvent.setup();
    const { input } = renderDialog();

    await user.type(input, 'play');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      suggestion('Play').id,
    );
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');

    expect(input).toHaveValue('Playfair Display');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent),
    ).toEqual([
      'RegularSphinx of black quartz, judge my vow',
      'ItalicSphinx of black quartz, judge my vow',
      'BoldSphinx of black quartz, judge my vow',
      'BlackSphinx of black quartz, judge my vow',
    ]);
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Add 4 fonts' })).toBeEnabled();

    const black = screen.getByRole('checkbox', { name: /Black/ }).closest('label');
    await waitFor(() => {
      expect(black?.querySelector('.google-font-specimen-sample')).toHaveStyle({
        fontFamily: '"gf-preview-specimen:Playfair Display", sans-serif',
        fontWeight: '900',
      });
    });
    expect(mockLoadPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'specimen:Playfair Display',
        variants: CATALOG[0].variants,
        asRegular: false,
      }),
    );
  });

  it('shows a family of one style without boxes to tick', async () => {
    const user = userEvent.setup();
    const { input } = renderDialog();

    await user.type(input, 'playball');
    await user.click(suggestion('Playball'));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('google-font-specimen')).toHaveTextContent(
      'Sphinx of black quartz, judge my vow 0123456789',
    );
    expect(screen.getByRole('button', { name: 'Add font' })).toBeEnabled();
  });

  it('leaves out the styles that a bundled font already has the name of', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn<OnImport>(async (request) => ({
      added: request.variants.length,
      failed: [],
    }));
    // Regular, italic and bold are all styles of the entry "Playfair Display".
    const { input } = renderDialog({ bundledFamilies: ['playfair display'], onImport });

    await user.type(input, 'playfair{Enter}');

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((box) => [box.checked, box.disabled])).toEqual([
      [false, true],
      [false, true],
      [false, true],
      [true, false],
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('3 styles are already bundled fonts.');

    await user.click(screen.getByRole('button', { name: 'Add font' }));

    expect(onImport.mock.calls[0][0].variants.map((variant) => variant.key)).toEqual(['900']);
  });

  it('adds nothing of a family that is bundled whole', async () => {
    const user = userEvent.setup();
    const { input } = renderDialog({ bundledFamilies: ['Playball', 'Play'] });

    await user.type(input, 'playball{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Playball is already a bundled font.');
    expect(screen.getByRole('button', { name: 'Add font' })).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'play');
    await user.click(suggestion('Play'));
    expect(screen.getByRole('status')).toHaveTextContent('Play is already a bundled font.');
    expect(screen.getByRole('button', { name: 'Add font' })).toBeDisabled();
  });

  it('goes back to the suggestions when the name is edited', async () => {
    const user = userEvent.setup();
    const { input } = renderDialog();

    await user.type(input, 'playfair{Enter}');
    expect(screen.getByTestId('google-font-specimen')).toBeInTheDocument();

    await user.type(input, '{Backspace}');

    expect(screen.queryByTestId('google-font-specimen')).not.toBeInTheDocument();
    expect(suggestionNames()).toEqual(['Playfair Display']);
    expect(screen.getByRole('button', { name: 'Add font' })).toBeDisabled();
  });

  it('adds the ticked styles, shows the progress and closes when they are in', async () => {
    const user = userEvent.setup();
    let finish: (result: GoogleFontImportResult) => void = () => {};
    let request: GoogleFontImportRequest | undefined;
    const onImport = vi.fn<OnImport>((received) => {
      request = received;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { input, onClose } = renderDialog({ onImport });

    await user.type(input, 'playfair{Enter}');
    await user.click(screen.getByRole('checkbox', { name: /Italic/ }));
    await user.click(screen.getByRole('button', { name: 'Add 3 fonts' }));

    expect(request?.family).toBe('Playfair Display');
    expect(request?.variants.map((variant) => variant.key)).toEqual(['regular', '700', '900']);
    expect(screen.getByRole('status')).toHaveTextContent('Downloading 1 of 3…');
    expect(screen.getByRole('button', { name: 'Add 3 fonts' })).toBeDisabled();
    expect(input).toBeDisabled();

    act(() => {
      request?.onProgress(2, 3);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Downloading 3 of 3…');
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      finish({ added: 3, failed: [] });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open and names the styles that could not be downloaded', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn<OnImport>(async () => ({ added: 2, failed: ['Bold', 'Black'] }));
    const { input, onClose } = renderDialog({ onImport });

    await user.type(input, 'playfair{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add 4 fonts' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Added 2 of 4. Could not download: Bold, Black.',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add 4 fonts' })).toBeEnabled();
  });

  it('says why when nothing could be imported at all', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn<OnImport>(async () => {
      throw new Error('Google Fonts answered with an error (403).');
    });
    const { input, onClose } = renderDialog({ onImport });

    await user.type(input, 'playball{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add font' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google Fonts answered with an error (403).',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers to try again when the list of fonts cannot be loaded', async () => {
    const user = userEvent.setup();
    mockLoadCatalog.mockRejectedValueOnce(new Error('offline'));
    const { input } = renderDialog();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach Google Fonts.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    await user.type(input, 'playball');

    expect(suggestionNames()).toEqual(['Playball']);
    expect(mockLoadCatalog).toHaveBeenCalledTimes(2);
  });

  it('closes on Cancel, Escape and a click beside it', async () => {
    const user = userEvent.setup();
    const first = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(first.onClose).toHaveBeenCalledTimes(1);

    await user.type(first.input, 'play');
    await user.keyboard('{Escape}');
    expect(first.onClose).toHaveBeenCalledTimes(2);

    fireEvent.pointerDown(screen.getByRole('dialog'));
    expect(first.onClose).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(screen.getByTestId('google-font-backdrop'));
    expect(first.onClose).toHaveBeenCalledTimes(3);

  });

  it('stops a download that is under way when it is cancelled', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    const onImport = vi.fn<OnImport>((request) => {
      signal = request.signal;
      return new Promise(() => {});
    });
    const { input, onClose } = renderDialog({ onImport });

    await user.type(input, 'playball{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add font' }));
    expect(signal?.aborted).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(signal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes its previews when it goes', async () => {
    const { unmount } = render(
      <GoogleFontImportDialog
        apiKey="test-key"
        existingFamilies={[]}
        bundledFamilies={[]}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    unmount();

    expect(mockReleasePreviews).toHaveBeenCalledTimes(1);
  });
});
