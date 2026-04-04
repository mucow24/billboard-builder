import type { ReactNode } from 'react';

import type {
  CanvasItem,
  DocumentFontReference,
  UploadedFont,
} from '../../document/documentTypes';
import type { FontOption } from '../FontFamilyPicker';
import { COMMON_BLUR_DESCRIPTORS, COMMON_SHADOW_DESCRIPTORS } from './inspectorFieldHelpers';
import { createGeneratorDescriptors } from './generatorInspectorDescriptors';
import { createImageDescriptors } from './imageInspectorDescriptors';
import { createShapeDescriptors } from './shapeInspectorDescriptors';
import { createTextDescriptors } from './textInspectorDescriptors';
import { buildFontOptions } from './inspectorModel';

// Re-export DimensionAction from its new home for backwards compatibility.
export type { DimensionAction } from './inspectorFieldHelpers';

export type InspectorValueType =
  | 'boolean'
  | 'color'
  | 'custom'
  | 'number'
  | 'select'
  | 'text';

export interface SelectionFieldChangeContext {
  item: CanvasItem;
}

export interface SelectOption {
  kind?: FontOption['kind'];
  label: string;
  sourceName?: string;
  value: string;
}

interface BaseInspectorFieldDescriptor<TValue> {
  buildChange: (
    context: SelectionFieldChangeContext,
    nextValue: TValue,
  ) => Partial<CanvasItem>;
  fieldOrder: number;
  label: string;
  propertyKey: string;
  sectionKey: string;
  sectionLabel: string;
  sectionOrder: number;

  valueType: InspectorValueType;
  getDisabled?: (context: InspectorDescriptorContext) => boolean;
  getOptions?: (context: InspectorDescriptorContext) => SelectOption[];
  getValue: (item: CanvasItem) => TValue;
}

export interface NumberFieldDescriptor extends BaseInspectorFieldDescriptor<number> {
  controlKind: 'number';
  digits?: number;
  max?: number;
  min?: number;
  textMin?: number;
  textMax?: number;
  slider?: boolean;
  sliderDetentThreshold?: number;
  sliderDetentValue?: number;
  step?: number;
}

export interface TextFieldDescriptor extends BaseInspectorFieldDescriptor<string> {
  controlKind: 'text';
  multiline?: boolean;
}

export interface BooleanFieldDescriptor extends BaseInspectorFieldDescriptor<boolean> {
  controlKind: 'boolean';
}

export interface ColorFieldDescriptor extends BaseInspectorFieldDescriptor<string> {
  controlKind: 'color';
}

export interface SelectFieldDescriptor extends BaseInspectorFieldDescriptor<string> {
  controlKind: 'select';
}

export interface CustomFieldRenderProps {
  field: ResolvedInspectorField;
  onCommit: (nextValue: unknown) => void;
}

export interface CustomFieldDescriptor
  extends BaseInspectorFieldDescriptor<unknown> {
  controlKind: 'custom';
  render: (props: CustomFieldRenderProps) => ReactNode;
  selectors?: Record<string, (item: CanvasItem) => unknown>;
}

export type InspectorFieldDescriptor =
  | BooleanFieldDescriptor
  | ColorFieldDescriptor
  | CustomFieldDescriptor
  | NumberFieldDescriptor
  | SelectFieldDescriptor
  | TextFieldDescriptor;

export interface InspectorDescriptorEnvironment {
  availableFonts: UploadedFont[];
  fontOptions: FontOption[];
}

export interface InspectorDescriptorContext extends InspectorDescriptorEnvironment {
  selectedItems: CanvasItem[];
}

export interface ResolvedInspectorFieldState<TValue> {
  firstValue: TValue;
  isMixed: boolean;
  value: TValue | null;
}

export interface ResolvedInspectorField {
  descriptor: InspectorFieldDescriptor;
  disabled: boolean;
  key: string;
  options: SelectOption[];
  state: ResolvedInspectorFieldState<boolean | number | string | unknown>;
  selectorStates: Record<string, ResolvedInspectorFieldState<unknown>>;
}

export interface ResolvedInspectorSection {
  fields: ResolvedInspectorField[];
  key: string;
  label: string;
  order: number;
}

