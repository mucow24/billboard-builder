import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  loadGoogleFontPreview,
  releaseGoogleFontPreviews,
} from '../fonts/googleFonts/googleFontPreview';
import { loadGoogleFontCatalog, type GoogleFontFamily } from '../fonts/googleFonts/googleFontsApi';
import { searchGoogleFonts } from '../fonts/googleFonts/googleFontSearch';
import {
  describeGoogleFontVariant,
  googleFontEntryName,
  type GoogleFontVariant,
} from '../fonts/googleFonts/googleFontVariants';
import { useModalDialog } from './useModalDialog';

/** How many families the list of suggestions shows at most. */
const MAX_SUGGESTIONS = 12;
/**
 * How long a suggestion must stay in the list before its typeface is fetched:
 * while a name is being typed, the suggestions of each letter come and go.
 */
const SUGGESTION_PREVIEW_DELAY_MS = 150;
/** The line each style of the picked family is shown in. */
const SPECIMEN_LINE = 'Sphinx of black quartz, judge my vow';
/** What a family of a single style is shown in: it has the room for the digits too. */
const SPECIMEN_TEXT = `${SPECIMEN_LINE} 0123456789`;

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'sans-serif': 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  monospace: 'Monospace',
};

export interface GoogleFontImportRequest {
  family: string;
  variants: GoogleFontVariant[];
  onProgress: (done: number, total: number) => void;
  signal: AbortSignal;
}

export interface GoogleFontImportResult {
  /** How many styles are now in the font list. */
  added: number;
  /** The names of the styles that could not be imported. */
  failed: string[];
}

interface GoogleFontImportDialogProps {
  /** The key for the Google Fonts API. */
  apiKey: string;
  /** The names of the entries of the font list, to mark the families that are already there. */
  existingFamilies: readonly string[];
  /**
   * The names of the entries that are bundled fonts. A style that would be
   * imported under one of these names cannot be added: it would sit beside the
   * bundled entry under the same name, and take its place on the canvas.
   */
  bundledFamilies: readonly string[];
  onClose: () => void;
  /**
   * Imports the given styles of a family. Rejects when nothing could be
   * imported at all; styles that failed on their own are in the result.
   */
  onImport: (request: GoogleFontImportRequest) => Promise<GoogleFontImportResult>;
}

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; families: GoogleFontFamily[] }
  | { status: 'error' };

type ImportState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'failed'; message: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function describeFamily(family: GoogleFontFamily, alreadyImported: boolean) {
  const parts = [CATEGORY_LABELS[family.category] ?? family.category];
  if (alreadyImported) {
    parts.push('in your fonts');
  } else if (family.variants.length > 1) {
    parts.push(`${family.variants.length} styles`);
  }
  return parts.filter(Boolean).join(' · ');
}

/**
 * The CSS font family that previews `family`, once it has loaded; null until
 * then, and for good when it cannot be had. `text` is what will be shown in it.
 * Nothing is asked for until `delayMs` have passed, nor at all if the preview is
 * no longer wanted by then.
 */
