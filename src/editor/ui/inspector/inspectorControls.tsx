import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { formatDisplayedNumber } from './inspectorModel';

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

interface NumberInputProps {
  disabled?: boolean;
  digits?: number;
  label: string;
  max?: number;
  mixed?: boolean;
  min?: number;
  onChange: (value: number) => void;
  slider?: boolean;
  sliderDetentThreshold?: number;
  sliderDetentValue?: number;
  step?: number;
  value: number | null;
}

function FieldShell({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <div className="inspector-field">
      <div className="inspector-field-header">
        <span className="inspector-field-label">{label}</span>
        {hint ? <span className="inspector-field-hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function NumberInput({
  disabled = false,
  digits = 1,
  label,
  max,
  mixed = false,
  min,
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
  const inputId = useId();
  const sliderId = useId();

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
              id={inputId}
              aria-label={`${label} value`}
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
          </div>
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
      <input
        className="inspector-field-control"
        id={inputId}
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
    </FieldShell>
  );
}

interface SectionBlockProps {
  children: ReactNode;
  defaultExpanded?: boolean;
  title: string;
}

export function SectionBlock({
  children,
  defaultExpanded = true,
  title,
}: SectionBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sectionId = useId();

  return (
    <section className="property-block">
      <button
        type="button"
        className="property-block-toggle"
        aria-controls={sectionId}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{title}</span>
        <span className="property-block-toggle-icon" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? (
        <div id={sectionId} className="property-block-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

interface TextInputProps {
  disabled?: boolean;
  label: string;
  mixed?: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
  value: string | null;
}

export function TextInput({
  disabled = false,
  label,
  mixed = false,
  multiline = false,
  onChange,
  value,
}: TextInputProps) {
  const inputId = useId();
  const displayedValue = value ?? '';

  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
      {multiline ? (
        <textarea
          aria-label={label}
          className="inspector-field-control"
          disabled={disabled}
          id={inputId}
          value={displayedValue}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          className="inspector-field-control"
          disabled={disabled}
          id={inputId}
          type="text"
          value={displayedValue}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

interface CheckboxInputProps {
  checked: boolean | null;
  disabled?: boolean;
  label: string;
  mixed?: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxInput({
  checked,
  disabled = false,
  label,
  mixed = false,
  onChange,
}: CheckboxInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.indeterminate = mixed;
  }, [mixed]);

  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
      <label className="checkbox-row compact-checkbox-row inspector-checkbox-field">
        <input
          ref={inputRef}
          aria-label={label}
          checked={mixed ? false : Boolean(checked)}
          disabled={disabled}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    </FieldShell>
  );
}

interface SelectInputProps {
  disabled?: boolean;
  label: string;
  mixed?: boolean;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string | null;
}

export function SelectInput({
  disabled = false,
  label,
  mixed = false,
  onChange,
  options,
  value,
}: SelectInputProps) {
  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
      <select
        aria-label={label}
        className="inspector-field-control"
        disabled={disabled}
        value={value ?? ''}
        onChange={(event) => {
          if (event.target.value === '') {
            return;
          }
          onChange(event.target.value);
        }}
      >
        {mixed ? <option value="">Mixed</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface SegmentedIconButtonProps {
  active: boolean;
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

export function SegmentedIconButton({
  active,
  ariaLabel,
  children,
  disabled = false,
  onClick,
}: SegmentedIconButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'segmented-control-button active' : 'segmented-control-button'}
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
