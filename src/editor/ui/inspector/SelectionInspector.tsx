import { ColorPickerControl } from '../ColorPickerControl';

import type { SelectionLockState } from '../../core/selectionLock';
import { DEFAULT_GROUP_NAME } from '../../document/sceneGraph';
import {
  getInspectorHeadingSubtitle,
  getItemGlyph,
  getLayerPrimaryLabel,
} from './inspectorModel';
import {
  buildInspectorEnvironment,
  buildSelectionInspectorSections,
  type ResolvedInspectorField,
} from './selectionInspectorModel';
import type { SelectionInspectorProps } from './types';
import {
  CheckboxInput,
  FieldShell,
  NumberInput,
  SectionBlock,
  SelectInput,
  TextInput,
} from './inspectorControls';

const LOCK_BUTTON_TITLES: Record<SelectionLockState, string> = {
  locked: 'Unlock',
  unlocked: 'Lock',
  mixed: 'Partly locked: click to lock everything',
};

/**
 * Locks or unlocks the whole selection. A partly locked selection reads as
 * mixed and locks on click, like the aspect-ratio lock.
 */
function SelectionLockButton({
  state,
  onLockedChange,
}: {
  state: SelectionLockState;
  onLockedChange: (locked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`selection-lock-button${state === 'unlocked' ? '' : ` ${state}`}`}
      aria-label={state === 'locked' ? 'Unlock selection' : 'Lock selection'}
      aria-pressed={state === 'mixed' ? 'mixed' : state === 'locked'}
      data-lock-state={state}
      title={LOCK_BUTTON_TITLES[state]}
      onClick={() => onLockedChange(state !== 'locked')}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
        {/* The shackle stays open only while nothing is locked. */}
        <path d={state === 'unlocked' ? 'M4 5.5V4a2 2 0 0 1 4 0' : 'M4 5.5V4a2 2 0 0 1 4 0v1.5'} />
        {state === 'mixed' ? <path d="M4.5 8h3" /> : null}
      </svg>
    </button>
  );
}

function SelectionHeading({
  kind,
  lockState,
  onLockedChange,
  subtitle,
  title,
}: {
  kind: string;
  lockState?: SelectionLockState | null;
  onLockedChange?: (locked: boolean) => void;
  subtitle?: string | null;
  title: string;
}) {
  return (
    <div className="panel-heading-row compact-heading-row compact-item-header slim-item-header">
      <span className="slim-item-header-glyph" aria-hidden="true">
        {kind}
      </span>
      <div className="panel-heading-stack compact slim-item-heading-stack">
        <h2>{title}</h2>
        {subtitle ? <span className="slim-item-subtitle">{subtitle}</span> : null}
      </div>
      {lockState && onLockedChange ? (
        <SelectionLockButton state={lockState} onLockedChange={onLockedChange} />
      ) : null}
    </div>
  );
}

function FieldRenderer({
  field,
  onItemChange,
}: {
  field: ResolvedInspectorField;
  onItemChange: SelectionInspectorProps['onItemChange'];
}) {
  function commitValue(nextValue: boolean | number | string | unknown) {
    onItemChange((item) =>
      field.descriptor.buildChange({ item }, nextValue as never)
    );
  }

  switch (field.descriptor.controlKind) {
    case 'number':
      return (
        <NumberInput
          disabled={field.disabled}
          digits={field.descriptor.digits}
          label={field.descriptor.label}
          tooltip={field.descriptor.tooltip}
          max={field.descriptor.max}
          mixed={field.state.isMixed}
          min={field.descriptor.min}
          textMin={field.descriptor.textMin}
          textMax={field.descriptor.textMax}
          slider={field.descriptor.slider}
          sliderDetentThreshold={field.descriptor.sliderDetentThreshold}
          sliderDetentValue={field.descriptor.sliderDetentValue}
          step={field.descriptor.step}
          value={typeof field.state.value === 'number' ? field.state.value : null}
          onChange={commitValue}
        />
      );
    case 'text':
      return (
        <TextInput
          disabled={field.disabled}
          label={field.descriptor.label}
          tooltip={field.descriptor.tooltip}
          mixed={field.state.isMixed}
          multiline={field.descriptor.multiline}
          value={typeof field.state.value === 'string' ? field.state.value : null}
          onChange={commitValue}
        />
      );
    case 'boolean':
      return (
        <CheckboxInput
          checked={typeof field.state.value === 'boolean' ? field.state.value : null}
          disabled={field.disabled}
          label={field.descriptor.label}
          tooltip={field.descriptor.tooltip}
          mixed={field.state.isMixed}
          onChange={commitValue}
        />
      );
    case 'color':
      return (
        <FieldShell
          hint={field.state.isMixed ? 'Mixed' : undefined}
          label={field.descriptor.label}
          tooltip={field.descriptor.tooltip}
        >
          <ColorPickerControl
            disabled={field.disabled}
            label={field.descriptor.label}
            mixed={field.state.isMixed}
            value={String(field.state.firstValue ?? '#000000')}
            variant="compact"
            onChange={commitValue}
          />
        </FieldShell>
      );
    case 'select':
      return (
        <SelectInput
          disabled={field.disabled}
          label={field.descriptor.label}
          tooltip={field.descriptor.tooltip}
          mixed={field.state.isMixed}
          options={field.options}
          value={typeof field.state.value === 'string' ? field.state.value : null}
          onChange={commitValue}
        />
      );
    case 'custom':
      return field.descriptor.render({
        field,
        onCommit: commitValue,
      });
    default:
      return null;
  }
}

