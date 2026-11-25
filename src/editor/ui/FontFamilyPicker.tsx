import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { groupFontOptions } from '../fonts/fontFamilyGroups';
import type { FontMenuEntry } from '../fonts/fontFamilyGroups';
import { useFontImport } from './FontImportContext';

export interface FontOption {
  family: string;
  sourceName: string;
  kind: 'system' | 'bundled' | 'uploaded';
}

interface FontFamilyPickerProps {
  disabled?: boolean;
  fonts: readonly FontOption[];
  labelId: string;
  mixed?: boolean;
  onChange: (family: string) => void;
  value: string;
}

type FamilyEntry = Extract<FontMenuEntry<FontOption>, { kind: 'family' }>;

/**
 * How long the pointer may cross other rows on its way to an open submenu
 * before the menu follows it to the row it is on.
 */
const SUBMENU_SWITCH_DELAY_MS = 200;
/** The least distance kept between a submenu and the edge of the window. */
const SUBMENU_WINDOW_MARGIN = 8;
/** The gap between a submenu and the menu it belongs to. */
const SUBMENU_GAP = 2;

function getFontPreviewFamily(family: string) {
  return `${JSON.stringify(family)}, "Trebuchet MS", sans-serif`;
}

function getSelectedFontIndex(fonts: readonly FontOption[], value: string) {
  const selectedIndex = fonts.findIndex((font) => font.family === value);
  return selectedIndex >= 0 ? selectedIndex : 0;
}

/** The member a family's submenu opens on: the selected font if it is one of them, else the regular weight. */
function getInitialMemberIndex(entry: FamilyEntry, selectedFontIndex: number) {
  const selectedMember = entry.members.findIndex((member) => member.index === selectedFontIndex);
  if (selectedMember >= 0) {
    return selectedMember;
  }
  const regularMember = entry.members.findIndex(
    (member) => member.option.family.toLowerCase() === entry.label.toLowerCase(),
  );
  return Math.max(regularMember, 0);
}

/**
 * The font control of the text properties: the current font between two arrow
 * buttons that step through the fonts, and a menu of all of them.
 *
 * In the menu, the weights of one typeface share a row that opens a submenu
 * (see `groupFontOptions`); the arrow buttons step through the flat list, one
 * weight after another. Left arrow, Enter or hovering opens a family's
 * submenu, which appears to its left; Right arrow or Escape leaves it.
 */
