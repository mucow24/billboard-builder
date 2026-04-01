import { createElement } from 'react';

import type { CanvasItem, GeneratorCanvasItem } from '../../document/documentTypes';
import { getGenerator, type GeneratorFieldSpec } from '../../generators';
import { ToggleGroupInput } from './inspectorControls';
import {
  SECTION_ORDER,
} from './inspectorFieldHelpers';
import type {
  ColorFieldDescriptor,
  CustomFieldDescriptor,
  InspectorFieldDescriptor,
  NumberFieldDescriptor,
} from './selectionInspectorModel';

function createGeneratorFieldDescriptor(
  field: GeneratorFieldSpec,
  fieldOrder: number,
  specLabel: string,
): InspectorFieldDescriptor {
  if (field.type === 'toggleGroup') {
    const descriptor: CustomFieldDescriptor = {
      controlKind: 'custom',
      propertyKey: `gen_${field.key}`,
      label: field.label,
      fieldOrder,
      sectionKey: 'generator',
      sectionLabel: specLabel,
      sectionOrder: SECTION_ORDER.generator,
      supportsMultiEdit: false,
      valueType: 'custom',
      getValue: (item: CanvasItem) =>
        item.kind === 'generator'
          ? (item.generatorParams as unknown as Record<string, unknown>)[field.key]
          : {},
      buildChange: ({ item }, nextValue) => {
        if (item.kind !== 'generator') return {};
        return {
          generatorParams: { ...item.generatorParams, [field.key]: nextValue },
        } as Partial<CanvasItem>;
      },
      render: ({ field: resolvedField, onCommit }) => {
        const value = resolvedField.state.value as Record<string, boolean> ?? {};
        return createElement(ToggleGroupInput, {
          label: resolvedField.descriptor.label,
          options: field.options ?? [],
          value,
          onChange: (nextValue: Record<string, boolean>) => onCommit(nextValue),
        });
      },
    };
    return descriptor;
  }

  if (field.type === 'color') {
    const descriptor: ColorFieldDescriptor = {
      controlKind: 'color',
      propertyKey: `gen_${field.key}`,
      label: field.label,
      fieldOrder,
      sectionKey: 'generator',
      sectionLabel: specLabel,
      sectionOrder: SECTION_ORDER.generator,
      supportsMultiEdit: false,
      valueType: 'color',
      getValue: (item: CanvasItem) =>
        item.kind === 'generator'
          ? (item.generatorParams as unknown as Record<string, unknown>)[field.key] as string
          : '',
      buildChange: ({ item }, nextValue) => {
        if (item.kind !== 'generator') return {};
        return {
          generatorParams: { ...item.generatorParams, [field.key]: nextValue },
        } as Partial<CanvasItem>;
      },
    };
    return descriptor;
  }

  const descriptor: NumberFieldDescriptor = {
    controlKind: 'number',
    propertyKey: `gen_${field.key}`,
    label: field.label,
    fieldOrder,
    sectionKey: 'generator',
    sectionLabel: specLabel,
    sectionOrder: SECTION_ORDER.generator,
    supportsMultiEdit: false,
    valueType: 'number',
    min: field.min,
    max: field.max,
    textMin: field.textMin,
    textMax: field.textMax,
    step: field.step,
    slider: field.type === 'range',
    getValue: (item: CanvasItem) =>
      item.kind === 'generator'
        ? ((item.generatorParams as unknown as Record<string, unknown>)[field.key] as number) ?? 0
        : 0,
    buildChange: ({ item }, nextValue) => {
      if (item.kind !== 'generator') return {};
      const value = field.type === 'optionalNumber' && (nextValue === 0 || Number.isNaN(nextValue))
        ? null
        : nextValue;
      return {
        generatorParams: { ...item.generatorParams, [field.key]: value },
      } as Partial<CanvasItem>;
    },
  };
  return descriptor;
}

export function createGeneratorDescriptors(item: GeneratorCanvasItem): InspectorFieldDescriptor[] {
  const spec = getGenerator(item.generatorParams.generatorType);
  if (!spec) return [];

  return spec.fields.map((field, index) =>
    createGeneratorFieldDescriptor(field, index * 10, spec.label),
  );
}
