import { createElement } from 'react';

import type { CanvasItem, GeneratorCanvasItem } from '../../document/documentTypes';
import {
  getGenerator,
  type GeneratorFieldBounds,
  type GeneratorFieldSpec,
} from '../../generators';
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

/**
 * Decimal places a field shows: as many as its step has, so a value the
 * slider can reach (0.09 at a step of 0.01) is not shown rounded to 0.1.
 */
function digitsForStep(step: number | undefined): number {
  if (step === undefined || !Number.isFinite(step) || step <= 0) {
    return 1;
  }
  const decimals = String(step).split('.')[1];
  return decimals ? decimals.length : 0;
}

function createGeneratorFieldDescriptor(
  field: GeneratorFieldSpec,
  fieldOrder: number,
  specLabel: string,
  bounds: GeneratorFieldBounds,
): InspectorFieldDescriptor {
  if (field.type === 'toggleGroup') {
    const descriptor: CustomFieldDescriptor = {
      controlKind: 'custom',
      propertyKey: `gen_${field.key}`,
      label: field.label,
      tooltip: field.tooltip,
      fieldOrder,
      sectionKey: 'generator',
      sectionLabel: specLabel,
      sectionOrder: SECTION_ORDER.generator,

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
          tooltip: resolvedField.descriptor.tooltip,
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
      tooltip: field.tooltip,
      fieldOrder,
      sectionKey: 'generator',
      sectionLabel: specLabel,
      sectionOrder: SECTION_ORDER.generator,

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
    tooltip: field.tooltip,
    fieldOrder,
    sectionKey: 'generator',
    sectionLabel: specLabel,
    sectionOrder: SECTION_ORDER.generator,

    valueType: 'number',
    min: bounds.min ?? field.min,
    max: bounds.max ?? field.max,
    textMin: bounds.textMin ?? field.textMin,
    textMax: bounds.textMax ?? field.textMax,
    step: field.step,
    digits: digitsForStep(field.step),
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

/**
 * `canvasSize` is the document canvas, which a generator draws across. Without
 * it the layer's own box stands in: a new generator layer is canvas-sized.
 */
export function createGeneratorDescriptors(
  item: GeneratorCanvasItem,
  canvasSize: { height: number; width: number } = item,
): InspectorFieldDescriptor[] {
  const spec = getGenerator(item.generatorParams.generatorType);
  if (!spec) return [];

  const boundsContext = {
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
    params: item.generatorParams,
  };

  return spec.fields.map((field, index) =>
    createGeneratorFieldDescriptor(
      field,
      index * 10,
      spec.label,
      field.getBounds?.(boundsContext) ?? {},
    ),
  );
}
