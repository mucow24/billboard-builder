import { useId, useState, type ReactNode } from 'react';

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
  digits?: number;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  slider?: boolean;
  sliderDetentThreshold?: number;
  sliderDetentValue?: number;
  step?: number;
  value: number;
}

export function NumberInput({
  digits = 1,
  label,
  max,
  min,
  onChange,
  slider = false,
  sliderDetentThreshold,
  sliderDetentValue,
  step = 1,
  value,
}: NumberInputProps) {
  const displayedValue = formatDisplayedNumber(value, digits);
  const inputId = useId();
  const sliderId = useId();

  function commitValue(nextValue: number) {
    onChange(clampNumberInputValue(nextValue, min, max));
  }

  if (slider) {
    return (
      <div className="number-input-field number-input-field-with-slider">
        <span>{label}</span>
        <div className="number-input-slider-row">
          <input
            id={sliderId}
            aria-label={label}
            max={max}
            min={min}
            step={step}
            type="range"
            value={displayedValue}
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
            max={max}
            min={min}
            step={step}
            type="number"
            value={displayedValue}
            onChange={(event) => commitValue(Number(event.target.value))}
          />
        </div>
      </div>
    );
  }

  return (
    <label className="number-input-field" htmlFor={inputId}>
      <span>{label}</span>
      <input
        id={inputId}
        aria-label={label}
        max={max}
        min={min}
        step={step}
        type="number"
        value={displayedValue}
        onChange={(event) => commitValue(Number(event.target.value))}
      />
    </label>
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