export function FontFamilyPicker({
  disabled = false,
  fonts,
  labelId,
  mixed = false,
  onChange,
  value,
}: FontFamilyPickerProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const entryRefs = useRef<Array<HTMLDivElement | null>>([]);
  const memberRefs = useRef<Array<HTMLDivElement | null>>([]);
  const switchTimerRef = useRef<number | null>(null);
  const listboxId = useId();
  const submenuId = `${listboxId}-submenu`;

  const entries = useMemo(() => groupFontOptions(fonts), [fonts]);
  // Which row of the menu each font of the flat list is in.
  const entryIndexByFontIndex = useMemo(() => {
    const result: number[] = [];
    entries.forEach((entry, entryIndex) => {
      if (entry.kind === 'font') {
        result[entry.index] = entryIndex;
      } else {
        entry.members.forEach((member) => {
          result[member.index] = entryIndex;
        });
      }
    });
    return result;
  }, [entries]);

  const selectedIndex = getSelectedFontIndex(fonts, value);
  const selectedEntryIndex = entryIndexByFontIndex[selectedIndex] ?? 0;

  const [isOpen, setIsOpen] = useState(false);
  const [activeEntryIndex, setActiveEntryIndex] = useState(selectedEntryIndex);
  // The family whose submenu is open, and the member the keyboard is on in it.
  // The family is kept by name: fonts still loading can move its row.
  const [openFamilyLabel, setOpenFamilyLabel] = useState<string | null>(null);
  const [activeMemberIndex, setActiveMemberIndex] = useState(0);
  const [submenuStyle, setSubmenuStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  const openFamilyIndex =
    isOpen && openFamilyLabel !== null
      ? entries.findIndex((entry) => entry.kind === 'family' && entry.label === openFamilyLabel)
      : -1;
  const openEntry = entries[openFamilyIndex];
  const openFamily = openEntry?.kind === 'family' ? openEntry : null;

  useEffect(() => {
    setActiveEntryIndex(selectedEntryIndex);
  }, [selectedEntryIndex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        !(event.target instanceof Node) ||
        rootRef.current?.contains(event.target) ||
        submenuRef.current?.contains(event.target)
      ) {
        return;
      }
      setIsOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    listboxRef.current?.focus();
    entryRefs.current[selectedEntryIndex]?.scrollIntoView({ block: 'nearest' });
    // Only when the menu opens: the row of the selected font is brought into view once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(
    () => () => {
      if (switchTimerRef.current !== null) {
        window.clearTimeout(switchTimerRef.current);
      }
    },
    [],
  );

  // The submenu is drawn outside the menu, which scrolls and would clip it, so
  // it is placed by hand: beside its family's row, to the left of the menu, and
  // inside the window.
  useLayoutEffect(() => {
    if (!openFamily) {
      return;
    }
    const listbox = listboxRef.current;

    function placeSubmenu() {
      const row = entryRefs.current[openFamilyIndex];
      const submenu = submenuRef.current;
      if (!row || !listbox || !submenu) {
        return;
      }
      const rowRect = row.getBoundingClientRect();
      const listRect = listbox.getBoundingClientRect();
      // The menu's own box, border included, is the list's parent.
      const menuRect = (listbox.parentElement ?? listbox).getBoundingClientRect();
      const { width, height } = submenu.getBoundingClientRect();
      const left = Math.max(SUBMENU_WINDOW_MARGIN, menuRect.left - SUBMENU_GAP - width);
      const lowestTop = window.innerHeight - height - SUBMENU_WINDOW_MARGIN;
      // Level with its row, as far as the menu's own edges and the window allow.
      const top = Math.max(
        SUBMENU_WINDOW_MARGIN,
        Math.min(Math.max(rowRect.top, listRect.top), listRect.bottom, lowestTop),
      );
      setSubmenuStyle({ left, top });
    }

    placeSubmenu();
    listbox?.addEventListener('scroll', placeSubmenu);
    window.addEventListener('resize', placeSubmenu);
    return () => {
      listbox?.removeEventListener('scroll', placeSubmenu);
      window.removeEventListener('resize', placeSubmenu);
    };
  }, [openFamily, openFamilyIndex]);

  function clearSwitchTimer() {
    if (switchTimerRef.current !== null) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
  }

  function closeSubmenu() {
    clearSwitchTimer();
    setOpenFamilyLabel(null);
  }

  function openSubmenu(entryIndex: number) {
    const entry = entries[entryIndex];
    if (entry?.kind !== 'family') {
      return;
    }
    clearSwitchTimer();
    if (openFamilyLabel !== entry.label) {
      setSubmenuStyle({ visibility: 'hidden' });
      setActiveMemberIndex(getInitialMemberIndex(entry, mixed ? -1 : selectedIndex));
    }
    setActiveEntryIndex(entryIndex);
    setOpenFamilyLabel(entry.label);
  }

  function closePicker(restoreFocus: boolean) {
    closeSubmenu();
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function openPicker() {
    if (disabled) {
      return;
    }
    setActiveEntryIndex(selectedEntryIndex);
    setOpenFamilyLabel(null);
    setIsOpen(true);
  }

  function selectIndex(index: number) {
    const selectedFont = fonts[index];
    if (!selectedFont) {
      return;
    }
    onChange(selectedFont.family);
    closePicker(true);
  }

  function cycleSelection(step: -1 | 1) {
    if (fonts.length === 0) {
      return;
    }

    const nextIndex = (selectedIndex + step + fonts.length) % fonts.length;
    const nextFont = fonts[nextIndex];
    if (!nextFont) {
      return;
    }

    onChange(nextFont.family);
  }

  function handleTriggerClick() {
    if (disabled) {
      return;
    }
    if (isOpen) {
      closePicker(false);
      return;
    }
    openPicker();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (disabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openPicker();
    }
  }

  function moveActiveEntry(entryIndex: number) {
    const nextIndex = Math.max(0, Math.min(entryIndex, entries.length - 1));
    setActiveEntryIndex(nextIndex);
    entryRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function moveActiveMember(family: FamilyEntry, memberIndex: number) {
    const nextIndex = Math.max(0, Math.min(memberIndex, family.members.length - 1));
    setActiveMemberIndex(nextIndex);
    memberRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
  }

  /** Keys while a family's submenu is open: they move within it. Returns whether the key was one of them. */
  function handleSubmenuKey(key: string, family: FamilyEntry): boolean {
    switch (key) {
      case 'ArrowDown':
        moveActiveMember(family, activeMemberIndex + 1);
        return true;
      case 'ArrowUp':
        moveActiveMember(family, activeMemberIndex - 1);
        return true;
      case 'Home':
        moveActiveMember(family, 0);
        return true;
      case 'End':
        moveActiveMember(family, family.members.length - 1);
        return true;
      case 'Enter':
      case ' ': {
        const member = family.members[activeMemberIndex];
        if (member) {
          selectIndex(member.index);
        }
        return true;
      }
      case 'ArrowRight':
      case 'Escape':
        closeSubmenu();
        return true;
      case 'ArrowLeft':
        return true;
      default:
        return false;
    }
  }

  /** Keys in the menu itself. Returns whether the key was one of them. */
  function handleMenuKey(key: string): boolean {
    const activeEntry = entries[activeEntryIndex];
    switch (key) {
      case 'ArrowDown':
        moveActiveEntry(activeEntryIndex + 1);
        return true;
      case 'ArrowUp':
        moveActiveEntry(activeEntryIndex - 1);
        return true;
      case 'Home':
        moveActiveEntry(0);
        return true;
      case 'End':
        moveActiveEntry(entries.length - 1);
        return true;
      case 'ArrowLeft':
        if (activeEntry?.kind !== 'family') {
          return false;
        }
        openSubmenu(activeEntryIndex);
        return true;
      case 'Enter':
      case ' ':
        if (activeEntry?.kind === 'family') {
          openSubmenu(activeEntryIndex);
        } else if (activeEntry) {
          selectIndex(activeEntry.index);
        }
        return true;
      case 'Escape':
        closePicker(true);
        return true;
      default:
        return false;
    }
  }

  function handleListboxKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      closePicker(false);
      return;
    }
    const handled = openFamily ? handleSubmenuKey(event.key, openFamily) : handleMenuKey(event.key);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * The pointer came onto a row. A family's submenu opens at once; while
   * another submenu is open the menu waits a moment first, so that the pointer
   * can cross rows on its way into that submenu.
   */
  function handleEntryPointerEnter(entryIndex: number) {
    if (openFamilyIndex === entryIndex) {
      clearSwitchTimer();
      return;
    }
    const follow = () => {
      switchTimerRef.current = null;
      if (entries[entryIndex]?.kind === 'family') {
        openSubmenu(entryIndex);
      } else {
        setOpenFamilyLabel(null);
      }
    };
    clearSwitchTimer();
    if (!openFamily) {
      follow();
    } else {
      switchTimerRef.current = window.setTimeout(follow, SUBMENU_SWITCH_DELAY_MS);
    }
  }

  const fontImport = useFontImport();

  const activeEntry = entries[activeEntryIndex];
  const activeMember = openFamily?.members[activeMemberIndex];
  let activeDescendantId: string | undefined;
  if (activeMember) {
    activeDescendantId = `${listboxId}-option-${activeMember.index}`;
  } else if (activeEntry?.kind === 'family') {
    activeDescendantId = `${listboxId}-family-${activeEntryIndex}`;
  } else if (activeEntry) {
    activeDescendantId = `${listboxId}-option-${activeEntry.index}`;
  }

  return (
    <div
      ref={rootRef}
      className={isOpen ? 'font-family-picker open' : 'font-family-picker'}
      data-editor-interactive="true"
    >
      <button
        aria-label="Previous font"
        className="font-family-picker-cycle-button"
        disabled={disabled}
        type="button"
        onClick={() => cycleSelection(-1)}
      >
        ↑
      </button>
      <button
        ref={triggerRef}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        className={[
          'font-family-picker-trigger',
          mixed ? 'font-family-picker-trigger-mixed' : '',
          isOpen ? 'font-family-picker-trigger-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={disabled}
        data-testid="font-family-picker-trigger"
        style={{
          fontFamily: mixed ? '"Trebuchet MS", sans-serif' : getFontPreviewFamily(value),
          fontStyle: 'normal',
          fontWeight: '400',
        }}
        type="button"
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="font-family-picker-trigger-text">
          {mixed ? 'Mixed fonts' : value}
        </span>
      </button>
      <button
        aria-label="Next font"
        className="font-family-picker-cycle-button"
        disabled={disabled}
        type="button"
        onClick={() => cycleSelection(1)}
      >
        ↓
      </button>

      {isOpen ? (
        <div className="font-family-picker-popover">
          {/* Above the list and not part of it: the ways to add a font stay in
              view wherever the list is scrolled to. */}
          {fontImport ? (
            <div className="font-family-picker-imports">
              <button
                type="button"
                className="font-family-picker-import"
                onClick={() => {
                  fontImport.importFromFile();
                  closePicker(true);
                }}
              >
                Import font from file…
              </button>
              {fontImport.importFromGoogle ? (
                <button
                  type="button"
                  className="font-family-picker-import"
                  onClick={() => {
                    // The dialog takes the focus, and gives it back to whatever had it
                    // before: the trigger, not this button, which is about to go.
                    triggerRef.current?.focus();
                    closePicker(false);
                    fontImport.importFromGoogle?.();
                  }}
                >
                  Import font from Google…
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            id={listboxId}
            ref={listboxRef}
            aria-activedescendant={activeDescendantId}
            aria-labelledby={labelId}
            aria-owns={openFamily ? submenuId : undefined}
            className="font-family-picker-listbox"
            data-testid="font-family-picker-listbox"
            role="listbox"
            tabIndex={0}
            onKeyDown={handleListboxKeyDown}
          >
            {entries.map((entry, entryIndex) => {
              const isActive = !openFamily && entryIndex === activeEntryIndex;

              if (entry.kind === 'family') {
                const isSubmenuOpen = openFamily === entry;
                const containsSelection =
                  !mixed && entry.members.some((member) => member.option.family === value);
                const previewFamily =
                  entry.members[getInitialMemberIndex(entry, -1)]?.option.family ?? entry.label;

                return (
                  <div
                    key={`family-${entry.label}`}
                    id={`${listboxId}-family-${entryIndex}`}
                    ref={(element) => {
                      entryRefs.current[entryIndex] = element;
                    }}
                    aria-controls={isSubmenuOpen ? submenuId : undefined}
                    aria-expanded={isSubmenuOpen}
                    aria-haspopup="listbox"
                    aria-selected={containsSelection}
                    className={[
                      'font-family-picker-option',
                      'font-family-picker-family',
                      isActive ? 'active' : '',
                      isSubmenuOpen ? 'open' : '',
                      containsSelection ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    style={{
                      fontFamily: getFontPreviewFamily(previewFamily),
                      fontSize: '1.3em',
                      fontStyle: 'normal',
                      fontWeight: '400',
                    }}
                    onClick={() => openSubmenu(entryIndex)}
                    onPointerEnter={() => handleEntryPointerEnter(entryIndex)}
                  >
                    <span className="font-family-picker-family-arrow" aria-hidden="true" />
                    <span className="font-family-picker-option-text">{entry.label}</span>
                  </div>
                );
              }

              const isSelected = !mixed && entry.option.family === value;

              return (
                <div
                  key={`${entry.option.kind}-${entry.option.family}`}
                  id={`${listboxId}-option-${entry.index}`}
                  ref={(element) => {
                    entryRefs.current[entryIndex] = element;
                  }}
                  aria-selected={isSelected}
                  className={[
                    'font-family-picker-option',
                    isActive ? 'active' : '',
                    isSelected ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="option"
                  style={{
                    fontFamily: getFontPreviewFamily(entry.option.family),
                    fontSize: '1.3em',
                    fontStyle: 'normal',
                    fontWeight: '400',
                  }}
                  onClick={() => selectIndex(entry.index)}
                  onPointerEnter={() => handleEntryPointerEnter(entryIndex)}
                >
                  <span className="font-family-picker-option-text">{entry.option.family}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {openFamily
        ? createPortal(
            <div
              id={submenuId}
              ref={submenuRef}
              aria-label={`${openFamily.label} weights`}
              className="font-family-picker-submenu"
              data-editor-interactive="true"
              data-testid="font-family-picker-submenu"
              role="listbox"
              style={submenuStyle}
              // Clicking in the submenu must not take the focus, and the keys, from the menu.
              onMouseDown={(event) => event.preventDefault()}
              onPointerEnter={clearSwitchTimer}
            >
              {openFamily.members.map((member, memberIndex) => {
                const isSelected = !mixed && member.option.family === value;

                return (
                  <div
                    key={`${member.option.kind}-${member.option.family}`}
                    id={`${listboxId}-option-${member.index}`}
                    ref={(element) => {
                      memberRefs.current[memberIndex] = element;
                    }}
                    aria-label={`${openFamily.label} ${member.label}`}
                    aria-selected={isSelected}
                    className={[
                      'font-family-picker-option',
                      memberIndex === activeMemberIndex ? 'active' : '',
                      isSelected ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    style={{
                      fontFamily: getFontPreviewFamily(member.option.family),
                      fontSize: '1.3em',
                      fontStyle: 'normal',
                      fontWeight: '400',
                    }}
                    onClick={() => selectIndex(member.index)}
                    onPointerEnter={() => setActiveMemberIndex(memberIndex)}
                  >
                    <span className="font-family-picker-option-text">{member.label}</span>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
