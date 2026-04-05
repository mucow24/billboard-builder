import type {
  CanvasItem,
  GradientFillItem,
} from '../../document/documentTypes';
import { localToStage, rotateVector } from '../../rendering/interactionGeometry';
import { getRenderBox } from '../../rendering/transformGeometry';
import {
  renderGradientFillField,
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

export const ROTATION_FIELD_EXTRA: Partial<NumberFieldDescriptor> = {
  digits: 0,
  max: 180,
  min: -180,
  slider: true,
  sliderDetentThreshold: 5,
  sliderDetentValue: 0,
  step: 1,
  textMax: Infinity,
  textMin: -Infinity,
};

export function createRotationField(): NumberFieldDescriptor {
  return createGeometryField(
    'rotation',
    'Rotation',
    50,
    (item) => item.rotation,
    ({ item }, nextValue) => {
      if (item.kind === 'line') return { rotation: nextValue };
      const renderBox = getRenderBox(item);
      const half = { x: renderBox.width / 2, y: renderBox.height / 2 };
      const center = localToStage(half, renderBox, item.rotation);
      const newHalf = rotateVector(half, nextValue);
      return {
        x: center.x - newHalf.x,
        y: center.y - newHalf.y,
        rotation: nextValue,
      };
    },
    ROTATION_FIELD_EXTRA,
  );
}

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

export type GradientFillAction =
  | { kind: 'primaryColor'; value: string }
  | { kind: 'secondaryColor'; value: string }
  | { kind: 'swap' }
  | { kind: 'toggleGradient'; value: boolean };

export function createGradientFillDescriptor(): CustomFieldDescriptor {
  return createCustomField({
    buildChange: ({ item }, nextValue) => {
      const action = nextValue as GradientFillAction;
      switch (action.kind) {
        case 'primaryColor':
          return { fill: action.value };
        case 'secondaryColor':
          return { secondaryFill: action.value };
        case 'swap': {
          const fill = 'fill' in item ? item.fill : '';
          const secondaryFill = 'secondaryFill' in item ? item.secondaryFill : '';
          return { fill: secondaryFill, secondaryFill: fill };
        }
        case 'toggleGradient':
          return { gradientEnabled: action.value };
      }
    },
    fieldOrder: 10,
    getValue: (item) => ('fill' in item ? item.fill : ''),
    label: 'Fill',
    propertyKey: 'gradientFill',
    render: renderGradientFillField,
    sectionKey: 'fill',
    sectionLabel: 'Fill',
    sectionOrder: SECTION_ORDER.fill,
    selectors: {
      secondaryFill: (item) =>
        'secondaryFill' in item ? item.secondaryFill : '',
      gradientEnabled: (item) =>
        'gradientEnabled' in item ? item.gradientEnabled : false,
    },
    valueType: 'custom',
  });
}

export function createGradientAngleDescriptor(): NumberFieldDescriptor {
  return createNumberField({
    buildChange: (_context, nextValue) => ({ gradientAngle: nextValue }),
    digits: 0,
    fieldOrder: 20,
    getDisabled: ({ selectedItems }) =>
      selectedItems.every(
        (item) => !('gradientEnabled' in item && item.gradientEnabled),
      ),
    getValue: (item) =>
      'gradientAngle' in item ? (item as GradientFillItem).gradientAngle : 0,
    label: 'Angle',
    max: 180,
    min: -180,
    propertyKey: 'gradientAngle',
    sectionKey: 'fill',
    sectionLabel: 'Fill',
    sectionOrder: SECTION_ORDER.fill,
    slider: true,
    sliderDetentThreshold: 5,
    sliderDetentValue: 0,
    step: 1,
    textMax: Infinity,
    textMin: -Infinity,
    valueType: 'number',
  });
}

export const COMMON_BLUR_DESCRIPTORS: InspectorFieldDescriptor[] = [
  createNumberField({
    buildChange: (_context, nextValue) => ({ blurRadius: nextValue }),
    digits: 0,
    fieldOrder: 10,
    getValue: (item) => item.blurRadius,
    label: 'Blur radius',
    max: 100,
    min: 0,
    propertyKey: 'blurRadius',
    sectionKey: 'blur',
    sectionLabel: 'Blur',
    sectionOrder: SECTION_ORDER.blur,
    slider: true,
    step: 1,
    textMax: Infinity,

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
    max: 100,
    min: 0,
    slider: true,
    step: 1,
    textMax: Infinity,
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
      slider: true,
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
      max: 100,
      min: -100,
      slider: true,
      sliderDetentThreshold: 2,
      sliderDetentValue: 0,
      step: 1,
      textMax: Infinity,
      textMin: -Infinity,
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
      max: 100,
      min: -100,
      slider: true,
      sliderDetentThreshold: 2,
      sliderDetentValue: 0,
      step: 1,
      textMax: Infinity,
      textMin: -Infinity,
    }
  ),
];
