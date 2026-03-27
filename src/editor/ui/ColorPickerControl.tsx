import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Wheel, type ColorResult } from '@uiw/react-color';

import {
  commitHexColorInput,
  hexColorToHsla,
  hexColorToHsva,
  hslaToStoredHexColor,
  hsvaToStoredHexColor,
  toStoredHexColor,
} from '../ui/colors';

interface ColorPickerControlProps {
  disabled?: boolean;
  label: string;
  mixed?: boolean;
  title?: string;
  value: string;
  onChange: (value: string) => void;
  variant?: 'default' | 'compact';
}

function clampSliderValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computePickerPosition(
  triggerRect: { top: number; bottom: number; left: number; right: number },
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { top: number; right: number } {
  if (triggerRect.bottom + panelHeight <= viewportHeight) {
    return { top: triggerRect.bottom, right: viewportWidth - triggerRect.right };
  }
  return {
    top: Math.max(0, viewportHeight - panelHeight),
    right: viewportWidth - triggerRect.left + 4,
  };
}

export function ColorPickerControl({
  disabled = false,
  label,
  mixed = false,
  title,
  value,
  onChange,
  variant = 'default',
}: ColorPickerControlProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const storedValue = toStoredHexColor(value);
  const hsva = hexColorToHsva(storedValue);
  const hsla = hexColorToHsla(storedValue);
  const [isOpen, setIsOpen] = useState(false);
  const [draftHex, setDraftHex] = useState(storedValue);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setDraftHex(storedValue);
  }, [storedValue]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Compute position when panel opens
    const btn = triggerRef.current;
    const panel = panelRef.current;
    if (btn && panel) {
      setPanelStyle(computePickerPosition(
        btn.getBoundingClientRect(),
        panel.offsetHeight,
        document.documentElement.clientWidth,
        window.innerHeight,
      ));
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen]);

  function commitDraftHex(closeAfterCommit = false) {
    const committedValue = commitHexColorInput(draftHex, hsva.a);
    if (!committedValue) {
      setDraftHex(storedValue);
      if (closeAfterCommit) {
        setIsOpen(false);
      }
      return;
    }
    setDraftHex(committedValue);
    if (committedValue !== storedValue) {
      onChange(committedValue);
    }
    if (closeAfterCommit) {
      setIsOpen(false);
    }
  }

  function handleWheelChange(color: ColorResult) {
    onChange(
      color.hsva
        ? hsvaToStoredHexColor(color.hsva)
        : toStoredHexColor(color.hexa),
    );
  }

  function updateHsla(
    channel: 'h' | 's' | 'l' | 'a',
    nextValue: number,
    bounds: { min: number; max: number },
  ) {
    onChange(
      hslaToStoredHexColor({
        ...hsla,
        [channel]: clampSliderValue(nextValue, bounds.min, bounds.max),
      }),
    );
  }

  return (
    <div
      ref={rootRef}
      className={[
        variant === 'compact'
          ? 'color-picker-control color-picker-control-compact'
          : 'color-picker-control',
        mixed ? 'color-picker-control-mixed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        ref={triggerRef}
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={label}
        title={title}
        className={
          variant === 'compact'
          ? 'color-picker-trigger color-picker-trigger-compact'
          : 'color-picker-trigger'
        }
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="color-picker-swatch" aria-hidden="true">
          <span
            className="color-picker-swatch-fill"
            style={{
              background: mixed
                ? 'linear-gradient(135deg, rgba(110, 126, 153, 0.28), rgba(12, 18, 32, 0.96))'
                : storedValue,
            }}
          />
        </span>
        {variant === 'compact' ? (
          <span className="color-picker-trigger-caret" aria-hidden="true" />
        ) : (
          <span className="color-picker-trigger-copy">
            <span className="color-picker-trigger-label">{label}</span>
            <span className="color-picker-trigger-value">
              {mixed ? 'Mixed' : storedValue}
            </span>
          </span>
        )}
      </button>

      {isOpen && !disabled
        ? createPortal(
            <div
              ref={panelRef}
              className={
                variant === 'compact'
                  ? 'properties-panel color-picker-panel color-picker-panel-compact'
                  : 'properties-panel color-picker-panel'
              }
              id={panelId}
              style={panelStyle}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
            >
              <div className="color-picker-wheel">
                <Wheel
                  color={hsva}
                  onChange={handleWheelChange}
                  width={216}
                  height={216}
                />
              </div>

              <label className="color-picker-field">
                <span>{label} hex</span>
                <input
                  aria-label={`${label} hex`}
                  spellCheck={false}
                  type="text"
                  value={draftHex}
                  onBlur={() => commitDraftHex(true)}
                  onChange={(event) => setDraftHex(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitDraftHex(true);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setDraftHex(storedValue);
                      setIsOpen(false);
                    }
                  }}
                />
              </label>

              <label className="color-picker-field">
                <span>{label} hue</span>
                <div className="color-picker-slider-row">
                  <input
                    aria-label={`${label} hue`}
                    max={360}
                    min={0}
                    step={1}
                    type="range"
                    value={Math.round(hsla.h)}
                    onChange={(event) =>
                      updateHsla('h', Number(event.target.value), {
                        min: 0,
                        max: 360,
                      })
                    }
                  />
                  <output>{Math.round(hsla.h)}deg</output>
                </div>
              </label>

              <label className="color-picker-field">
                <span>{label} saturation</span>
                <div className="color-picker-slider-row">
                  <input
                    aria-label={`${label} saturation`}
                    max={100}
                    min={0}
                    step={1}
                    type="range"
                    value={Math.round(hsla.s)}
                    onChange={(event) =>
                      updateHsla('s', Number(event.target.value), {
                        min: 0,
                        max: 100,
                      })
                    }
                  />
                  <output>{Math.round(hsla.s)}%</output>
                </div>
              </label>

              <label className="color-picker-field">
                <span>{label} lightness</span>
                <div className="color-picker-slider-row">
                  <input
                    aria-label={`${label} lightness`}
                    max={100}
                    min={0}
                    step={1}
                    type="range"
                    value={Math.round(hsla.l)}
                    onChange={(event) =>
                      updateHsla('l', Number(event.target.value), {
                        min: 0,
                        max: 100,
                      })
                    }
                  />
                  <output>{Math.round(hsla.l)}%</output>
                </div>
              </label>

              <label className="color-picker-field">
                <span>{label} alpha</span>
                <div className="color-picker-slider-row">
                  <input
                    aria-label={`${label} alpha`}
                    max={100}
                    min={0}
                    step={1}
                    type="range"
                    value={Math.round(hsva.a * 100)}
                    onChange={(event) =>
                      updateHsla('a', Number(event.target.value) / 100, {
                        min: 0,
                        max: 1,
                      })
                    }
                  />
                  <output>{Math.round(hsva.a * 100)}%</output>
                </div>
              </label>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
