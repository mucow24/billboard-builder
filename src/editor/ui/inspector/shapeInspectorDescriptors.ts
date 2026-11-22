import { MIN_LINE_STROKE_WIDTH } from '../../document/documentDefaults';
import { mirrorPolygonVerticesHorizontally } from '../../document/polygonVertices';
import { mirrorGradientAngleHorizontally } from '../../rendering/geometry/gradientGeometry';
import {
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
import { renderMirrorActionField } from './selectionInspectorRenderers';

/**
 * Rounds the corners of a polygon or the bends of a line. The two differ only
 * in the section the field sits in and in how its tooltip names what it rounds.
 */
function createCurveRadiusField(
  section: { key: string; label: string; order: number },
  tooltip: string
): InspectorFieldDescriptor {
  return createNumberField({
    buildChange: (_context, nextValue) => ({ curveRadius: Math.max(0, nextValue) }),
    digits: 1,
    fieldOrder: 10,
    getValue: (item) => (item.kind === 'polygon' ? item.curveRadius : 0),
    label: 'Curve radius',
    max: 500,
    min: 0,
    propertyKey: 'curveRadius',
    sectionKey: section.key,
    sectionLabel: section.label,
    sectionOrder: section.order,
    slider: true,
    step: 1,
    textMax: Infinity,
    tooltip,
    valueType: 'number',
  });
}

/** One coordinate of a line's first or last vertex, as a Geometry row. */
function createLineEndField(
  propertyKey: 'startX' | 'startY' | 'endX' | 'endY',
  label: string,
  fieldOrder: number,
  tooltip: string
): InspectorFieldDescriptor {
  const axis = propertyKey.endsWith('X') ? 'x' : 'y';
  const endIndex = (vertexCount: number) => (propertyKey.startsWith('start') ? 0 : vertexCount - 1);
  return createGeometryField(
    propertyKey,
    label,
    fieldOrder,
    (item) => (item.kind === 'polygon' ? (item.vertices[endIndex(item.vertices.length)]?.[axis] ?? 0) : 0),
    ({ item }, nextValue) => {
      if (item.kind !== 'polygon') return {};
      const index = endIndex(item.vertices.length);
      // The normalizer re-derives the item's box from the vertices.
      return {
        vertices: item.vertices.map((vertex, vertexIndex) =>
          vertexIndex === index ? { ...vertex, [axis]: nextValue } : vertex
        ),
      };
    },
    { digits: 1, step: 0.1, tooltip }
  );
}

/**
 * Line fields. A line is an open polygon: stroke only, so it has no Fill
 * section, and its Geometry rows are its two ends (its first and last vertex)
 * however many bends lie between them.
 */
export function createLineDescriptors(): InspectorFieldDescriptor[] {
  return [
    createColorField({
      buildChange: (_context, nextValue) => ({ stroke: nextValue }),
      fieldOrder: 10,
      getValue: (item) => ('stroke' in item ? item.stroke : ''),
      label: 'Color',
      tooltip: 'Color of the line.',
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
      tooltip: 'Thickness of the line in pixels.',
      max: 50,
      min: 1,
      propertyKey: 'strokeWidth',
      sectionKey: 'stroke',
      sectionLabel: 'Stroke',
      sectionOrder: SECTION_ORDER.stroke,
      slider: true,
      step: 1,
      textMax: Infinity,
      // Thinner than the slider goes, like an outline; never 0, as a line is only its stroke.
      textMin: MIN_LINE_STROKE_WIDTH,

      valueType: 'number',
    }),
    // Like Polygon and N-gon, a section of its own that starts open.
    createCurveRadiusField(
      { key: 'line', label: 'Line', order: SECTION_ORDER.line },
      'Rounds every bend by this many pixels. 0 gives sharp bends. A straight line has no bends to round: add a point with the + on the line and drag it. Bends next to a short segment round less, as a curve never reaches past the middle of a segment.'
    ),
    createLineEndField('startX', 'Start X', 10, "Horizontal position of the line's first point, in pixels from the left edge of the canvas."),
    createLineEndField('startY', 'Start Y', 20, "Vertical position of the line's first point, in pixels from the top edge of the canvas."),
    createLineEndField('endX', 'End X', 30, "Horizontal position of the line's last point, in pixels from the left edge of the canvas."),
    createLineEndField('endY', 'End Y', 40, "Vertical position of the line's last point, in pixels from the top edge of the canvas."),
  ];
}

/** Freeform (closed) polygon fields. Open polygons are lines: see createLineDescriptors. */
export function createPolygonDescriptors(): InspectorFieldDescriptor[] {
  return [
    createGradientFillDescriptor(),
    createGradientAngleDescriptor(),
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
    // Settings only polygons have get a section of their own that starts open,
    // like N-gon's Sides, rather than rows in Geometry, which starts closed.
    createCurveRadiusField(
      { key: 'polygon', label: 'Polygon', order: SECTION_ORDER.polygon },
      'Rounds every corner by this many pixels. 0 gives sharp corners. Corners next to a short side round less, as a curve never reaches past the middle of a side.'
    ),
    createCustomField({
      // Like rotating, mirroring rewrites the vertices, so it is a one-click
      // action with no state: a saved "mirrored" flag would stop meaning
      // anything after the next rotate or vertex edit. The gradient flips with
      // the shape, so the result is a true mirror image.
      buildChange: ({ item }) =>
        item.kind === 'polygon'
          ? {
              vertices: mirrorPolygonVerticesHorizontally(item.vertices),
              gradientAngle: mirrorGradientAngleHorizontally(item.gradientAngle),
            }
          : {},
      fieldOrder: 20,
      getValue: () => null,
      label: 'Mirror',
      propertyKey: 'mirror',
      render: renderMirrorActionField,
      sectionKey: 'polygon',
      sectionLabel: 'Polygon',
      sectionOrder: SECTION_ORDER.polygon,
      tooltip: 'Flip the polygon left to right in place, gradient and all. Click again to flip it back.',
      valueType: 'custom',
    }),
  ];
}

export function createShapeDescriptors(
  itemKind: 'ellipse' | 'ngon' | 'rectangle'
): InspectorFieldDescriptor[] {
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
  ];

  descriptors.unshift(createGradientFillDescriptor(), createGradientAngleDescriptor());
  descriptors.push(
    createPositionXField(),
    createPositionYField(),
    createDimensionsField(),
    createRotationField()
  );

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
