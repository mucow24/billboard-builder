import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

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

function getFontPreviewFamily(family: string) {
  return `${JSON.stringify(family)}, "Trebuchet MS", sans-serif`;
}

function getSelectedFontIndex(fonts: readonly FontOption[], value: string) {
  const selectedIndex = fonts.findIndex((font) => font.family === value);
  return selectedIndex >= 0 ? selectedIndex : 0;
}

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    getSelectedFontIndex(fonts, value),
  );

  const selectedIndex = getSelectedFontIndex(fonts, value);

  useEffect(() => {
    setActiveIndex(getSelectedFontIndex(fonts, value));
  }, [fonts, value]);

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

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    listboxRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  function closePicker(restoreFocus: boolean) {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function openPicker() {
    if (disabled) {
      return;
    }
    setActiveIndex(selectedIndex);
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

  function handleListboxKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((currentIndex) => Math.min(currentIndex + 1, fonts.length - 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
        return;
      case 'Home':
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(0);
        return;
      case 'End':
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(Math.max(fonts.length - 1, 0));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        selectIndex(activeIndex);
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        closePicker(true);
        return;
      case 'Tab':
        closePicker(false);
        return;
      default:
        return;
    }
  }

  const onImportFont = useFontImport();

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
          <div
            id={listboxId}
            ref={listboxRef}
            aria-activedescendant={`${listboxId}-option-${activeIndex}`}
            aria-labelledby={labelId}
            className="font-family-picker-listbox"
            data-testid="font-family-picker-listbox"
            role="listbox"
            tabIndex={0}
            onKeyDown={handleListboxKeyDown}
          >
            {onImportFont ? (
              <button
                type="button"
                className="font-family-picker-import"
                onClick={() => {
                  onImportFont();
                  closePicker(true);
                }}
              >
                Import font…
              </button>
            ) : null}
            {fonts.map((font, index) => {
              const isSelected = !mixed && font.family === value;
              const isActive = index === activeIndex;

              return (
                <div
                  key={`${font.kind}-${font.family}`}
                  id={`${listboxId}-option-${index}`}
                  ref={(element) => {
                    optionRefs.current[index] = element;
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
                    fontFamily: getFontPreviewFamily(font.family),
                    fontSize: '1.3em',
                    fontStyle: 'normal',
                    fontWeight: '400',
                  }}
                  onClick={() => selectIndex(index)}
                >
                  <span className="font-family-picker-option-text">{font.family}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
