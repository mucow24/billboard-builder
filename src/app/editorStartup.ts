import { collectLeafItems } from '../editor/document/sceneGraph';
import type {
  DocumentFontReference,
  ProjectDocument,
  UploadedFont,
} from '../editor/document/documentTypes';
import type { FontLoad, FontLoadOptions } from '../editor/fonts';

export interface EditorStartupDeps {
  /** Reads the autosaved canvas; null when there is none. */
  loadSavedCanvas: () => Promise<ProjectDocument | null>;
  loadBundledFonts: (options: FontLoadOptions) => FontLoad;
  /** Registers the stored uploaded fonts behind these references. */
  restoreUploadedFonts: (references: DocumentFontReference[]) => Promise<unknown>;
  registerAvailableFont: (font: UploadedFont) => void;
  loadDocument: (document: ProjectDocument) => void;
  /** The saved canvas, if any, is in the editor: it can be shown, edited and autosaved. */
  onCanvasReady: () => void;
  /** Every bundled font has been registered or has failed to load. */
  onFontsReady: () => void;
  /** True once this run has been abandoned; it then leaves the editor alone. */
  isCancelled: () => boolean;
}

/** The font families the text of a document is set in. */
function collectTextFontFamilies(document: ProjectDocument): string[] {
  return [
    ...new Set(
      document.nodes
        .flatMap(collectLeafItems)
        .flatMap((item) => (item.kind === 'text' ? [item.fontFamily] : [])),
    ),
  ];
}

/**
 * Brings the editor up, in an order that never puts the user's work at risk.
 *
 * 1. Read the saved canvas.
 * 2. Register the fonts it is drawn with: the bundled files of its text's
 *    families, loaded before any other bundled font, and its uploaded fonts from
 *    storage. Text drawn before its font is registered keeps its fallback look,
 *    so the canvas waits for these, and only for these.
 * 3. Put the saved canvas in the editor and report `onCanvasReady`. The editor
 *    must not be usable before this: the saved canvas would replace whatever had
 *    been done, and autosaving any earlier would overwrite the saved canvas.
 * 4. Load the remaining bundled fonts in the background, each family becoming
 *    available as its files arrive, and report `onFontsReady`. Only then is it
 *    known which fonts are missing.
 *
 * A step that fails is logged and skipped: the editor still starts, without
 * whatever could not be read.
 */
export async function runEditorStartup(deps: EditorStartupDeps): Promise<void> {
  let savedCanvas: ProjectDocument | null = null;
  try {
    savedCanvas = await deps.loadSavedCanvas();
  } catch (error) {
    console.warn('Starting without the saved canvas, which could not be read.', error);
  }
  if (deps.isCancelled()) {
    return;
  }

  const bundledFonts = deps.loadBundledFonts({
    first: savedCanvas ? collectTextFontFamilies(savedCanvas) : [],
    onFamilyLoaded: (fonts) => {
      if (deps.isCancelled()) {
        return;
      }
      for (const font of fonts) {
        deps.registerAvailableFont(font);
      }
    },
  });

  const uploadedFonts = savedCanvas
    ? deps.restoreUploadedFonts(savedCanvas.fonts).catch((error: unknown) => {
        console.warn('Uploaded fonts of the saved canvas could not be restored.', error);
      })
    : undefined;
  await Promise.all([bundledFonts.first, uploadedFonts]);
  if (deps.isCancelled()) {
    return;
  }

  if (savedCanvas) {
    deps.loadDocument(savedCanvas);
  }
  deps.onCanvasReady();

  await bundledFonts.all;
  if (deps.isCancelled()) {
    return;
  }
  deps.onFontsReady();
}
