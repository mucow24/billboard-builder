import { mirrorPolygonVerticesHorizontally } from '../../document/polygonVertices';
import {
  createBooleanField,
  createColorField,
  createCustomField,
  createDimensionsField,
  createGeometryField,
  createGradientAngleDescriptor,
  createGradientFillDescriptor,
  createNumberField,
  createPositionXField,
  createPositionYField,
  createRotationField,
  SECTION_ORDER,
} from './inspectorFieldHelpers';
import type { InspectorFieldDescriptor } from './selectionInspectorModel';
import { renderMirrorField } from './selectionInspectorRenderers';

/** Largest Curve radius the inspector offers, in pixels. */
const POLYGON_CURVE_RADIUS_MAX = 100;

/**
 * Freeform polygon fields. Fill (with gradient) applies only while the polygon
 * is closed — an open chain is stroke-only, so the fill section disappears,
 * mirroring how massimo greys those controls out.
 */
export function createPolygonDescriptors(closed: boolean): InspectorFieldDescriptor[] {
  const descriptors: InspectorFieldDescriptor[] = [
    createColorField({
      buildChange: (_context, nextValue) => ({ stroke: nextValue }),
      fieldOrder: 10,
      getValue: (item) => ('stroke' in item ? item.stroke : ''),
      label: 'Color',
      tooltip: 'Color of the outline.',
      propertyKey: 'stroke',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,

      valueType: 'color',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ strokeWidth: nextValue }),
      digits: 1,
      fieldOrder: 20,
      getValue: (item) => ('strokeWidth' in item ? item.strokeWidth : 0),
      label: 'Width',
      tooltip: 'Thickness of the outline in pixels. 0 removes it.',
      max: 50,
      min: 0,
      propertyKey: 'strokeWidth',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,
      slider: true,
      step: 1,
      textMax: Infinity,

      valueType: 'number',
    }),
    createBooleanField({
      buildChange: (_context, nextValue) => ({ closed: nextValue }),
      fieldOrder: 40,
      getValue: (item) => item.kind === 'polygon' && item.closed,
      label: 'Closed',
      tooltip:
        'Join the last point back to the first so the shape can be filled. When off, the shape is an open line with no fill.',
      propertyKey: 'closed',
      sectionKey: 'geometry',
      sectionLabel: 'Geometry',
      sectionOrder: SECTION_ORDER.geometry,

      valueType: 'boolean',
    }),
    // What shapes this polygon in particular gets a section of its own that
    // starts open, like N-gon's Sides, rather than rows in Geometry, which
    // starts closed.
    createNumberField({
      buildChange: (_context, nextValue) => ({
        curveRadius: Math.min(POLYGON_CURVE_RADIUS_MAX, Math.max(0, nextValue)),
      }),
      digits: 1,
      fieldOrder: 10,
      getValue: (item) => (item.kind === 'polygon' ? item.curveRadius : 0),
      label: 'Curve radius',
      max: POLYGON_CURVE_RADIUS_MAX,
      min: 0,
      propertyKey: 'curveRadius',
      sectionKey: 'polygon',
      sectionLabel: 'Polygon',
      sectionOrder: SECTION_ORDER.polygon,
      slider: true,
      step: 1,
      tooltip:
        'Rounds every corner by this many pixels, from 0 (sharp corners) to 100. Corners next to a short side round less, as a curve never reaches past the middle of a side.',
      valueType: 'number',
    }),
    createCustomField({
      // The flip is baked into the vertices, so turning Mirror on or off flips
      // them; a polygon already in the asked-for state (part of a mixed
      // selection) is left alone.
      buildChange: ({ item }, nextValue) => {
        const mirrorHorizontal = Boolean(nextValue);
        if (item.kind !== 'polygon' || item.mirrorHorizontal === mirrorHorizontal) {
          return {};
        }
        return {
          mirrorHorizontal,
          vertices: mirrorPolygonVerticesHorizontally(item.vertices),
        };
      },
      fieldOrder: 20,
      getValue: (item) => item.kind === 'polygon' && item.mirrorHorizontal,
      label: 'Mirror',
      propertyKey: 'mirrorHorizontal',
      render: renderMirrorField,
      sectionKey: 'polygon',
      sectionLabel: 'Polygon',
      sectionOrder: SECTION_ORDER.polygon,
      tooltip: 'Flip the polygon left to right, in place. Click again to flip it back.',
      valueType: 'boolean',
    }),
  ];

  if (closed) {
    descriptors.unshift(createGradientFillDescriptor(), createGradientAngleDescriptor());
  }

  return descriptors;
}

