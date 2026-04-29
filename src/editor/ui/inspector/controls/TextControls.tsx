import { useId } from 'react';

import { FieldShell } from './FieldShell';

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
    <FieldShell
      hint={mixed ? 'Mixed' : undefined}
      label={label}
      layout={multiline ? 'stacked' : 'inline'}
    >
      {multiline ? (
        <textarea
          aria-label={label}
          className="inspector-field-control"
          disabled={disabled}
          id={inputId}
          value={displayedValue}
          wrap="off"
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
