import type { ReactNode } from 'react';

import type {
  CanvasItem,
  DocumentFontReference,
  TextAlign,
  TextVerticalAlign,
  UploadedFont,
} from '../../document/documentTypes';
import { scaleImageSourceTransform } from '../../rendering/imagePresentation';
import type { FontOption } from '../FontFamilyPicker';
import {
  renderAlignField,
  renderBoldField,
  renderDimensionsField,
  renderFontFamilyField,
  renderItalicField,
  renderMirrorField,
  renderSwapFillColorsField,
  renderVerticalAlignField,
} from './selectionInspectorRenderers';

import {
  buildFontOptions,
  buildImageAdjustmentsChange,
  getTextStyleCapabilities,
} from './inspectorModel';

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
  supportsMultiEdit: boolean;
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

const SECTION_ORDER = {
  image: 5,
  fill: 10,
  stroke: 15,
  text: 20,
  geometry: 50,
  advancedText: 60,
  shadow: 70,
} as const;

const ALIGN_OPTIONS: SelectOption[] = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

const VERTICAL_ALIGN_OPTIONS: SelectOption[] = [
  { label: 'Top', value: 'top' },
  { label: 'Middle', value: 'middle' },
  { label: 'Bottom', value: 'bottom' },
];

function getDescriptorKey(descriptor: InspectorFieldDescriptor): string {
  return `${descriptor.sectionKey}:${descriptor.propertyKey}:${descriptor.valueType}`;
}

function createNumberField(
  descriptor: Omit<NumberFieldDescriptor, 'controlKind'>
): NumberFieldDescriptor {
  return {
    controlKind: 'number',
    ...descriptor,
  };
}

function createTextField(
  descriptor: Omit<TextFieldDescriptor, 'controlKind'>
): TextFieldDescriptor {
  return {
    controlKind: 'text',
    ...descriptor,
  };
}

function createBooleanField(
  descriptor: Omit<BooleanFieldDescriptor, 'controlKind'>
): BooleanFieldDescriptor {
  return {
    controlKind: 'boolean',
    ...descriptor,
  };
}

function createColorField(
  descriptor: Omit<ColorFieldDescriptor, 'controlKind'>
): ColorFieldDescriptor {
  return {
    controlKind: 'color',
    ...descriptor,
  };
}

function createCustomField(
  descriptor: Omit<CustomFieldDescriptor, 'controlKind'>
): CustomFieldDescriptor {
  return {
    controlKind: 'custom',
    ...descriptor,
  };
}

function createGeometryField(
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
    supportsMultiEdit: true,
    valueType: 'number',
    ...extra,
  });
}


export type DimensionAction =
  | { kind: 'absWidth'; value: number; locked: boolean }
  | { kind: 'absHeight'; value: number; locked: boolean }
  | { kind: 'pctWidth'; value: number; locked: boolean }
  | { kind: 'pctHeight'; value: number; locked: boolean }
  | { kind: 'setLock'; value: boolean }
  | { kind: 'resetOriginal' };