export function SelectionInspector({
  availableFonts,
  canvasSize,
  fonts,
  onGroupOpacityChange,
  onItemChange,
  onSelectGroupChildren,
  onSelectionLockedChange,
  selectedGroup,
  selectedItem,
  selectionLockState,
  selectedNodeCount,
  selectedItems,
}: SelectionInspectorProps) {
  const isMultiNodeSelection = selectedNodeCount > 1;
  const environment = buildInspectorEnvironment(availableFonts, fonts, canvasSize);
  const sections = buildSelectionInspectorSections(selectedItems, environment);

  if (selectedGroup && !isMultiNodeSelection) {
    return (
      <div className="selection-inspector">
        <div className="selection-inspector-header">
          <SelectionHeading
            kind="⊞"
            lockState={selectionLockState}
            onLockedChange={onSelectionLockedChange}
            subtitle={selectedGroup.name !== DEFAULT_GROUP_NAME ? 'Group' : null}
            title={selectedGroup.name}
          />
        </div>
        <SectionBlock title="Group">
          <NumberInput
            label="Group Opacity"
            tooltip="Transparency of the whole group, from 0 (invisible) to 1 (solid). Applied on top of each item's own opacity."
            min={0}
            max={1}
            step={0.01}
            digits={2}
            slider
            value={selectedGroup.opacity}
            onChange={onGroupOpacityChange}
          />
          {onSelectGroupChildren ? (
            <button
              type="button"
              className="inspector-action-button"
              title="Select the items inside this group instead of the group itself."
              onClick={onSelectGroupChildren}
            >
              Select children
            </button>
          ) : null}
        </SectionBlock>
      </div>
    );
  }

  if (!selectedItem && selectedItems.length === 0) {
    return (
      <div className="selection-inspector">
        <section className="empty-panel-inner">
          <span className="eyebrow">Nothing selected</span>
          <p>Select an item to edit it, or choose a tool and drag a new item onto the canvas.</p>
          {availableFonts.length > 0 ? (
            <p>{availableFonts.length} uploaded font(s) ready in this session.</p>
          ) : null}
        </section>
      </div>
    );
  }

  const isMultiSelection = isMultiNodeSelection || selectedItems.length > 1;
  const primaryItem = selectedItem ?? selectedItems[0];

  return (
    <div className="selection-inspector">
      {isMultiSelection ? (
        <div className="selection-inspector-header">
          <SelectionHeading
            kind="◎"
            lockState={selectionLockState}
            onLockedChange={onSelectionLockedChange}
            subtitle="Multi-selection"
            title={`${selectedItems.length} items selected`}
          />
        </div>
      ) : primaryItem ? (
        <div className="selection-inspector-header">
          <SelectionHeading
            kind={getItemGlyph(primaryItem.kind)}
            lockState={selectionLockState}
            onLockedChange={onSelectionLockedChange}
            subtitle={getInspectorHeadingSubtitle(primaryItem)}
            title={getLayerPrimaryLabel(primaryItem)}
          />
        </div>
      ) : null}

      {sections.length === 0 && isMultiSelection ? (
        <section className="empty-panel-inner">
          <p>No shared editable properties.</p>
        </section>
      ) : null}

      <div className="selection-inspector-sections">
        {sections.map((section) => (
          <SectionBlock
            key={section.key}
            defaultExpanded={
              section.key !== 'advancedText' &&
              section.key !== 'blur' &&
              section.key !== 'geometry' &&
              section.key !== 'shadow'
            }
            title={section.label}
          >
            <div className="inspector-section-fields" data-section={section.key}>
              {section.fields.map((field) => (
                <div
                  key={field.key}
                  className={field.disabled ? 'inspector-field-shell disabled' : 'inspector-field-shell'}
                >
                  <FieldRenderer field={field} onItemChange={onItemChange} />
                </div>
              ))}
            </div>
          </SectionBlock>
        ))}
      </div>
    </div>
  );
}