export function createShapeDescriptors(
  itemKind: 'ellipse' | 'line' | 'ngon' | 'rectangle'
): InspectorFieldDescriptor[] {
  const descriptors: InspectorFieldDescriptor[] = [
    createColorField({
      buildChange: (_context, nextValue) => ({ stroke: nextValue }),
      fieldOrder: 10,
      getValue: (item) => ('stroke' in item ? item.stroke : ''),
      label: 'Color',
      tooltip: itemKind === 'line' ? 'Color of the line.' : 'Color of the outline.',
      propertyKey: 'stroke',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,

      valueType: 'color',
    }),
    createNumberField({
      buildChange: (_context, nextValue) => ({ strokeWidth: nextValue }),
      digits: 1,
      fieldOrder: 20,
      getValue: (item) => ('strokeWidth' in item ? item.strokeWidth : 0),
      label: 'Width',
      tooltip:
        itemKind === 'line'
          ? 'Thickness of the line in pixels.'
          : 'Thickness of the outline in pixels. 0 removes it.',
      max: 50,
      min: itemKind === 'line' ? 1 : 0,
      propertyKey: 'strokeWidth',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,
      slider: true,
      step: 1,
      textMax: Infinity,

      valueType: 'number',
    }),
  ];

  if (itemKind !== 'line') {
    descriptors.unshift(createGradientFillDescriptor(), createGradientAngleDescriptor());
  }

  if (itemKind === 'line') {
    descriptors.push(
      createGeometryField(
        'startX',
        'Start X',
        10,
        (item) => (item.kind === 'line' ? item.startX : 0),
        (_context, nextValue) => ({ startX: nextValue }),
        { digits: 1, step: 0.1, tooltip: "Horizontal position of the line's first point, in pixels from the left edge of the canvas." }
      ),
      createGeometryField(
        'startY',
        'Start Y',
        20,
        (item) => (item.kind === 'line' ? item.startY : 0),
        (_context, nextValue) => ({ startY: nextValue }),
        { digits: 1, step: 0.1, tooltip: "Vertical position of the line's first point, in pixels from the top edge of the canvas." }
      ),
      createGeometryField(
        'endX',
        'End X',
        30,
        (item) => (item.kind === 'line' ? item.endX : 0),
        (_context, nextValue) => ({ endX: nextValue }),
        { digits: 1, step: 0.1, tooltip: "Horizontal position of the line's second point, in pixels from the left edge of the canvas." }
      ),
      createGeometryField(
        'endY',
        'End Y',
        40,
        (item) => (item.kind === 'line' ? item.endY : 0),
        (_context, nextValue) => ({ endY: nextValue }),
        { digits: 1, step: 0.1, tooltip: "Vertical position of the line's second point, in pixels from the top edge of the canvas." }
      )
    );
  } else {
    descriptors.push(
      createPositionXField(),
      createPositionYField(),
      createDimensionsField(),
      createRotationField()
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
        {
          digits: 1,
          max: 250,
          min: 0,
          slider: true,
          step: 1,
          textMax: Infinity,
          tooltip: 'How rounded the corners are, in pixels. 0 gives square corners.',
        }
      )
    );
  }

  if (itemKind === 'ngon') {
    descriptors.push(
      // The side count defines the shape, so it gets a section of its own that
      // starts open, rather than a row in Geometry, which starts closed.
      createNumberField({
        buildChange: (_context, nextValue) => ({ sides: Math.max(3, Math.trunc(nextValue)) }),
        digits: 0,
        fieldOrder: 10,
        getValue: (item) => (item.kind === 'ngon' ? item.sides : 6),
        label: 'Sides',
        max: 12,
        min: 3,
        propertyKey: 'sides',
        sectionKey: 'ngon',
        sectionLabel: 'N-gon',
        sectionOrder: SECTION_ORDER.ngon,
        slider: true,
        step: 1,
        textMax: Infinity,
        tooltip: 'Number of sides, from 3 (triangle) upward.',
        valueType: 'number',
      })
    );
  }

  return descriptors;
}
