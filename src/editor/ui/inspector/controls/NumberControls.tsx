import { useId } from 'react';

import { formatDisplayedNumber } from '../inspectorModel';
import { FieldShell } from './FieldShell';

function clampNumberInputValue(value: number, min?: number, max?: number): number {
  let nextValue = Number.isFinite(value) ? value : min ?? 0;
  if (min !== undefined) {
    nextValue = Math.max(min, nextValue);
  }
  if (max !== undefined) {
    nextValue = Math.min(max, nextValue);
  }
  return nextValue;
}

function applyDetent(value: number, detentValue?: number, detentThreshold = 0): number {
  if (detentValue === undefined || detentThreshold <= 0) {
    return value;
  }
  return Math.abs(value - detentValue) <= detentThreshold ? detentValue : value;
}

export interface BareNumberInputProps {
  disabled?: boolean;
  digits?: number;
  label: string;
  max?: number;
  mixed?: boolean;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number | null;
}

interface NumberInputProps extends BareNumberInputProps {
  textMin?: number;
  textMax?: number;
  slider?: boolean;
  sliderDetentThreshold?: number;
  sliderDetentValue?: number;
}

export function BareNumberInput({
  disabled = false,
  digits = 1,
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: BareNumberInputProps) {
  const displayedValue =
    value === null ? '' : formatDisplayedNumber(value, digits);

  function commitValue(nextValue: number) {
    onChange(clampNumberInputValue(nextValue, min, max));
  }

  return (
    <input
      className="inspector-field-control"
      aria-label={label}
      disabled={disabled}
      max={max}
      min={min}
      step={step}
      type="number"
      value={displayedValue}
      onChange={(event) => {
        if (event.target.value === '') {
          return;
        }
        commitValue(Number(event.target.value));
      }}
    />
  );
}

export function NumberInput({
  disabled = false,
  digits = 1,
  label,
  max,
  mixed = false,
  min,
  textMin,
  textMax,
  onChange,
  slider = false,
  sliderDetentThreshold,
  sliderDetentValue,
  step = 1,
  value,
}: NumberInputProps) {
  const displayedValue =
    value === null ? '' : formatDisplayedNumber(value, digits);
  const sliderValue =
    value === null ? min ?? sliderDetentValue ?? 0 : Number(displayedValue);
  const sliderId = useId();

  function commitValue(nextValue: number) {
    onChange(clampNumberInputValue(nextValue, min, max));
  }

  function commitTextValue(nextValue: number) {
    onChange(clampNumberInputValue(nextValue, textMin ?? min, textMax ?? max));
  }

  if (slider) {
    return (
      <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
        <div className="number-input-field number-input-field-with-slider">
          <div className="number-input-slider-row">
            <input
              id={sliderId}
              aria-label={label}
              disabled={disabled}
              max={max}
              min={min}
              step={step}
              type="range"
              value={sliderValue}
              onChange={(event) => {
                const sliderValue = clampNumberInputValue(
                  Number(event.target.value),
                  min,
                  max,
                );
                commitValue(
                  applyDetent(
                    sliderValue,
                    sliderDetentValue,
                    sliderDetentThreshold,
                  ),
                );
              }}
            />
            <input
              aria-label={`${label} value`}
              disabled={disabled}
              max={Number.isFinite(textMax ?? max) ? (textMax ?? max) : undefined}
              min={Number.isFinite(textMin ?? min) ? (textMin ?? min) : undefined}
              step={step}
              type="number"
              value={displayedValue}
              onChange={(event) => {
                if (event.target.value === '') {
                  return;
                }
                commitTextValue(Number(event.target.value));
              }}
            />
          </div>
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
      <BareNumberInput
        disabled={disabled}
        digits={digits}
        label={label}
        max={max}
        min={min}
        onChange={onChange}
        step={step}
        value={value}
      />
    </FieldShell>
  );
}
