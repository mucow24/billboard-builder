import type { FontOption } from '../FontFamilyPicker';

import { GradientFillWidget } from './GradientFillWidget';
import {
  FontPickerInput,
  SegmentedSelectInput,
  ToggleButtonInput,
} from './inspectorControls';
import { DimensionsWidget } from './DimensionsWidget';
import type { CustomFieldRenderProps, ResolvedInspectorFieldState, SelectOption } from './selectionInspectorModel';
import type { DimensionAction } from './selectionInspectorModel';

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

export function renderMirrorField({ field, onCommit }: CustomFieldRenderProps) {
  return (
    <ToggleButtonInput
      active={typeof field.state.value === 'boolean' ? field.state.value : null}
      disabled={field.disabled}
      label={field.descriptor.label}
      mixed={field.state.isMixed}
      onChange={(nextValue) => onCommit(nextValue)}
    >
      <span className="inspector-toggle-button-glyph" aria-hidden="true">
        ↔
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

export function renderGradientFillField({
  field,
  onCommit,
}: CustomFieldRenderProps) {
  return (
    <GradientFillWidget
      disabled={field.disabled}
      gradientEnabled={Boolean(field.selectorStates.gradientEnabled?.firstValue)}
      gradientMixed={field.selectorStates.gradientEnabled?.isMixed ?? false}
      primaryColor={String(field.state.firstValue ?? '#000000')}
      primaryMixed={field.state.isMixed}
      secondaryColor={String(field.selectorStates.secondaryFill?.firstValue ?? '#000000')}
      secondaryMixed={field.selectorStates.secondaryFill?.isMixed ?? false}
      onCommit={onCommit}
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

function asNum(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function toOriginalSize(
  ss: Record<string, ResolvedInspectorFieldState<unknown>>
): { width: number; height: number } | null {
  const ow = ss.originalWidth?.value ?? ss.originalWidth?.firstValue;
  const oh = ss.originalHeight?.value ?? ss.originalHeight?.firstValue;
  if (typeof ow === 'number' && typeof oh === 'number') {
    return { width: ow, height: oh };
  }
  return null;
}

export function renderDimensionsField({ field, onCommit }: CustomFieldRenderProps) {
  const ss = field.selectorStates;
  return (
    <DimensionsWidget
      disabled={field.disabled}
      width={asNum(field.state.value ?? field.state.firstValue)}
      widthMixed={field.state.isMixed}
      height={asNum(ss.height?.value ?? ss.height?.firstValue)}
      heightMixed={ss.height?.isMixed ?? false}
      scaleX={asNum(ss.scaleX?.value ?? ss.scaleX?.firstValue) || 1}
      scaleXMixed={ss.scaleX?.isMixed ?? false}
      scaleY={asNum(ss.scaleY?.value ?? ss.scaleY?.firstValue) || 1}
      scaleYMixed={ss.scaleY?.isMixed ?? false}
      locked={Boolean(ss.lockAspectRatio?.value ?? ss.lockAspectRatio?.firstValue)}
      lockedMixed={ss.lockAspectRatio?.isMixed ?? false}
      originalSize={toOriginalSize(ss)}
      onCommit={(action: DimensionAction) => onCommit(action)}
    />
  );
}
