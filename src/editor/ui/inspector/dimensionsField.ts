import { scaleImageSourceTransform } from '../../rendering/imagePresentation';
import { renderDimensionsField } from './selectionInspectorRenderers';
import { createCustomField, SECTION_ORDER } from './inspectorFieldHelpers';
import type { CustomFieldDescriptor } from './selectionInspectorModel';

export type DimensionAction =
  | { kind: 'absWidth'; value: number; locked: boolean }
  | { kind: 'absHeight'; value: number; locked: boolean }
  | { kind: 'pctWidth'; value: number; locked: boolean }
  | { kind: 'pctHeight'; value: number; locked: boolean }
  | { kind: 'setLock'; value: boolean }
  | { kind: 'resetOriginal' };

export function createDimensionsField(): CustomFieldDescriptor {
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
