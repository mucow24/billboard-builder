import { ColorPickerControl } from '../ColorPickerControl';

import {
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

function SelectionHeading({
  kind,
  subtitle,
  title,
}: {
  kind: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="panel-heading-row compact-heading-row compact-item-header slim-item-header">
      <span className="slim-item-header-glyph" aria-hidden="true">
        {kind}
      </span>
      <div className="panel-heading-stack compact slim-item-heading-stack">
        <h2>{title}</h2>
        <span className="slim-item-subtitle">{subtitle}</span>
      </div>
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
          max={field.descriptor.max}
          mixed={field.state.isMixed}
          min={field.descriptor.min}
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
          mixed={field.state.isMixed}
          onChange={commitValue}
        />
      );
    case 'color':
      return (
        <FieldShell
          hint={field.state.isMixed ? 'Mixed' : undefined}
          label={field.descriptor.label}
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
  fonts,
  onGroupOpacityChange,
  onItemChange,
  selectedGroup,
  selectedItem,
  selectedNodeCount,
  selectedItems,
}: SelectionInspectorProps) {
  const isMultiNodeSelection = selectedNodeCount > 1;
  const environment = buildInspectorEnvironment(availableFonts, fonts);
  const sections = buildSelectionInspectorSections(selectedItems, environment);

  if (selectedGroup && !isMultiNodeSelection) {
    return (
      <div className="selection-inspector">
        <SectionBlock title="Group">
          <NumberInput
            label="Group Opacity"
            min={0}
            max={1}
            step={0.01}
            digits={2}
            slider
            value={selectedGroup.opacity}
            onChange={onGroupOpacityChange}
          />
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
            subtitle="Multi-selection"
            title={`${selectedItems.length} items selected`}
          />
        </div>
      ) : primaryItem ? (
        <div className="selection-inspector-header">
          <SelectionHeading
            kind={getItemGlyph(primaryItem.kind)}
            subtitle={primaryItem.name || primaryItem.kind}
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
              section.key !== 'geometry' &&
              section.key !== 'shadow'
            }
            title={section.label}
          >
            <div className="inspector-section-fields">
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
