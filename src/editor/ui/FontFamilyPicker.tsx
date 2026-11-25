import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { groupFontOptions } from '../fonts/fontFamilyGroups';
import type { FontMenuEntry } from '../fonts/fontFamilyGroups';
import { buildFontMenuSections, fontMenuEntryName } from '../fonts/fontMenuSections';
import type { FontMenuSectionId } from '../fonts/fontMenuSections';
import { useFontImport } from './FontImportContext';
import { useFontMenuData } from './FontMenuContext';
import {
  loadCollapsedFontMenuSections,
  saveCollapsedFontMenuSections,
} from './fontMenuPreferences';

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

type Entry = FontMenuEntry<FontOption>;
type FamilyEntry = Extract<Entry, { kind: 'family' }>;

/** One row of the open menu. A font is a row in each section that lists it. */
interface MenuRow {
  /** Names the row among all rows, and stays the same while the list of fonts changes around it. */
  key: string;
  sectionId: FontMenuSectionId;
  entryIndex: number;
}

/** The section of the import commands, which is not a list of fonts. */
const IMPORT_SECTION_ID = 'import';

/**
 * How long the pointer may be off a family's row, on its way to the submenu or
 * across other rows, before the submenu closes or follows it.
 */
const SUBMENU_SWITCH_DELAY_MS = 200;
/** The least distance kept between a submenu and the edge of the window. */
const SUBMENU_WINDOW_MARGIN = 8;
/** The gap between a submenu and the menu it belongs to. */
const SUBMENU_GAP = 2;
/** How wide the menu is, in widths of the font control it hangs from. */
const MENU_WIDTH_RATIO = 2.25;
/** The least distance kept between the menu and the edge of the window. */
const MENU_WINDOW_MARGIN = 8;
/** The least height the menu's list is given, however little room is under the font control. */
const MENU_MIN_LIST_HEIGHT = 160;
/** Why "Import font from Google…" is greyed out, as its tooltip. */
const GOOGLE_IMPORT_UNAVAILABLE_HINT =
  'Not available: this build has no Google Fonts API key (VITE_GOOGLE_FONTS_API_KEY in .env.local).';
/**
 * A row is drawn in its own font once it is in view, or within this distance
 * of it, so that it is ready before it is scrolled to.
 */
const FONT_PREVIEW_MARGIN = 400;

/**
 * Whether a row is no longer at `top`, where it was when the pointer came onto
 * it or its submenu opened: the list has scrolled under the pointer, and a
 * submenu must not open, or stay open, for a row that moved away.
 */
function rowHasMoved(rowElement: Element, top: number) {
  return Math.abs(rowElement.getBoundingClientRect().top - top) > 0.5;
}

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

function getEntryKey(entry: Entry) {
  return entry.kind === 'family'
    ? `family-${entry.label}`
    : `${entry.option.kind}-${entry.option.family}`;
}

function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M8 1.7l1.95 3.95 4.35.63-3.15 3.07.74 4.34L8 11.63l-3.89 2.05.74-4.34L1.7 6.28l4.35-.63z" />
    </svg>
  );
}

interface FontMenuRowProps {
  domId: string;
  entry: Entry;
  /** Whether the row is a favorite; null when the menu has no favorites, and so no stars. */
  favorite: boolean | null;
  isActive: boolean;
  isSelected: boolean;
  isSubmenuOpen: boolean;
  rowKey: string;
  submenuId: string;
}

/**
 * A row of the menu: a font, or a family that opens a submenu. It takes no
 * handlers: the menu finds the row a click or the pointer is on by its
 * `data-row-key`, so that a row is drawn again only when it itself changes.
 */
