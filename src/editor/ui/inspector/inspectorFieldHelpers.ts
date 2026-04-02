import type {
  CanvasItem,
} from '../../document/documentTypes';
import {
  renderSwapFillColorsField,
} from './selectionInspectorRenderers';
import type {
  BooleanFieldDescriptor,
  ColorFieldDescriptor,
  CustomFieldDescriptor,
  InspectorFieldDescriptor,
  NumberFieldDescriptor,
  SelectFieldDescriptor,
  SelectionFieldChangeContext,
  SelectOption,
  TextFieldDescriptor,
} from './selectionInspectorModel';

export const SECTION_ORDER = {
  generator: 3,
  image: 5,
  fill: 10,
  stroke: 15,
  text: 20,
  geometry: 50,
  advancedText: 60,
  blur: 65,
  shadow: 70,
} as const;

export const ALIGN_OPTIONS: SelectOption[] = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

export const VERTICAL_ALIGN_OPTIONS: SelectOption[] = [
  { label: 'Top', value: 'top' },
  { label: 'Middle', value: 'middle' },
  { label: 'Bottom', value: 'bottom' },
];

export function createNumberField(
  descriptor: Omit<NumberFieldDescriptor, 'controlKind'>
): NumberFieldDescriptor {
  return {
    controlKind: 'number',
    ...descriptor,
  };
}

export function createTextField(
  descriptor: Omit<TextFieldDescriptor, 'controlKind'>
): TextFieldDescriptor {
  return {
    controlKind: 'text',
    ...descriptor,
  };
}

export function createBooleanField(
  descriptor: Omit<BooleanFieldDescriptor, 'controlKind'>
): BooleanFieldDescriptor {
  return {
    controlKind: 'boolean',
    ...descriptor,
  };
}

export function createColorField(
  descriptor: Omit<ColorFieldDescriptor, 'controlKind'>
): ColorFieldDescriptor {
  return {
    controlKind: 'color',
    ...descriptor,
  };
}

export function createSelectField(
  descriptor: Omit<SelectFieldDescriptor, 'controlKind'>
): SelectFieldDescriptor {
  return {
    controlKind: 'select',
    ...descriptor,
  };
}

export function createCustomField(
  descriptor: Omit<CustomFieldDescriptor, 'controlKind'>
): CustomFieldDescriptor {
  return {
    controlKind: 'custom',
    ...descriptor,
  };
}

export function createGeometryField(
  propertyKey: string,
  label: string,
  fieldOrder: number,
  getValue: (item: CanvasItem) => number,
  buildChange: (
    context: SelectionFieldChangeContext,
    nextValue: number,
  ) => Partial<CanvasItem>,
  extra?: Partial<NumberFieldDescriptor>,
): NumberFieldDescriptor {
  return createNumberField({
    buildChange,
    fieldOrder,
    getValue,
    label,
    propertyKey,
    sectionKey: 'geometry',
    sectionLabel: 'Geometry',
    sectionOrder: SECTION_ORDER.geometry,

    valueType: 'number',
    ...extra,
  });
}

export { createDimensionsField, type DimensionAction } from './dimensionsField';

export function createShadowNumberField(
  propertyKey: string,
  label: string,
  fieldOrder: number,
  getValue: (item: CanvasItem) => number,
  buildValue: (nextValue: number) => Partial<CanvasItem['shadow']>,
  extra?: Partial<NumberFieldDescriptor>,
): NumberFieldDescriptor {
  return createNumberField({
    buildChange: ({ item }, nextValue) => ({
      shadow: {
        ...item.shadow,
        ...buildValue(nextValue),
      },
    }),
    fieldOrder,
    getValue,
    label,
    propertyKey,
    sectionKey: 'shadow',
    sectionLabel: 'Shadow',
    sectionOrder: SECTION_ORDER.shadow,

    valueType: 'number',
    ...extra,
  });
}

export function createSwapFillColorsDescriptor(): InspectorFieldDescriptor {
  return {
    buildChange: ({ item }: SelectionFieldChangeContext) => {
      const fill = 'fill' in item ? item.fill : '';
      const secondaryFill = 'secondaryFill' in item ? item.secondaryFill : '';
      return { fill: secondaryFill, secondaryFill: fill };
    },
    controlKind: 'custom' as const,
    fieldOrder: 40,
    getDisabled: ({ selectedItems }) =>
      selectedItems.every(
        (item) => !('gradientEnabled' in item) || !item.gradientEnabled,
      ),
    getValue: () => null,
    label: 'Swap fill colors',
    propertyKey: 'swapFillColors',
    render: renderSwapFillColorsField,
    sectionKey: 'fill',
    sectionLabel: 'Fill',
    sectionOrder: SECTION_ORDER.fill,

    valueType: 'custom',
  };
}

export const COMMON_BLUR_DESCRIPTORS: InspectorFieldDescriptor[] = [
  createNumberField({
    buildChange: (_context, nextValue) => ({ blurRadius: nextValue }),
    digits: 0,
    fieldOrder: 10,
    getValue: (item) => item.blurRadius,
    label: 'Blur radius',
    max: Infinity,
    min: 0,
    propertyKey: 'blurRadius',
    sectionKey: 'blur',
    sectionLabel: 'Blur',
    sectionOrder: SECTION_ORDER.blur,
    step: 1,

    valueType: 'number',
  }),
];

export const COMMON_SHADOW_DESCRIPTORS: InspectorFieldDescriptor[] = [
  createColorField({
    buildChange: ({ item }, nextValue) => ({
      shadow: {
        ...item.shadow,
        color: nextValue,
      },
    }),
    fieldOrder: 10,
    getValue: (item) => item.shadow.color,
    label: 'Shadow color',
    propertyKey: 'color',
    sectionKey: 'shadow',
    sectionLabel: 'Shadow',
    sectionOrder: SECTION_ORDER.shadow,

    valueType: 'color',
  }),
  createShadowNumberField('blur', 'Blur', 20, (item) => item.shadow.blur, (nextValue) => ({
    blur: nextValue,
  }), {
    digits: 1,
    min: 0,
  }),
  createShadowNumberField(
    'opacity',
    'Opacity',
    30,
    (item) => item.shadow.opacity,
    (nextValue) => ({ opacity: nextValue }),
    {
      digits: 1,
      max: 1,
      min: 0,
      step: 0.1,
    }
  ),
  createShadowNumberField(
    'offsetX',
    'Offset X',
    40,
    (item) => item.shadow.offsetX,
    (nextValue) => ({ offsetX: nextValue }),
    {
      digits: 1,
    }
  ),
  createShadowNumberField(
    'offsetY',
    'Offset Y',
    50,
    (item) => item.shadow.offsetY,
    (nextValue) => ({ offsetY: nextValue }),
    {
      digits: 1,
    }
  ),
];
