import { useEffect, useId, useState } from 'react';

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
  value: string;
  onChange: (value: string) => void;
  variant?: 'default' | 'compact';
}

function clampSliderValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ColorPickerControl({
  disabled = false,
  label,
  mixed = false,
  value,
  onChange,
  variant = 'default',
}: ColorPickerControlProps) {
  const panelId = useId();
  const storedValue = toStoredHexColor(value);
  const hsva = hexColorToHsva(storedValue);
  const hsla = hexColorToHsla(storedValue);
  const [isOpen, setIsOpen] = useState(false);
  const [draftHex, setDraftHex] = useState(storedValue);

  useEffect(() => {
    setDraftHex(storedValue);
  }, [storedValue]);

  function commitDraftHex() {
    const committedValue = commitHexColorInput(draftHex, hsva.a);
    if (!committedValue) {
      setDraftHex(storedValue);
      return;
    }
    setDraftHex(committedValue);
    if (committedValue !== storedValue) {
      onChange(committedValue);
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
      className={
        variant === 'compact'
          ? 'color-picker-control color-picker-control-compact'
          : 'color-picker-control'
      }
    >
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={label}
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

      {isOpen && !disabled ? (
        <div
          className={
            variant === 'compact'
              ? 'color-picker-panel color-picker-panel-compact'
              : 'color-picker-panel'
          }
          id={panelId}
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
              onBlur={commitDraftHex}
              onChange={(event) => setDraftHex(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitDraftHex();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setDraftHex(storedValue);
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
        </div>
      ) : null}
    </div>
  );
}
