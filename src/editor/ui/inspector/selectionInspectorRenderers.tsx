import type { FontOption } from '../FontFamilyPicker';

import {
  FontPickerInput,
  SegmentedSelectInput,
  ToggleButtonInput,
} from './inspectorControls';
import type { CustomFieldRenderProps, SelectOption } from './selectionInspectorModel';

function toFontOptions(options: readonly SelectOption[]): FontOption[] {
  return options.map((option) => ({
    family: option.value,
    kind: option.kind ?? 'system',
    sourceName: option.sourceName ?? option.label,
  }));
}

export function renderFontFamilyField({ field, onCommit }: CustomFieldRenderProps) {
  return (
    <FontPickerInput
      disabled={field.disabled}
      fonts={toFontOptions(field.options)}
      label={field.descriptor.label}
      mixed={field.state.isMixed}
      value={String(field.state.firstValue ?? '')}
      onChange={(nextValue) => onCommit(nextValue)}
    />
  );
}

export function renderBoldField({ field, onCommit }: CustomFieldRenderProps) {
  return (
    <ToggleButtonInput
      active={typeof field.state.value === 'boolean' ? field.state.value : null}
      disabled={field.disabled}
      label={field.descriptor.label}
      mixed={field.state.isMixed}
      onChange={(nextValue) => onCommit(nextValue)}
    >
      <span className="inspector-toggle-button-glyph" aria-hidden="true">
        <strong>B</strong>
      </span>
    </ToggleButtonInput>
  );
}

export function renderItalicField({ field, onCommit }: CustomFieldRenderProps) {
  return (
    <ToggleButtonInput
      active={typeof field.state.value === 'boolean' ? field.state.value : null}
      disabled={field.disabled}
      label={field.descriptor.label}
      mixed={field.state.isMixed}
      onChange={(nextValue) => onCommit(nextValue)}
    >
      <span className="inspector-toggle-button-glyph" aria-hidden="true">
        <em>I</em>
      </span>
    </ToggleButtonInput>
  );
}

export function renderAlignField({ field, onCommit }: CustomFieldRenderProps) {
  return (
    <SegmentedSelectInput
      disabled={field.disabled}
      label={field.descriptor.label}
      mixed={field.state.isMixed}
      options={[
        {
          ariaLabel: 'Align left',
          icon: <span aria-hidden="true">≡</span>,
          value: 'left',
        },
        {
          ariaLabel: 'Align center',
          icon: <span aria-hidden="true">≣</span>,
          value: 'center',
        },
        {
          ariaLabel: 'Align right',
          icon: <span aria-hidden="true">≡</span>,
          value: 'right',
        },
      ]}
      value={typeof field.state.value === 'string' ? field.state.value : null}
      onChange={(nextValue) => onCommit(nextValue)}
    />
  );
}

export function renderVerticalAlignField({
  field,
  onCommit,
}: CustomFieldRenderProps) {
  return (
    <SegmentedSelectInput
      disabled={field.disabled}
      label={field.descriptor.label}
      mixed={field.state.isMixed}
      options={[
        {
          ariaLabel: 'Align top',
          icon: <span aria-hidden="true">⇡</span>,
          value: 'top',
        },
        {
          ariaLabel: 'Align middle',
          icon: <span aria-hidden="true">⇕</span>,
          value: 'middle',
        },
        {
          ariaLabel: 'Align bottom',
          icon: <span aria-hidden="true">⇣</span>,
          value: 'bottom',
        },
      ]}
      value={typeof field.state.value === 'string' ? field.state.value : null}
      onChange={(nextValue) => onCommit(nextValue)}
    />
  );
}
