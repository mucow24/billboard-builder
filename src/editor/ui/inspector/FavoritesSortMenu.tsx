import { Fragment, useEffect, useId, useRef, useState } from 'react';

import { joinClassNames } from '../toolbarUtils';

import type { FavoritesSortDirection, FavoritesSortField } from './favoritesSort';

interface FavoritesSortMenuProps {
  onSortDirectionChange: (direction: FavoritesSortDirection) => void;
  onSortFieldChange: (field: FavoritesSortField) => void;
  sortDirection: FavoritesSortDirection;
  sortField: FavoritesSortField;
}

interface SortMenuItem {
  kind: 'field' | 'direction';
  label: string;
  value: FavoritesSortDirection | FavoritesSortField;
}

const SORT_MENU_ITEMS: readonly SortMenuItem[] = [
  { kind: 'field', label: 'Manual sort', value: 'manual' },
  { kind: 'field', label: 'Name', value: 'name' },
  { kind: 'field', label: 'Color', value: 'color' },
  { kind: 'field', label: 'Parts', value: 'parts' },
  { kind: 'direction', label: 'Ascending', value: 'asc' },
  { kind: 'direction', label: 'Descending', value: 'desc' },
];

const SORT_FIELD_LABELS: Record<FavoritesSortField, string> = {
  manual: 'Manual sort',
  name: 'Name',
  color: 'Color',
  parts: 'Parts',
};

export function FavoritesSortMenu({
  onSortDirectionChange,
  onSortFieldChange,
  sortDirection,
  sortField,
}: FavoritesSortMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => getFieldItemIndex(sortField));
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }

      if (event.key === 'Tab') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const item = itemRefs.current[activeIndex];
    if (!item) {
      return;
    }

    window.requestAnimationFrame(() => item.focus());
  }, [activeIndex, isOpen]);

  function openMenu() {
    setActiveIndex(getFieldItemIndex(sortField));
    setIsOpen(true);
  }

  function closeMenu() {
    setIsOpen(false);
  }

  function toggleMenu() {
    if (isOpen) {
      closeMenu();
      return;
    }
    openMenu();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    openMenu();
  }

  function handleItemKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index + 1) % SORT_MENU_ITEMS.length);
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index - 1 + SORT_MENU_ITEMS.length) % SORT_MENU_ITEMS.length);
        return;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        return;
      case 'End':
        event.preventDefault();
        setActiveIndex(SORT_MENU_ITEMS.length - 1);
        return;
      default:
        return;
    }
  }

  function handleItemSelect(item: SortMenuItem) {
    if (item.kind === 'field') {
      onSortFieldChange(item.value as FavoritesSortField);
    } else {
      onSortDirectionChange(item.value as FavoritesSortDirection);
    }
    closeMenu();
  }

  return (
    <div
      ref={rootRef}
      className={joinClassNames('favorites-sort', 'inspector-rail-menu', isOpen && 'open')}
    >
      <button
        ref={triggerRef}
        type="button"
        className={joinClassNames(
          'inspector-rail-menu-trigger',
          isOpen && 'inspector-rail-menu-trigger-open',
        )}
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={toggleMenu}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="inspector-rail-menu-label">
          {getFavoritesSortTriggerLabel(sortField, sortDirection)}
        </span>
        <span className="inspector-rail-menu-caret" aria-hidden="true">
          ▼
        </span>
      </button>

      {isOpen ? (
        <div
          id={menuId}
          className="inspector-rail-menu-panel"
          role="group"
          aria-label="Sort favorites"
        >
          {SORT_MENU_ITEMS.map((item, index) => (
            <Fragment key={`${item.kind}-${item.value}`}>
              {index === getDirectionSectionStartIndex() ? (
                <div className="inspector-rail-menu-divider" aria-hidden="true" />
              ) : null}
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                className={joinClassNames(
                  'inspector-rail-menu-item',
                  isItemSelected(item, sortField, sortDirection) && 'selected',
                )}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => handleItemSelect(item)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleItemKeyDown(event, index)}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getFieldItemIndex(sortField: FavoritesSortField): number {
  return SORT_MENU_ITEMS.findIndex(
    (item) => item.kind === 'field' && item.value === sortField,
  );
}

function getDirectionSectionStartIndex(): number {
  return SORT_MENU_ITEMS.findIndex((item) => item.kind === 'direction');
}

function isItemSelected(
  item: SortMenuItem,
  sortField: FavoritesSortField,
  sortDirection: FavoritesSortDirection,
): boolean {
  return item.kind === 'field' ? item.value === sortField : item.value === sortDirection;
}

function getFavoritesSortTriggerLabel(
  sortField: FavoritesSortField,
  sortDirection: FavoritesSortDirection,
): string {
  if (sortField === 'manual') {
    return SORT_FIELD_LABELS.manual;
  }

  return `${SORT_FIELD_LABELS[sortField]} (${sortDirection === 'asc' ? 'Asc' : 'Desc'})`;
}
