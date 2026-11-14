import { useId } from 'react';

import type { FontOption } from '../../FontFamilyPicker';
import { FontFamilyPicker } from '../../FontFamilyPicker';
import { FieldShell } from './FieldShell';

interface FontPickerInputProps {
  disabled?: boolean;
  fonts: readonly FontOption[];
  label: string;
  mixed?: boolean;
  onChange: (value: string) => void;
  tooltip?: string;
  value: string;
}

export function FontPickerInput({
  disabled = false,
  fonts,
  label,
  mixed = false,
  onChange,
  tooltip,
  value,
}: FontPickerInputProps) {
  const labelId = useId();

  return (
    <FieldShell hint={mixed ? 'Mixed' : undefined} label={label} tooltip={tooltip}>
      <div className="inspector-font-picker-field">
        <span id={labelId} className="sr-only">
          {label}
        </span>
        <FontFamilyPicker
          disabled={disabled}
          fonts={fonts}
          labelId={labelId}
          mixed={mixed}
          value={value}
          onChange={onChange}
        />
      </div>
    </FieldShell>
  );
}