function createDimensionsField(): CustomFieldDescriptor {
  return createCustomField({
    buildChange: ({ item }, nextValue) => {
      const action = nextValue as DimensionAction;
      switch (action.kind) {
        case 'absWidth': {
          if (item.kind === 'image') {
            const oldW = item.width * item.scaleX;
            const ratioX = action.value / Math.max(oldW, 1);
            if (action.locked) {
              const oldH = item.height * item.scaleY;
              return {
                width: action.value,
                height: oldH * ratioX,
                scaleX: 1,
                scaleY: 1,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, ratioX),
              };
            }
            return {
              width: action.value,
              scaleX: 1,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, 1),
            };
          }
          if (!action.locked) return { width: action.value };
          const ratio = item.width / item.height;
          return { width: action.value, height: action.value / ratio };
        }
        case 'absHeight': {
          if (item.kind === 'image') {
            const oldH = item.height * item.scaleY;
            const ratioY = action.value / Math.max(oldH, 1);
            if (action.locked) {
              const oldW = item.width * item.scaleX;
              return {
                width: oldW * ratioY,
                height: action.value,
                scaleX: 1,
                scaleY: 1,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioY, ratioY),
              };
            }
            return {
              height: action.value,
              scaleY: 1,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, 1, ratioY),
            };
          }
          if (!action.locked) return { height: action.value };
          const ratio = item.width / item.height;
          return { width: action.value * ratio, height: action.value };
        }
        case 'pctWidth': {
          const newScale = action.value / 100;
          if (item.kind === 'image') {
            const ratioX = newScale / (item.scaleX || 1);
            if (action.locked) {
              const ratioY = newScale / (item.scaleY || 1);
              return {
                scaleX: newScale,
                scaleY: newScale,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, ratioY),
              };
            }
            return {
              scaleX: newScale,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, 1),
            };
          }
          return action.locked
            ? { scaleX: newScale, scaleY: newScale }
            : { scaleX: newScale };
        }
        case 'pctHeight': {
          const newScale = action.value / 100;
          if (item.kind === 'image') {
            const ratioY = newScale / (item.scaleY || 1);
            if (action.locked) {
              const ratioX = newScale / (item.scaleX || 1);
              return {
                scaleX: newScale,
                scaleY: newScale,
                sourceTransform: scaleImageSourceTransform(item.sourceTransform, ratioX, ratioY),
              };
            }
            return {
              scaleY: newScale,
              sourceTransform: scaleImageSourceTransform(item.sourceTransform, 1, ratioY),
            };
          }
          return action.locked
            ? { scaleX: newScale, scaleY: newScale }
            : { scaleY: newScale };
        }
        case 'setLock':
          return { lockAspectRatio: action.value };
        case 'resetOriginal':
          if (item.kind !== 'image') return {};
          return {
            width: item.originalWidth,
            height: item.originalHeight,
            scaleX: 1,
            scaleY: 1,
            sourceTransform: {
              x: 0,
              y: 0,
              width: item.originalWidth,
              height: item.originalHeight,
              rotation: 0,
            },
          };
      }
    },
    fieldOrder: 30,
    getValue: (item) => item.width,
    label: 'Dimensions',
    propertyKey: 'dimensions',
    render: renderDimensionsField,
    sectionKey: 'geometry',
    sectionLabel: 'Geometry',
    sectionOrder: SECTION_ORDER.geometry,
    selectors: {
      height: (item) => item.height,
      scaleX: (item) => item.scaleX,
      scaleY: (item) => item.scaleY,
      lockAspectRatio: (item) => item.lockAspectRatio,
      originalWidth: (item) => (item.kind === 'image' ? item.originalWidth : null),
      originalHeight: (item) => (item.kind === 'image' ? item.originalHeight : null),
    },
    supportsMultiEdit: true,
    valueType: 'number',
  });
}

function createShadowNumberField(
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
    supportsMultiEdit: true,
    valueType: 'number',
    ...extra,
  });
}

function createFontFamilyField(): CustomFieldDescriptor {
  return createCustomField({
    buildChange: (_context, nextValue) => ({
      fontFamily: String(nextValue),
    }),
    fieldOrder: 20,
    getOptions: ({ fontOptions }) =>
      fontOptions.map((font) => ({
        kind: font.kind,
        label: font.family,
        sourceName: font.sourceName,
        value: font.family,
      })),
    getValue: (item) => (item.kind === 'text' ? item.fontFamily : ''),
    label: 'Font',
    propertyKey: 'fontFamily',
    render: renderFontFamilyField,
    sectionKey: 'text',
    sectionLabel: 'Text',
    sectionOrder: SECTION_ORDER.text,
    supportsMultiEdit: true,
    valueType: 'select',
  });
}

