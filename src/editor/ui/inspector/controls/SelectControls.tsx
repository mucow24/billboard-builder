import type { ReactNode } from 'react';

import { FieldShell } from './FieldShell';

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

interface SegmentedOption {
  ariaLabel: string;
  icon: ReactNode;
  value: string;
}

interface SegmentedSelectInputProps {
  disabled?: boolean;
  label: string;
  mixed?: boolean;
  onChange: (value: string) => void;
  options: readonly SegmentedOption[];
  value: string | null;
}

export function SegmentedSelectInput({
  disabled = false,
  label,
  mixed = false,
  onChange,
  options,
  value,
}: SegmentedSelectInputProps) {
  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
      <div className="segmented-control inspector-segmented-control" role="group" aria-label={label}>
        {options.map((option) => (
          <SegmentedIconButton
            key={option.value}
            active={!mixed && value === option.value}
            ariaLabel={option.ariaLabel}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
          </SegmentedIconButton>
        ))}
      </div>
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
