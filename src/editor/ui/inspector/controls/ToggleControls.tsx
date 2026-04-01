import { useEffect, useRef, type ReactNode } from 'react';

import type { ToggleOption } from '../../../generators';
import { FieldShell } from './FieldShell';

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
      <div className="inspector-checkbox-control">
        <input
          className="inspector-checkbox-input"
          ref={inputRef}
          aria-label={label}
          checked={mixed ? false : Boolean(checked)}
          disabled={disabled}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    </FieldShell>
  );
}

interface ToggleButtonInputProps {
  active: boolean | null;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  mixed?: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleButtonInput({
  active,
  children,
  disabled = false,
  label,
  mixed = false,
  onChange,
}: ToggleButtonInputProps) {
  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={!mixed && Boolean(active)}
        className={[
          'inspector-toggle-button',
          !mixed && active ? 'active' : '',
          mixed ? 'mixed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={disabled}
        onClick={() => onChange(!(active ?? false))}
      >
        {children}
      </button>
    </FieldShell>
  );
}

interface ToggleGroupInputProps {
  disabled?: boolean;
  label: string;
  onChange: (value: Record<string, boolean>) => void;
  options: ToggleOption[];
  value: Record<string, boolean>;
}

export function ToggleGroupInput({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: ToggleGroupInputProps) {
  return (
    <FieldShell label={label} layout="stacked">
      <div className="toggle-group-grid" role="group" aria-label={label}>
        {options.map((option) => {
          const active = Boolean(value[option.key]);
          return (
            <button
              key={option.key}
              type="button"
              className={active ? 'toggle-group-btn active' : 'toggle-group-btn'}
              aria-label={option.label}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange({ ...value, [option.key]: !active })}
            >
              {option.icon ? (
                <span className="toggle-group-icon" aria-hidden="true">{option.icon}</span>
              ) : null}
              <span className="toggle-group-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}
