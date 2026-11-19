import type { ProjectDocument } from '../../document/documentTypes';
import { getBundledFontUrl, listRegisteredFonts } from '../../fonts/browserFontLoader';
import { defaultUploadedFontPersistenceService } from '../../persistence/uploadedFontPersistenceService';
import { createCanvasTextMeasurer } from './canvasTextMeasurer';
import { createDocumentFontLoader, createFallbackFontLoader, type FontByteLoaders } from './documentFontBytes';
import { createGeneratorRasterizer } from './generatorRasterizer';
import { exportToSvg, type ExportToSvgDeps } from './exportToSvg';
import type { SvgExportResult } from './svgExportTypes';

/**
 * Production SVG export entry point: assembles the real browser deps (the fonts
 * registered with the browser, bundled-font fetch, uploaded-font IndexedDB load,
 * canvas measurement, generator rasterization) and runs the serializer. Returns
 * the SVG and any block+warn warnings.
 */
export function runSvgExport(doc: ProjectDocument): Promise<SvgExportResult> {
  return exportToSvg(doc, {
    ...browserFontDeps(doc.fonts),
    measurer: createCanvasTextMeasurer(),
    rasterizer: createGeneratorRasterizer(),
  });
}

/**
 * How font files are found and read in the browser, for `exportToSvg` and
 * `resolveFontOutlines`: `fonts` are the document's font references, which say
 * which families have a file at all.
 */
export function browserFontDeps(
  fonts: ProjectDocument['fonts'],
): Pick<ExportToSvgDeps, 'loadFontBytes' | 'loadFallbackFontBytes'> {
  const registeredFonts = listRegisteredFonts();
  const loaders: FontByteLoaders = {
    loadBundledBytes: async (sourceName) => {
      const url = getBundledFontUrl(sourceName);
      if (!url) return null;
      const response = await fetch(url);
      return response.ok ? await response.arrayBuffer() : null;
    },
    loadUploadedBytes: async (ref) => {
      const [record] = await defaultUploadedFontPersistenceService.loadByReferences([ref]);
      return record?.bytes ?? null;
    },
  };

  return {
    loadFontBytes: createDocumentFontLoader({ fonts }, registeredFonts, loaders),
    loadFallbackFontBytes: createFallbackFontLoader(registeredFonts, loaders),
  };
}