const FontMenuRow = memo(function FontMenuRow({
  domId,
  entry,
  favorite,
  isActive,
  isSelected,
  isSubmenuOpen,
  rowKey,
  submenuId,
}: FontMenuRowProps) {
  const isFamily = entry.kind === 'family';
  const name = fontMenuEntryName(entry);
  const previewFont = getFontPreviewFamily(
    isFamily
      ? (entry.members[getInitialMemberIndex(entry, -1)]?.option.family ?? entry.label)
      : entry.option.family,
  );
  const elementRef = useRef<HTMLDivElement | null>(null);

  // The menu sets the row's font once the row is near view (see
  // `showFontPreviewsInView`). A row already in its font follows a change of it.
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (element?.dataset.previewShown) {
      element.style.fontFamily = previewFont;
    }
  }, [previewFont]);

  return (
    <div
      ref={elementRef}
      id={domId}
      aria-controls={isFamily && isSubmenuOpen ? submenuId : undefined}
      aria-expanded={isFamily ? isSubmenuOpen : undefined}
      aria-haspopup={isFamily ? 'listbox' : undefined}
      // The name alone: the row also holds its star, which has a name of its own.
      aria-label={name}
      aria-selected={isSelected}
      className={[
        'font-family-picker-option',
        isFamily ? 'font-family-picker-family' : '',
        isActive ? 'active' : '',
        isSubmenuOpen ? 'open' : '',
        isSelected ? 'selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-preview-font={previewFont}
      data-row-key={rowKey}
      role="option"
      // A symbol font's own name cannot be read in its preview.
      title={name}
    >
      <span
        className={isFamily ? 'font-family-picker-family-arrow' : 'font-family-picker-arrow-slot'}
        aria-hidden="true"
      />
      <span className="font-family-picker-option-text">{name}</span>
      {favorite === null ? null : (
        <button
          type="button"
          aria-label={favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
          aria-pressed={favorite}
          className="font-family-picker-star"
          data-favorite-toggle="true"
          tabIndex={-1}
          title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <StarIcon />
        </button>
      )}
    </div>
  );
});

/**
 * The font control of the text properties: the current font between two arrow
 * buttons that step through the fonts, and a menu of all of them.
 *
 * The menu is in sections with headers that close and open them: the ways to
 * import a font, the fonts the canvas uses, the favorites, and every font. A
 * font is listed in each section it belongs to, with the same star in each;
 * "All fonts" always has them all. While a section is scrolled through, its
 * header stays at the top of the menu.
 *
 * The weights of one typeface share a row that opens a submenu (see
 * `groupFontOptions`); the arrow buttons step through the flat list, one
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const memberRefs = useRef<Array<HTMLDivElement | null>>([]);
  const switchTimerRef = useRef<number | null>(null);
  // Where the pointer last was, the row it was on, and whether the menu has
  // scrolled since: see `handleListPointerMove`.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRowKeyRef = useRef<string | null>(null);
  const scrolledSincePointerMoveRef = useRef(false);
  // Where the row of the open submenu was when the submenu was placed beside it.
  const openRowTopRef = useRef(0);
  const listboxId = useId();
  const submenuId = `${listboxId}-submenu`;

  const fontImport = useFontImport();
  const menuData = useFontMenuData();

  // The inspector hands over a new list on every render, so on every frame of
  // a drag: the rows are worked out again only when the fonts themselves change.
  const fontsSignature = fonts
    .map((font) => `${font.kind}:${font.family}:${font.sourceName}`)
    .join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => groupFontOptions(fonts), [fontsSignature]);
  // Which row of "All fonts" each font of the flat list is in.
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

  const canvasFamilies = menuData?.canvasFamilies ?? null;
  const favoriteNames = menuData?.favoriteNames ?? null;
  const sections = useMemo(
    () => buildFontMenuSections(entries, { canvasFamilies, favoriteNames }),
    [entries, canvasFamilies, favoriteNames],
  );
  const favoriteNameSet = useMemo(
    () => (favoriteNames ? new Set(favoriteNames) : null),
    [favoriteNames],
  );

  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(
    () => new Set(loadCollapsedFontMenuSections()),
  );
  // The rows the keyboard moves through: those of the open sections, top to bottom.
  const rows = useMemo<MenuRow[]>(
    () =>
      sections.flatMap((section) =>
        collapsedSections.has(section.id)
          ? []
          : section.entryIndexes.map((entryIndex) => ({
              key: `${section.id}|${getEntryKey(entries[entryIndex])}`,
              sectionId: section.id,
              entryIndex,
            })),
      ),
    [sections, collapsedSections, entries],
  );
  const toMenuRow = (sectionId: FontMenuSectionId, entryIndex: number): MenuRow => ({
    key: `${sectionId}|${getEntryKey(entries[entryIndex])}`,
    sectionId,
    entryIndex,
  });

  const selectedIndex = getSelectedFontIndex(fonts, value);
  const selectedEntryIndex = entryIndexByFontIndex[selectedIndex] ?? 0;

  const [isOpen, setIsOpen] = useState(false);
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  // The row whose submenu is open, and the member the keyboard is on in it.
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [activeMemberIndex, setActiveMemberIndex] = useState(0);

  const activeRowIndex = activeRowKey === null ? -1 : rows.findIndex((row) => row.key === activeRowKey);
  const openRow =
    isOpen && openRowKey !== null ? (rows.find((row) => row.key === openRowKey) ?? null) : null;
  const openRowEntry = openRow ? entries[openRow.entryIndex] : undefined;
  const openFamily = openRowEntry?.kind === 'family' ? openRowEntry : null;

  function getRowDomId(row: MenuRow) {
    const entry = entries[row.entryIndex];
    return entry.kind === 'family'
      ? `${listboxId}-${row.sectionId}-family-${row.entryIndex}`
      : `${listboxId}-${row.sectionId}-option-${entry.index}`;
  }

  function scrollRowIntoView(row: MenuRow | undefined) {
    if (row) {
      document.getElementById(getRowDomId(row))?.scrollIntoView({ block: 'nearest' });
    }
  }

  const openRowDomId = openRow && openFamily ? getRowDomId(openRow) : null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        !(event.target instanceof Node) ||
        rootRef.current?.contains(event.target) ||
        popoverRef.current?.contains(event.target) ||
        submenuRef.current?.contains(event.target)
      ) {
        return;
      }
      setIsOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen]);

  // The menu is wider than the properties panel, which clips what sticks out
  // of it, so it is drawn on the page itself and placed by hand: under the font
  // control, its right edge on the control's, and no taller than the window
  // has room for. It follows the control when the panel scrolls.
  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function placePopover() {
      const root = rootRef.current;
      const popover = popoverRef.current;
      if (!root || !popover) {
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const width = Math.min(
        rootRect.width * MENU_WIDTH_RATIO,
        window.innerWidth - 2 * MENU_WINDOW_MARGIN,
      );
      const top = rootRect.bottom - 1;
      const chrome = popover.offsetHeight - (scrollerRef.current?.offsetHeight ?? 0);
      const listRoom = Math.max(
        MENU_MIN_LIST_HEIGHT,
        window.innerHeight - top - chrome - MENU_WINDOW_MARGIN,
      );
      popover.style.width = `${width}px`;
      popover.style.left = `${Math.max(MENU_WINDOW_MARGIN, rootRect.right - width)}px`;
      popover.style.top = `${top}px`;
      popover.style.setProperty('--font-menu-list-room', `${listRoom}px`);
    }

    function handleScrollOutside(event: Event) {
      if (
        event.target instanceof Node &&
        (popoverRef.current?.contains(event.target) || submenuRef.current?.contains(event.target))
      ) {
        return;
      }
      placePopover();
    }

    placePopover();
    // With the menu in place, and before it is first painted: the keys go to
    // the list, and the row of the selected font is brought into view.
    listboxRef.current?.focus({ preventScroll: true });
    scrollRowIntoView(rows[activeRowIndex]);
    window.addEventListener('resize', placePopover);
    window.addEventListener('scroll', handleScrollOutside, true);
    return () => {
      window.removeEventListener('resize', placePopover);
      window.removeEventListener('scroll', handleScrollOutside, true);
    };
    // Only when the menu opens: the row of the selected font is brought into view once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /**
   * Draws the rows in or near view in their own fonts.
   *
   * Laying out a line of text in a font for the first time is slow, and every
   * row has a font of its own: with all of them set at once the menu took a
   * third of a second to open. So a row starts in the font of the interface,
   * and is given its own when it comes near the part of the list in view. This
   * runs before the browser paints, so no row is seen in the wrong font.
   */
  function showFontPreviewsInView() {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const view = scroller.getBoundingClientRect();
    const rowsToShow = [
      ...scroller.querySelectorAll<HTMLElement>('[data-preview-font]:not([data-preview-shown])'),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.bottom >= view.top - FONT_PREVIEW_MARGIN && rect.top <= view.bottom + FONT_PREVIEW_MARGIN
      );
    });
    for (const element of rowsToShow) {
      element.style.fontFamily = element.dataset.previewFont ?? '';
      element.dataset.previewShown = 'true';
    }
  }

  // After every render of the open menu: rows may have come into view (a
  // section opened, a favorite added) or have just been made.
  useLayoutEffect(() => {
    if (isOpen) {
      showFontPreviewsInView();
    }
  });

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
  // inside the window. This runs before the browser paints, and writes the
  // place straight onto the element: nothing is drawn twice.
  useLayoutEffect(() => {
    if (!openRowDomId) {
      return;
    }

    function placeSubmenu() {
      const row = openRowDomId ? document.getElementById(openRowDomId) : null;
      const scroller = scrollerRef.current;
      const submenu = submenuRef.current;
      if (!row || !scroller || !submenu) {
        return;
      }
      const rowRect = row.getBoundingClientRect();
      openRowTopRef.current = rowRect.top;
      const listRect = scroller.getBoundingClientRect();
      // The menu's own box, border included, is the scrolling list's parent.
      const menuRect = (scroller.parentElement ?? scroller).getBoundingClientRect();
      const { width, height } = submenu.getBoundingClientRect();
      const left = Math.max(SUBMENU_WINDOW_MARGIN, menuRect.left - SUBMENU_GAP - width);
      const lowestTop = window.innerHeight - height - SUBMENU_WINDOW_MARGIN;
      // Level with its row, as far as the menu's own edges and the window allow.
      const top = Math.max(
        SUBMENU_WINDOW_MARGIN,
        Math.min(Math.max(rowRect.top, listRect.top), listRect.bottom, lowestTop),
      );
      submenu.style.left = `${left}px`;
      submenu.style.top = `${top}px`;
    }

    placeSubmenu();
    window.addEventListener('resize', placeSubmenu);
    return () => window.removeEventListener('resize', placeSubmenu);
  }, [openRowDomId, openFamily]);

  function clearSwitchTimer() {
    if (switchTimerRef.current !== null) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
  }

  function closeSubmenu() {
    clearSwitchTimer();
    setOpenRowKey(null);
  }

  /** Closes the submenu unless the pointer comes back to it, or to its row, in a moment. */
  function closeSubmenuSoon() {
    clearSwitchTimer();
    if (openFamily) {
      switchTimerRef.current = window.setTimeout(() => {
        switchTimerRef.current = null;
        setOpenRowKey(null);
      }, SUBMENU_SWITCH_DELAY_MS);
    }
  }

  function openSubmenu(row: MenuRow) {
    const entry = entries[row.entryIndex];
    if (entry?.kind !== 'family') {
      return;
    }
    clearSwitchTimer();
    if (openRowKey !== row.key) {
      setActiveMemberIndex(getInitialMemberIndex(entry, mixed ? -1 : selectedIndex));
    }
    setActiveRowKey(row.key);
    setOpenRowKey(row.key);
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
    // The first row of the selected font: in "In this canvas", when the menu has that section.
    const selectedRow = rows.find((row) => row.entryIndex === selectedEntryIndex) ?? rows[0];
    setActiveRowKey(selectedRow?.key ?? null);
    setOpenRowKey(null);
    pointerRef.current = null;
    hoveredRowKeyRef.current = null;
    scrolledSincePointerMoveRef.current = false;
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

  function toggleSection(sectionId: string) {
    closeSubmenu();
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (!next.delete(sectionId)) {
        next.add(sectionId);
      }
      saveCollapsedFontMenuSections([...next]);
      return next;
    });
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

  function moveActiveRow(rowIndex: number) {
    const nextIndex = Math.max(0, Math.min(rowIndex, rows.length - 1));
    const row = rows[nextIndex];
    if (!row) {
      return;
    }
    setActiveRowKey(row.key);
    scrollRowIntoView(row);
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
    const activeRow = rows[activeRowIndex];
    const activeEntry = activeRow ? entries[activeRow.entryIndex] : undefined;
    switch (key) {
      case 'ArrowDown':
        moveActiveRow(activeRowIndex + 1);
        return true;
      case 'ArrowUp':
        moveActiveRow(activeRowIndex - 1);
        return true;
      case 'Home':
        moveActiveRow(0);
        return true;
      case 'End':
        moveActiveRow(rows.length - 1);
        return true;
      case 'ArrowLeft':
        if (!activeRow || activeEntry?.kind !== 'family') {
          return false;
        }
        openSubmenu(activeRow);
        return true;
      case 'Enter':
      case ' ':
        if (activeRow && activeEntry?.kind === 'family') {
          openSubmenu(activeRow);
        } else if (activeEntry?.kind === 'font') {
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
   * The pointer came onto a row, or left the rows (`null`: a header, say). A
   * family's submenu opens at once; while another submenu is open the menu
   * waits a moment first, so that the pointer can cross rows on its way into
   * that submenu. If the row has scrolled away by then, the pointer is no
   * longer on it, and its submenu stays shut.
   */
  function handleRowHover(rowKey: string | null, rowElement: Element | null) {
    if (rowKey !== null && rowKey === openRow?.key) {
      clearSwitchTimer();
      return;
    }
    const rowTop = rowElement?.getBoundingClientRect().top;
    const follow = () => {
      switchTimerRef.current = null;
      const row = rowKey === null ? undefined : rows.find((candidate) => candidate.key === rowKey);
      const rowIsInPlace =
        !rowElement || rowTop === undefined || !rowHasMoved(rowElement, rowTop);
      if (row && rowIsInPlace && entries[row.entryIndex]?.kind === 'family') {
        openSubmenu(row);
      } else {
        setOpenRowKey(null);
      }
    };
    clearSwitchTimer();
    if (!openFamily) {
      follow();
    } else {
      switchTimerRef.current = window.setTimeout(follow, SUBMENU_SWITCH_DELAY_MS);
    }
  }

  /**
   * One handler for the whole list finds the row the pointer is on, so the
   * rows need none of their own.
   *
   * A pointer that has not moved is ignored after a scroll: the browser
   * reports the rows that scroll past under a resting pointer as if it had
   * moved onto each, and every family among them would open its submenu.
   */
  function handleListPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const last = pointerRef.current;
    const moved = !last || last.x !== event.clientX || last.y !== event.clientY;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    if (!moved && scrolledSincePointerMoveRef.current) {
      return;
    }
    scrolledSincePointerMoveRef.current = false;

    const rowElement =
      event.target instanceof Element ? event.target.closest('[data-row-key]') : null;
    const rowKey = rowElement?.getAttribute('data-row-key') ?? null;
    if (rowKey === hoveredRowKeyRef.current) {
      return;
    }
    hoveredRowKeyRef.current = rowKey;
    handleRowHover(rowKey, rowElement);
  }

  function handleScroll() {
    showFontPreviewsInView();
    scrolledSincePointerMoveRef.current = true;
    // Whatever row the pointer is on next, it has to be looked at afresh.
    hoveredRowKeyRef.current = null;
    // The submenu belongs beside its row: it goes when the row moves away. The
    // row is looked at, because a scroll is reported a moment after it happens:
    // one that brought the row into view may be reported after a click on the
    // row has opened the submenu.
    const openRowElement = openRowDomId ? document.getElementById(openRowDomId) : null;
    if (openRowElement && rowHasMoved(openRowElement, openRowTopRef.current)) {
      // Only this submenu: one waiting to open for the row the pointer has moved to still does.
      setOpenRowKey(null);
    }
  }

  function handleListClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const rowKey = event.target.closest('[data-row-key]')?.getAttribute('data-row-key');
    const row = rowKey ? rows.find((candidate) => candidate.key === rowKey) : undefined;
    if (!row) {
      return;
    }
    const entry = entries[row.entryIndex];
    if (event.target.closest('[data-favorite-toggle]')) {
      menuData?.toggleFavorite(fontMenuEntryName(entry));
    } else if (entry.kind === 'family') {
      openSubmenu(row);
    } else {
      selectIndex(entry.index);
    }
  }

  /** Clicking a header or a star must not take the focus, and the keys, from the list. */
  function keepFocusOnList(event: ReactMouseEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest('button')) {
      event.preventDefault();
    }
  }

  const activeRow = rows[activeRowIndex];
  const activeMember = openFamily?.members[activeMemberIndex];
  let activeDescendantId: string | undefined;
  if (activeMember) {
    activeDescendantId = `${listboxId}-member-${activeMember.index}`;
  } else if (activeRow) {
    activeDescendantId = getRowDomId(activeRow);
  }

  function renderSectionHeader(sectionId: string, title: string, headerId: string, bodyId: string) {
    const expanded = !collapsedSections.has(sectionId);
    return (
      <button
        type="button"
        id={headerId}
        aria-controls={bodyId}
        aria-expanded={expanded}
        className="property-block-toggle font-menu-section-toggle"
        tabIndex={-1}
        onClick={() => toggleSection(sectionId)}
      >
        <span>{title}</span>
        <span className="property-block-toggle-icon" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
    );
  }

  const importHeaderId = `${listboxId}-${IMPORT_SECTION_ID}-header`;
  const importBodyId = `${listboxId}-${IMPORT_SECTION_ID}-body`;
  // Every row of the selected font is marked, in each section that lists it.
  const selectedFontIsListed = !mixed && fonts[selectedIndex]?.family === value;

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

      {isOpen
        ? createPortal(
        <div
          ref={popoverRef}
          className="font-family-picker-popover"
          data-editor-interactive="true"
          onPointerLeave={() => {
            hoveredRowKeyRef.current = null;
            closeSubmenuSoon();
          }}
        >
          <div
            ref={scrollerRef}
            className="font-family-picker-scroller"
            data-testid="font-family-picker-scroller"
            onScroll={handleScroll}
          >
            {fontImport ? (
              <section
                className={
                  collapsedSections.has(IMPORT_SECTION_ID)
                    ? 'font-menu-section collapsed'
                    : 'font-menu-section expanded'
                }
                data-testid="font-menu-section-import"
                onMouseDown={(event) => {
                  // The header only: the import buttons take the focus themselves.
                  if (
                    event.target instanceof Element &&
                    event.target.closest('.font-menu-section-toggle')
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                {renderSectionHeader(IMPORT_SECTION_ID, 'Import', importHeaderId, importBodyId)}
                {collapsedSections.has(IMPORT_SECTION_ID) ? null : (
                  <div id={importBodyId} className="font-family-picker-imports">
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
                    {/* Always listed. Without a key for Google Fonts it is greyed out and
                        says why: an item that is simply missing looks like a bug. It is
                        not `disabled`, which would keep its tooltip from showing. */}
                    <button
                      type="button"
                      aria-disabled={fontImport.importFromGoogle ? undefined : true}
                      className="font-family-picker-import"
                      title={fontImport.importFromGoogle ? undefined : GOOGLE_IMPORT_UNAVAILABLE_HINT}
                      onClick={() => {
                        if (!fontImport.importFromGoogle) {
                          return;
                        }
                        // The dialog takes the focus, and gives it back to whatever had it
                        // before: the trigger, not this button, which is about to go.
                        triggerRef.current?.focus();
                        closePicker(false);
                        fontImport.importFromGoogle();
                      }}
                    >
                      Import font from Google…
                    </button>
                  </div>
                )}
              </section>
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
              onClick={handleListClick}
              onKeyDown={handleListboxKeyDown}
              onMouseDown={keepFocusOnList}
              onPointerMove={handleListPointerMove}
            >
              {sections.map((section) => {
                const collapsed = collapsedSections.has(section.id);
                const headerId = `${listboxId}-${section.id}-header`;
                const bodyId = `${listboxId}-${section.id}-body`;
                let body = null;
                if (!collapsed && section.entryIndexes.length === 0) {
                  body = <div className="font-menu-section-empty">{section.emptyText}</div>;
                } else if (!collapsed) {
                  body = section.entryIndexes.map((entryIndex) => {
                    const entry = entries[entryIndex];
                    const row = toMenuRow(section.id, entryIndex);
                    return (
                      <FontMenuRow
                        key={row.key}
                        domId={getRowDomId(row)}
                        entry={entry}
                        favorite={
                          favoriteNameSet ? favoriteNameSet.has(fontMenuEntryName(entry)) : null
                        }
                        isActive={!openFamily && row.key === activeRowKey}
                        isSelected={selectedFontIsListed && entryIndex === selectedEntryIndex}
                        isSubmenuOpen={openFamily !== null && row.key === openRow?.key}
                        rowKey={row.key}
                        submenuId={submenuId}
                      />
                    );
                  });
                }
                return (
                  <div
                    key={section.id}
                    aria-labelledby={headerId}
                    className={collapsed ? 'font-menu-section collapsed' : 'font-menu-section expanded'}
                    data-testid={`font-menu-section-${section.id}`}
                    role="group"
                  >
                    {renderSectionHeader(section.id, section.title, headerId, bodyId)}
                    {collapsed ? null : (
                      <div id={bodyId} className="font-menu-section-body">
                        {body}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}

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
              // Clicking in the submenu must not take the focus, and the keys, from the menu.
              onMouseDown={(event) => event.preventDefault()}
              onPointerEnter={clearSwitchTimer}
              onPointerLeave={closeSubmenuSoon}
            >
              {openFamily.members.map((member, memberIndex) => {
                const isSelected = !mixed && member.option.family === value;

                return (
                  <div
                    key={`${member.option.kind}-${member.option.family}`}
                    id={`${listboxId}-member-${member.index}`}
                    ref={(element) => {
                      memberRefs.current[memberIndex] = element;
                    }}
                    aria-label={`${openFamily.label} ${member.label}`}
                    aria-selected={isSelected}
                    className={[
                      'font-family-picker-option',
                      'font-family-picker-member',
                      memberIndex === activeMemberIndex ? 'active' : '',
                      isSelected ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    style={{ fontFamily: getFontPreviewFamily(member.option.family) }}
                    title={member.option.family}
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