function createTextDescriptors(): InspectorFieldDescriptor[] {
  return [
    createColorField({
      buildChange: (_context, nextValue) => ({ fill: nextValue }),
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.fill : ''),
      label: 'Fill',
      propertyKey: 'fill',
      sectionKey: 'fill',
      sectionLabel: 'Fill',
      sectionOrder: SECTION_ORDER.fill,
      supportsMultiEdit: true,
      valueType: 'color',
    }),
    createBooleanField({
      buildChange: (_context, nextValue) => ({ gradientEnabled: nextValue }),
      fieldOrder: 20,
      getValue: (item) => item.kind === 'text' && item.gradientEnabled,
      label: 'Gradient',
      propertyKey: 'gradientEnabled',
      sectionKey: 'fill',
      sectionLabel: 'Fill',
      sectionOrder: SECTION_ORDER.fill,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createColorField({
      buildChange: (_context, nextValue) => ({ secondaryFill: nextValue }),
      fieldOrder: 30,
      getDisabled: ({ selectedItems }) =>
        selectedItems.every(
          (item) => !('gradientEnabled' in item) || !item.gradientEnabled,
        ),
      getValue: (item) => (item.kind === 'text' ? item.secondaryFill : ''),
      label: 'Secondary fill',
      propertyKey: 'secondaryFill',
      sectionKey: 'fill',
      sectionLabel: 'Fill',
      sectionOrder: SECTION_ORDER.fill,
      supportsMultiEdit: true,
      valueType: 'color',
    }),
    {
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
      supportsMultiEdit: true,
      valueType: 'custom',
    },
    createTextField({
      buildChange: (_context, nextValue) => ({ text: nextValue }),
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.text : ''),
      label: 'Text content',
      multiline: true,
      propertyKey: 'text',
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'text',
    }),
    createFontFamilyField(),
    createNumberField({
      buildChange: (_context, nextValue) => ({ fontSize: nextValue }),
      digits: 0,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'text' ? item.fontSize : 0),
      label: 'Size',
      min: 1,
      propertyKey: 'fontSize',
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      step: 1,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        fontWeight: nextValue ? 'bold' : 'normal',
      }),
      fieldOrder: 40,
      getDisabled: ({ availableFonts, selectedItems }) => {
        if (selectedItems.length !== 1 || selectedItems[0]?.kind !== 'text') {
          return false;
        }
        return !getTextStyleCapabilities(selectedItems[0], availableFonts).canToggleBold;
      },
      getValue: (item) => item.kind === 'text' && item.fontWeight === 'bold',
      label: 'Bold',
      propertyKey: 'fontWeight',
      render: renderBoldField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        fontStyle: nextValue ? 'italic' : 'normal',
      }),
      fieldOrder: 50,
      getDisabled: ({ availableFonts, selectedItems }) => {
        if (selectedItems.length !== 1 || selectedItems[0]?.kind !== 'text') {
          return false;
        }
        return !getTextStyleCapabilities(selectedItems[0], availableFonts).canToggleItalic;
      },
      getValue: (item) => item.kind === 'text' && item.fontStyle === 'italic',
      label: 'Italic',
      propertyKey: 'fontStyle',
      render: renderItalicField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        align: String(nextValue) as TextAlign,
      }),
      fieldOrder: 60,
      getOptions: () => ALIGN_OPTIONS,
      getValue: (item) => (item.kind === 'text' ? item.align : 'left'),
      label: 'Align',
      propertyKey: 'align',
      render: renderAlignField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'select',
    }),
    createCustomField({
      buildChange: (_context, nextValue) => ({
        verticalAlign: String(nextValue) as TextVerticalAlign,
      }),
      fieldOrder: 70,
      getOptions: () => VERTICAL_ALIGN_OPTIONS,
      getValue: (item) => (item.kind === 'text' ? item.verticalAlign : 'top'),
      label: 'Vertical align',
      propertyKey: 'verticalAlign',
      render: renderVerticalAlignField,
      sectionKey: 'text',
      sectionLabel: 'Text',
      sectionOrder: SECTION_ORDER.text,
      supportsMultiEdit: true,
      valueType: 'select',
    }),
    createGeometryField('x', 'X', 10, (item) => item.x, (_context, nextValue) => ({ x: nextValue }), {
      digits: 1,
      step: 0.1,
    }),
    createGeometryField('y', 'Y', 20, (item) => item.y, (_context, nextValue) => ({ y: nextValue }), {
      digits: 1,
      step: 0.1,
    }),
    createDimensionsField(),
    createGeometryField(
      'rotation',
      'Rotation',
      50,
      (item) => item.rotation,
      (_context, nextValue) => ({ rotation: nextValue }),
      { digits: 0, step: 1 }
    ),
    createNumberField({
      buildChange: (_context, nextValue) => ({ lineHeight: nextValue }),
      digits: 1,
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'text' ? item.lineHeight : 0),
      label: 'Line height',
      min: 0.5,
      propertyKey: 'lineHeight',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      step: 0.1,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ letterSpacing: nextValue }),
      digits: 1,
      fieldOrder: 20,
      getValue: (item) => (item.kind === 'text' ? item.letterSpacing : 0),
      label: 'Character spacing',
      propertyKey: 'letterSpacing',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      step: 0.5,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, top: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'text' ? item.padding.top : 0),
      label: 'Padding top',
      propertyKey: 'paddingTop',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, right: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 40,
      getValue: (item) => (item.kind === 'text' ? item.padding.right : 0),
      label: 'Padding right',
      propertyKey: 'paddingRight',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, bottom: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 50,
      getValue: (item) => (item.kind === 'text' ? item.padding.bottom : 0),
      label: 'Padding bottom',
      propertyKey: 'paddingBottom',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'text'
          ? {
              padding: { ...item.padding, left: nextValue },
            }
          : {},
      digits: 1,
      fieldOrder: 60,
      getValue: (item) => (item.kind === 'text' ? item.padding.left : 0),
      label: 'Padding left',
      propertyKey: 'paddingLeft',
      sectionKey: 'advancedText',
      sectionLabel: 'Advanced text',
      sectionOrder: SECTION_ORDER.advancedText,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
  ];
}