function useGoogleFontPreview(
  id: string,
  family: GoogleFontFamily,
  variants: readonly GoogleFontVariant[],
  text: string,
  asRegular: boolean,
  delayMs: number,
) {
  const [loaded, setLoaded] = useState<{ id: string; cssFamily: string } | null>(null);

  useEffect(() => {
    let wanted = true;
    const timer = window.setTimeout(() => {
      loadGoogleFontPreview({ id, family: family.family, variants, text, asRegular }).then(
        (preview) => {
          if (wanted) {
            setLoaded({ id, cssFamily: preview.cssFamily });
          }
        },
        () => {
          // No preview: the text stays in the dialog's own font.
        },
      );
    }, delayMs);
    return () => {
      wanted = false;
      window.clearTimeout(timer);
    };
    // `variants` is the family's own list or a part of it: the id says which.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, family, text, asRegular, delayMs]);

  return loaded?.id === id ? loaded.cssFamily : null;
}

function previewStyle(cssFamily: string | null) {
  return cssFamily ? { fontFamily: `${JSON.stringify(cssFamily)}, sans-serif` } : undefined;
}

interface SuggestionProps {
  active: boolean;
  alreadyImported: boolean;
  family: GoogleFontFamily;
  id: string;
  onHover: () => void;
  onPick: () => void;
}

/** One suggested family, its name set in the family itself. */
function Suggestion({ active, alreadyImported, family, id, onHover, onPick }: SuggestionProps) {
  // A family without a regular style is shown in the first style it has.
  const variant =
    family.variants.find((entry) => entry.weight === 400 && !entry.italic) ?? family.variants[0];
  const previewVariants = useMemo(() => [variant], [variant]);
  const cssFamily = useGoogleFontPreview(
    `name:${family.family}`,
    family,
    previewVariants,
    family.family,
    true,
    SUGGESTION_PREVIEW_DELAY_MS,
  );

  return (
    <div
      id={id}
      aria-selected={active}
      className={active ? 'google-font-suggestion active' : 'google-font-suggestion'}
      data-preview-ready={cssFamily !== null}
      role="option"
      // Keeps the focus in the text box, so that typing carries on.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      onPointerMove={onHover}
    >
      <span className="google-font-suggestion-name" style={previewStyle(cssFamily)}>
        {family.family}
      </span>
      <span className="google-font-suggestion-detail">
        {describeFamily(family, alreadyImported)}
      </span>
    </div>
  );
}

interface SpecimenProps {
  /** The styles that cannot be added, because a bundled font has their name. */
  bundledKeys: ReadonlySet<string>;
  checkedKeys: ReadonlySet<string>;
  disabled: boolean;
  family: GoogleFontFamily;
  onToggle: (key: string) => void;
}

/** The picked family: a line of text in each of its styles, each with a box to leave it out. */
function Specimen({ bundledKeys, checkedKeys, disabled, family, onToggle }: SpecimenProps) {
  const cssFamily = useGoogleFontPreview(
    `specimen:${family.family}`,
    family,
    family.variants,
    SPECIMEN_TEXT,
    false,
    0,
  );
  const single = family.variants.length === 1;

  return (
    <div
      className={single ? 'google-font-specimen single' : 'google-font-specimen'}
      data-preview-ready={cssFamily !== null}
      data-testid="google-font-specimen"
    >
      {family.variants.map((variant) => {
        const label = describeGoogleFontVariant(variant);
        const sample = (
          <span
            className="google-font-specimen-sample"
            style={{
              ...previewStyle(cssFamily),
              fontStyle: variant.italic ? 'italic' : 'normal',
              fontWeight: variant.weight,
            }}
          >
            {single ? SPECIMEN_TEXT : SPECIMEN_LINE}
          </span>
        );

        if (single) {
          return (
            <div key={variant.key} className="google-font-specimen-row">
              {sample}
            </div>
          );
        }
        const bundled = bundledKeys.has(variant.key);
        return (
          <label
            key={variant.key}
            className={bundled ? 'google-font-specimen-row bundled' : 'google-font-specimen-row'}
            title={bundled ? 'Already a bundled font' : undefined}
          >
            <input
              type="checkbox"
              checked={checkedKeys.has(variant.key)}
              disabled={disabled || bundled}
              onChange={() => onToggle(variant.key)}
            />
            <span className="google-font-specimen-label">{label}</span>
            {sample}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Adds fonts from Google Fonts. A family is found by typing its name: the
 * matches are listed under the text box, each in its own typeface. Picking one
 * shows a line of text in each of its styles; "Add" then downloads the ticked
 * styles into the font list. Escape, Cancel and a click beside the dialog
 * close it, which also stops a download that is under way.
 */
export function GoogleFontImportDialog({
  apiKey,
  existingFamilies,
  bundledFamilies,
  onClose,
  onImport,
}: GoogleFontImportDialogProps) {
  const titleId = useId();
  const listId = useId();
  const statusId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' });
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<GoogleFontFamily | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<ReadonlySet<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });

  function close() {
    abortRef.current?.abort();
    onClose();
  }

  const handleDialogKeyDown = useModalDialog(dialogRef, close);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let wanted = true;
    loadGoogleFontCatalog(apiKey).then(
      (families) => {
        if (wanted) {
          setCatalog({ status: 'ready', families });
        }
      },
      () => {
        if (wanted) {
          setCatalog({ status: 'error' });
        }
      },
    );
    return () => {
      wanted = false;
    };
  }, [apiKey, catalogAttempt]);

  // The previews live as long as the dialog; a download still running when it
  // goes is stopped.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      releaseGoogleFontPreviews();
    },
    [],
  );

  const existingNames = useMemo(
    () => new Set(existingFamilies.map((name) => name.toLowerCase())),
    [existingFamilies],
  );
  /** Whether the font list has an entry that a style of `family` would be imported as. */
  function isInFontList(family: GoogleFontFamily) {
    return family.variants.some((variant) =>
      existingNames.has(googleFontEntryName(family.family, variant).toLowerCase()),
    );
  }

  const bundledNames = useMemo(
    () => new Set(bundledFamilies.map((name) => name.toLowerCase())),
    [bundledFamilies],
  );
  /** The styles of `family` that a bundled font already has the name of. */
  function bundledKeysOf(family: GoogleFontFamily) {
    return new Set(
      family.variants
        .filter((variant) =>
          bundledNames.has(googleFontEntryName(family.family, variant).toLowerCase()),
        )
        .map((variant) => variant.key),
    );
  }
  const pickedBundledKeys = picked ? bundledKeysOf(picked) : new Set<string>();

  const suggestions = useMemo(
    () =>
      catalog.status === 'ready' && !picked
        ? searchGoogleFonts(catalog.families, query, MAX_SUGGESTIONS)
        : [],
    [catalog, picked, query],
  );
  const showSuggestions = suggestions.length > 0;
  const activeSuggestionIndex = Math.min(activeIndex, suggestions.length - 1);
  const activeSuggestion = suggestions[activeSuggestionIndex];
  const importing = importState.status === 'running';
  const checkedVariants = picked
    ? picked.variants.filter((variant) => checkedKeys.has(variant.key))
    : [];

  function pick(family: GoogleFontFamily) {
    setPicked(family);
    setQuery(family.family);
    const bundledKeys = bundledKeysOf(family);
    setCheckedKeys(
      new Set(
        family.variants.map((variant) => variant.key).filter((key) => !bundledKeys.has(key)),
      ),
    );
    setImportState({ status: 'idle' });
  }

  function handleQueryChange(text: string) {
    setQuery(text);
    setActiveIndex(0);
    if (picked && text !== picked.family) {
      setPicked(null);
      setImportState({ status: 'idle' });
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(activeSuggestionIndex + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(activeSuggestionIndex - 1, 0));
    } else if (event.key === 'Enter' && activeSuggestion) {
      event.preventDefault();
      pick(activeSuggestion);
    }
  }

  function toggleVariant(key: string) {
    setCheckedKeys((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  async function handleAdd() {
    if (!picked || checkedVariants.length === 0 || importing) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const total = checkedVariants.length;
    setImportState({ status: 'running', done: 0, total });
    try {
      const result = await onImport({
        family: picked.family,
        variants: checkedVariants,
        onProgress: (done) => {
          if (!controller.signal.aborted) {
            setImportState({ status: 'running', done, total });
          }
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (result.failed.length === 0) {
        onClose();
        return;
      }
      setImportState({
        status: 'failed',
        message:
          result.added === 0
            ? `${picked.family} could not be downloaded. Try again.`
            : `Added ${result.added} of ${total}. Could not download: ${result.failed.join(', ')}.`,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setImportState({
          status: 'failed',
          message: errorMessage(error, `${picked.family} could not be downloaded.`),
        });
      }
    }
  }

  let status: string | null = null;
  if (catalog.status === 'loading') {
    status = 'Loading the list of Google Fonts…';
  } else if (importState.status === 'running') {
    status = `Downloading ${Math.min(importState.done + 1, importState.total)} of ${importState.total}…`;
  } else if (catalog.status === 'ready' && !picked && query.trim() !== '' && !showSuggestions) {
    status = `No Google font is called “${query.trim()}”.`;
  } else if (picked && pickedBundledKeys.size === picked.variants.length) {
    status = `${picked.family} is already a bundled font.`;
  } else if (pickedBundledKeys.size > 0) {
    status =
      pickedBundledKeys.size === 1
        ? '1 style is already a bundled font.'
        : `${pickedBundledKeys.size} styles are already bundled fonts.`;
  }

  return (
    <div
      className="library-backdrop google-font-backdrop"
      data-testid="google-font-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="library-dialog google-font-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <h2 id={titleId} className="library-title">
          Import font from Google
        </h2>

        <div className="google-font-search">
          <input
            ref={inputRef}
            type="text"
            className="google-font-input"
            role="combobox"
            aria-label="Font name"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={showSuggestions}
            aria-activedescendant={
              showSuggestions ? `${listId}-${activeSuggestionIndex}` : undefined
            }
            aria-describedby={statusId}
            autoComplete="off"
            spellCheck={false}
            placeholder="Playfair Display"
            disabled={importing}
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {showSuggestions ? (
            <div
              id={listId}
              className="google-font-suggestions"
              role="listbox"
              aria-label="Matching fonts"
            >
              {suggestions.map((family, index) => (
                <Suggestion
                  key={family.family}
                  id={`${listId}-${index}`}
                  active={family === activeSuggestion}
                  alreadyImported={isInFontList(family)}
                  family={family}
                  onHover={() => setActiveIndex(index)}
                  onPick={() => pick(family)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {picked ? (
          <Specimen
            key={picked.family}
            bundledKeys={pickedBundledKeys}
            checkedKeys={checkedKeys}
            disabled={importing}
            family={picked}
            onToggle={toggleVariant}
          />
        ) : null}

        {catalog.status === 'error' ? (
          <p className="google-font-message google-font-error" role="alert">
            Could not reach Google Fonts.{' '}
            <button
              type="button"
              className="library-button"
              onClick={() => {
                setCatalog({ status: 'loading' });
                setCatalogAttempt((attempt) => attempt + 1);
              }}
            >
              Try again
            </button>
          </p>
        ) : null}
        {importState.status === 'failed' ? (
          <p className="google-font-message google-font-error" role="alert">
            {importState.message}
          </p>
        ) : null}

        <div className="google-font-footer">
          <p id={statusId} className="google-font-message" role="status">
            {status}
          </p>
          <button type="button" className="library-button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="library-button library-button-primary"
            disabled={!picked || checkedVariants.length === 0 || importing}
            onClick={() => {
              void handleAdd();
            }}
          >
            {checkedVariants.length > 1 ? `Add ${checkedVariants.length} fonts` : 'Add font'}
          </button>
        </div>
      </div>
    </div>
  );
}
