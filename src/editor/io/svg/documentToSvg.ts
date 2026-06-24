import type { CanvasItem, ProjectDocument } from '../../document/documentTypes';
import { flattenVisibleLeafNodes, type FlattenedLeafNode } from '../../document/sceneGraph';
import { isFullyTransparent, paintAttrs } from './svgColor';
import {
  ellipseShape,
  generatorImage,
  gradientOrSolidFill,
  imageShape,
  itemFilterDef,
  lineShape,
  ngonShape,
  rectShape,
  wrapItem,
} from './svgPrimitives';
import { textSvg } from './svgText';
import { fmt } from './svgEscape';
import type { SvgExportDeps, SvgExportResult, SvgExportWarning } from './svgExportTypes';

/**
 * Pure, synchronous SVG serializer. Walks the document's visible leaves
 * (hidden subtrees skipped, group opacity already composed by
 * `flattenVisibleLeafNodes`) and emits a standalone SVG string plus a list of
 * warnings for content that could not be vectorized.
 *
 * Browser-specific work (glyph outlines, text measurement, generator
 * rasterization) is supplied through `deps`; see `svgExportTypes.ts`.
 */
export function documentToSvg(doc: ProjectDocument, deps: SvgExportDeps): SvgExportResult {
  const { width, height } = doc.canvas;
  const warnings: SvgExportWarning[] = [];
  const defs: string[] = [];
  const body: string[] = [];

  if (!isFullyTransparent(doc.background)) {
    body.push(
      `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" ${paintAttrs('fill', doc.background)}/>`,
    );
  }

  // Document order is back-to-front, which matches SVG paint order (later = on top).
  for (const leaf of flattenVisibleLeafNodes(doc.nodes)) {
    body.push(serializeLeaf(leaf, deps, defs, warnings));
  }

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" ` +
    `viewBox="0 0 ${fmt(width)} ${fmt(height)}">${defsBlock}${body.join('')}</svg>`;

  return { svg, warnings };
}

// Returns the SVG markup for one leaf, pushing gradient/filter <defs> and
// warnings as needed. Text outlines and generator rasters are added in later steps.
function serializeLeaf(
  leaf: FlattenedLeafNode,
  deps: SvgExportDeps,
  defs: string[],
  warnings: SvgExportWarning[],
): string {
  const { item, effectiveOpacity } = leaf;

  // Text and generators build their own filters/markup; everything else shares
  // the container filter computed here.
  if (item.kind === 'text') {
    return textSvg(item, effectiveOpacity, deps, defs, warnings);
  }

  const filterAttr = pushItemFilter(item, defs);
  switch (item.kind) {
    case 'line':
      return lineShape(item, effectiveOpacity, filterAttr);
    case 'rectangle':
      return wrapItem(
        item,
        effectiveOpacity,
        rectShape(item, gradientOrSolidFill(item, defs, item.width, item.height)),
        filterAttr,
      );
    case 'ellipse':
      return wrapItem(
        item,
        effectiveOpacity,
        ellipseShape(item, gradientOrSolidFill(item, defs, item.width, item.height)),
        filterAttr,
      );
    case 'ngon':
      return wrapItem(
        item,
        effectiveOpacity,
        ngonShape(item, gradientOrSolidFill(item, defs, item.width, item.height)),
        filterAttr,
      );
    case 'image':
      return wrapItem(item, effectiveOpacity, imageShape(item), filterAttr);
    case 'generator': {
      const dataUrl = deps.rasterizer.rasterizeGenerator(item, item.width, item.height);
      return wrapItem(item, effectiveOpacity, generatorImage(item, dataUrl), filterAttr);
    }
    default:
      return '';
  }
}

/** Push the item's blur/shadow filter into <defs>, returning a `filter="url(#id)"` attribute (or ''). */
function pushItemFilter(item: CanvasItem, defs: string[]): string {
  const id = `fx-${item.id}`;
  const def = itemFilterDef(id, item);
  if (!def) return '';
  defs.push(def);
  return ` filter="url(#${id})"`;
}