function createShapeDescriptors(
  itemKind: 'ellipse' | 'line' | 'rectangle'
): InspectorFieldDescriptor[] {
  const descriptors: InspectorFieldDescriptor[] = [
    createColorField({
      buildChange: (_context, nextValue) => ({ stroke: nextValue }),
      fieldOrder: 10,
      getValue: (item) => ('stroke' in item ? item.stroke : ''),
      label: 'Stroke',
      propertyKey: 'stroke',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,
      supportsMultiEdit: true,
      valueType: 'color',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ strokeWidth: nextValue }),
      digits: 1,
      fieldOrder: 20,
      getValue: (item) => ('strokeWidth' in item ? item.strokeWidth : 0),
      label: 'Stroke width',
      min: itemKind === 'line' ? 1 : 0,
      propertyKey: 'strokeWidth',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
  ];

  if (itemKind !== 'line') {
    descriptors.unshift(
      createColorField({
        buildChange: (_context, nextValue) => ({ fill: nextValue }),
        fieldOrder: 10,
        getValue: (item) => ('fill' in item ? item.fill : ''),
        label: 'Fill',
        propertyKey: 'fill',
        sectionKey: 'fill',
        sectionLabel: 'Fill',
        sectionOrder: SECTION_ORDER.fill,
        supportsMultiEdit: true,
        valueType: 'color',
      }),
      createBooleanField({
        buildChange: (_context, nextValue) => ({ gradientEnabled: nextValue }),
        fieldOrder: 20,
        getValue: (item) =>
          (item.kind === 'rectangle' || item.kind === 'ellipse') && item.gradientEnabled,
        label: 'Gradient',
        propertyKey: 'gradientEnabled',
        sectionKey: 'fill',
        sectionLabel: 'Fill',
        sectionOrder: SECTION_ORDER.fill,
        supportsMultiEdit: true,
        valueType: 'boolean',
      }),
      createColorField({
        buildChange: (_context, nextValue) => ({ secondaryFill: nextValue }),
        fieldOrder: 30,
        getDisabled: ({ selectedItems }) =>
          selectedItems.every(
            (item) => !('gradientEnabled' in item) || !item.gradientEnabled,
          ),
        getValue: (item) =>
          item.kind === 'rectangle' || item.kind === 'ellipse' ? item.secondaryFill : '',
        label: 'Secondary fill',
        propertyKey: 'secondaryFill',
        sectionKey: 'fill',
        sectionLabel: 'Fill',
        sectionOrder: SECTION_ORDER.fill,
        supportsMultiEdit: true,
        valueType: 'color',
      }),
      {
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
        supportsMultiEdit: true,
        valueType: 'custom',
      },
    );
  }

  if (itemKind === 'line') {
    descriptors.push(
      createGeometryField(
        'startX',
        'Start X',
        10,
        (item) => (item.kind === 'line' ? item.startX : 0),
        (_context, nextValue) => ({ startX: nextValue }),
        { digits: 1, step: 0.1 }
      ),
      createGeometryField(
        'startY',
        'Start Y',
        20,
        (item) => (item.kind === 'line' ? item.startY : 0),
        (_context, nextValue) => ({ startY: nextValue }),
        { digits: 1, step: 0.1 }
      ),
      createGeometryField(
        'endX',
        'End X',
        30,
        (item) => (item.kind === 'line' ? item.endX : 0),
        (_context, nextValue) => ({ endX: nextValue }),
        { digits: 1, step: 0.1 }
      ),
      createGeometryField(
        'endY',
        'End Y',
        40,
        (item) => (item.kind === 'line' ? item.endY : 0),
        (_context, nextValue) => ({ endY: nextValue }),
        { digits: 1, step: 0.1 }
      )
    );
  } else {
    descriptors.push(
      createGeometryField('x', 'X', 10, (item) => item.x, (_context, nextValue) => ({ x: nextValue }), {
        digits: 1,
        step: 0.1,
      }),
      createGeometryField('y', 'Y', 20, (item) => item.y, (_context, nextValue) => ({ y: nextValue }), {
        digits: 1,
        step: 0.1,
      }),
      createDimensionsField(),
      createGeometryField(
        'rotation',
        'Rotation',
        50,
        (item) => item.rotation,
        (_context, nextValue) => ({ rotation: nextValue }),
        { digits: 0, step: 1 }
      )
    );
  }

  if (itemKind === 'rectangle') {
    descriptors.push(
      createGeometryField(
        'cornerRadius',
        'Corner radius',
        60,
        (item) => (item.kind === 'rectangle' ? item.cornerRadius : 0),
        (_context, nextValue) => ({ cornerRadius: nextValue }),
        { digits: 1, min: 0 }
      )
    );
  }

  return descriptors;
}