function getDescriptorKey(descriptor: InspectorFieldDescriptor): string {
  return `${descriptor.sectionKey}:${descriptor.propertyKey}:${descriptor.valueType}`;
}


function getItemFieldDescriptors(item: CanvasItem): InspectorFieldDescriptor[] {
  switch (item.kind) {
    case 'text':
      return [...createTextDescriptors(), ...COMMON_BLUR_DESCRIPTORS, ...COMMON_SHADOW_DESCRIPTORS];
    case 'image':
      return [...createImageDescriptors(), ...COMMON_BLUR_DESCRIPTORS, ...COMMON_SHADOW_DESCRIPTORS];
    case 'rectangle':
      return [...createShapeDescriptors('rectangle'), ...COMMON_BLUR_DESCRIPTORS, ...COMMON_SHADOW_DESCRIPTORS];
    case 'ellipse':
      return [...createShapeDescriptors('ellipse'), ...COMMON_BLUR_DESCRIPTORS, ...COMMON_SHADOW_DESCRIPTORS];
    case 'ngon':
      return [...createShapeDescriptors('ngon'), ...COMMON_BLUR_DESCRIPTORS, ...COMMON_SHADOW_DESCRIPTORS];
    case 'line':
      return [...createShapeDescriptors('line'), ...COMMON_BLUR_DESCRIPTORS, ...COMMON_SHADOW_DESCRIPTORS];
    case 'generator':
      return [...createGeneratorDescriptors(item), ...COMMON_BLUR_DESCRIPTORS];
    default:
      return [];
  }
}

export function buildInspectorEnvironment(
  availableFonts: UploadedFont[],
  fonts: DocumentFontReference[]
): InspectorDescriptorEnvironment {
  return {
    availableFonts,
    fontOptions: buildFontOptions(availableFonts, fonts),
  };
}

export function buildSelectionInspectorSections(
  selectedItems: CanvasItem[],
  environment: InspectorDescriptorEnvironment
): ResolvedInspectorSection[] {
  if (selectedItems.length === 0) {
    return [];
  }

  const context: InspectorDescriptorContext = {
    ...environment,
    selectedItems,
  };
  const descriptorLists = selectedItems.map((item) => getItemFieldDescriptors(item));
  const descriptorMaps = descriptorLists.map((descriptors) =>
    new Map(descriptors.map((descriptor) => [getDescriptorKey(descriptor), descriptor]))
  );
  const firstDescriptorList = descriptorLists[0] ?? [];

  const sharedDescriptors = firstDescriptorList.filter((descriptor) => {
    const descriptorKey = getDescriptorKey(descriptor);
    return descriptorMaps.every((map) => map.has(descriptorKey));
  });

  const sections = new Map<string, ResolvedInspectorSection>();

  for (const descriptor of sharedDescriptors) {
    const values = selectedItems.map((item) => descriptor.getValue(item));
    const firstValue = values[0] ?? null;
    const isMixed = values.some((value) => value !== firstValue);
    const section =
      sections.get(descriptor.sectionKey) ??
      {
        fields: [],
        key: descriptor.sectionKey,
        label: descriptor.sectionLabel,
        order: descriptor.sectionOrder,
      };

    const selectorStates: Record<string, ResolvedInspectorFieldState<unknown>> = {};
    if (descriptor.controlKind === 'custom' && descriptor.selectors) {
      for (const [selectorKey, selector] of Object.entries(descriptor.selectors)) {
        const sValues = selectedItems.map(selector);
        const sFirst = sValues[0] ?? null;
        const sMixed = sValues.some((v) => v !== sFirst);
        selectorStates[selectorKey] = { firstValue: sFirst, isMixed: sMixed, value: sMixed ? null : sFirst };
      }
    }

    section.fields.push({
      descriptor,
      disabled: descriptor.getDisabled?.(context) ?? false,
      key: getDescriptorKey(descriptor),
      options: descriptor.getOptions?.(context) ?? [],
      state: {
        firstValue,
        isMixed,
        value: isMixed ? null : firstValue,
      },
      selectorStates,
    });
    sections.set(descriptor.sectionKey, section);
  }

  return Array.from(sections.values())
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      ...section,
      fields: section.fields.sort(
        (left, right) => left.descriptor.fieldOrder - right.descriptor.fieldOrder
      ),
    }));
}
