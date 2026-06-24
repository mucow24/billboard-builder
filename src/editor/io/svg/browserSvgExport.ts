import type { ProjectDocument } from '../../document/documentTypes';
import { getBundledFontUrl } from '../../fonts/browserFontLoader';
import { defaultUploadedFontPersistenceService } from '../../persistence/uploadedFontPersistenceService';
import { createCanvasTextMeasurer } from './canvasTextMeasurer';
import { createDocumentFontLoader } from './documentFontBytes';
import { createGeneratorRasterizer } from './generatorRasterizer';
import { exportToSvg } from './exportToSvg';
import type { SvgExportResult } from './svgExportTypes';

/**
 * Production SVG export entry point: assembles the real browser deps (bundled-font
 * fetch, uploaded-font IndexedDB load, canvas measurement, generator rasterization)
 * and runs the serializer. Returns the SVG and any block+warn warnings.
 */
export function runSvgExport(doc: ProjectDocument): Promise<SvgExportResult> {
  const loadFontBytes = createDocumentFontLoader(doc, {
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
  });

  return exportToSvg(doc, {
    loadFontBytes,
    measurer: createCanvasTextMeasurer(),
    rasterizer: createGeneratorRasterizer(),
  });
}