function createImageDescriptors(): InspectorFieldDescriptor[] {
  return [
    createCustomField({
      buildChange: (_context, nextValue) => ({
        mirrorHorizontal: Boolean(nextValue),
      }),
      fieldOrder: 5,
      getValue: (item) => item.kind === 'image' && item.mirrorHorizontal,
      label: 'Mirror',
      propertyKey: 'mirrorHorizontal',
      render: renderMirrorField,
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createBooleanField({
      buildChange: (_context, nextValue) => ({ preserveAspectRatio: nextValue }),
      fieldOrder: 10,
      getValue: (item) => item.kind === 'image' && item.preserveAspectRatio,
      label: 'Preserve aspect ratio',
      propertyKey: 'preserveAspectRatio',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      supportsMultiEdit: true,
      valueType: 'boolean',
    }),
    createColorField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { tintColor: nextValue })
          : {},
      fieldOrder: 20,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.tintColor : ''),
      label: 'Tint color',
      propertyKey: 'tintColor',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      supportsMultiEdit: true,
      valueType: 'color',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { brightness: nextValue })
          : {},
      digits: 0,
      fieldOrder: 30,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.brightness : 0),
      label: 'Brightness',
      max: 200,
      min: 0,
      propertyKey: 'brightness',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      sliderDetentThreshold: 3,
      sliderDetentValue: 100,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { contrast: nextValue })
          : {},
      digits: 0,
      fieldOrder: 40,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.contrast : 0),
      label: 'Contrast',
      max: 100,
      min: 0,
      propertyKey: 'contrast',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      sliderDetentThreshold: 2,
      sliderDetentValue: 50,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: ({ item }, nextValue) =>
        item.kind === 'image'
          ? buildImageAdjustmentsChange(item.adjustments, { tintStrength: nextValue })
          : {},
      digits: 0,
      fieldOrder: 50,
      getValue: (item) => (item.kind === 'image' ? item.adjustments.tintStrength : 0),
      label: 'Tint strength',
      max: 100,
      min: 0,
      propertyKey: 'tintStrength',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      slider: true,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ opacity: nextValue }),
      digits: 1,
      fieldOrder: 60,
      getValue: (item) => item.opacity,
      label: 'Opacity',
      max: 1,
      min: 0,
      propertyKey: 'opacity',
      sectionKey: 'image',
      sectionLabel: 'Image',
      sectionOrder: SECTION_ORDER.image,
      step: 0.1,
      supportsMultiEdit: true,
      valueType: 'number',
    }),
    createGeometryField('x', 'X', 10, (item) => item.x, (_context, nextValue) => ({ x: nextValue }), {
      digits: 1,
      step: 0.1,
    }),
    createGeometryField('y', 'Y', 20, (item) => item.y, (_context, nextValue) => ({ y: nextValue }), {
      digits: 1,
      step: 0.1,
    }),
    createDimensionsField(),
    createGeometryField(
      'rotation',
      'Rotation',
      50,
      (item) => item.rotation,
      (_context, nextValue) => ({ rotation: nextValue }),
      { digits: 0, step: 1 }
    ),
  ];
}

