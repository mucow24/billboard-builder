import { useEffect, useId, useRef, useState } from 'react';

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

function useDraftNumber(
  value: number | null,
  digits: number,
  min: number | undefined,
  max: number | undefined,
  onChange: (value: number) => void,
) {
  const formatted = value === null ? '' : formatDisplayedNumber(value, digits);
  const [draft, setDraft] = useState(formatted);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(formatted);
    }
  }, [formatted]);

  function commitDraft() {
    const num = Number(draft);
    if (draft === '' || Number.isNaN(num)) {
      setDraft(formatted);
      return;
    }
    const clamped = clampNumberInputValue(num, min, max);
    setDraft(formatDisplayedNumber(clamped, digits));
    onChange(clamped);
  }

  return { draft, setDraft, isFocusedRef, commitDraft };
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
  const { draft, setDraft, isFocusedRef, commitDraft } = useDraftNumber(
    value, digits, min, max, onChange,
  );
  const formatted = value === null ? '' : formatDisplayedNumber(value, digits);

  return (
    <input
      className="inspector-field-control"
      aria-label={label}
      disabled={disabled}
      max={max}
      min={min}
      step={step}
      type="number"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => { isFocusedRef.current = true; }}
      onBlur={() => { isFocusedRef.current = false; commitDraft(); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commitDraft();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraft(formatted);
          event.currentTarget.blur();
        }
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

  const { draft: textDraft, setDraft: setTextDraft, isFocusedRef: isTextFocusedRef, commitDraft: commitTextDraft } =
    useDraftNumber(value, digits, textMin ?? min, textMax ?? max, onChange);

  function commitValue(nextValue: number) {
    onChange(clampNumberInputValue(nextValue, min, max));
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
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              onFocus={() => { isTextFocusedRef.current = true; }}
              onBlur={() => { isTextFocusedRef.current = false; commitTextDraft(); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitTextDraft();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  setTextDraft(displayedValue);
                  event.currentTarget.blur();
                }
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