const COMMON_SHADOW_DESCRIPTORS: InspectorFieldDescriptor[] = [
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
    supportsMultiEdit: true,
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

function getItemFieldDescriptors(item: CanvasItem): InspectorFieldDescriptor[] {
  switch (item.kind) {
    case 'text':
      return [...createTextDescriptors(), ...COMMON_SHADOW_DESCRIPTORS];
    case 'image':
      return [...createImageDescriptors(), ...COMMON_SHADOW_DESCRIPTORS];
    case 'rectangle':
      return [...createShapeDescriptors('rectangle'), ...COMMON_SHADOW_DESCRIPTORS];
    case 'ellipse':
      return [...createShapeDescriptors('ellipse'), ...COMMON_SHADOW_DESCRIPTORS];
    case 'line':
      return [...createShapeDescriptors('line'), ...COMMON_SHADOW_DESCRIPTORS];
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
  const isMultiSelection = selectedItems.length > 1;
  const sharedDescriptors = firstDescriptorList.filter((descriptor) => {
    if (isMultiSelection && !descriptor.supportsMultiEdit) {
      return false;
    }
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

export function getSelectionDescriptorCoverage(
  item: CanvasItem
): Array<Pick<InspectorFieldDescriptor, 'propertyKey' | 'sectionKey' | 'valueType'>> {
  return getItemFieldDescriptors(item).map((descriptor) => ({
    propertyKey: descriptor.propertyKey,
    sectionKey: descriptor.sectionKey,
    valueType: descriptor.valueType,
  }));
}
