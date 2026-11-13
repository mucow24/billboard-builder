import { parseProjectDocument, serializeProjectDocument } from '../document/documentSchema';
import type { ProjectDocument } from '../document/documentTypes';
import {
  createDefaultRawCanvasStore,
  type RawCanvasStore,
} from './indexedDbCanvasStore';

export class CanvasPersistenceService {
  private readonly store: RawCanvasStore;

  constructor(store: RawCanvasStore = createDefaultRawCanvasStore()) {
    this.store = store;
  }

  async load(): Promise<ProjectDocument | null> {
    const serializedDocument = await this.store.read();
    if (!serializedDocument) {
      return null;
    }

    try {
      return parseProjectDocument(JSON.parse(serializedDocument));
    } catch {
      await this.store.clear();
      return null;
    }
  }

  /** The id of the library document the saved canvas is a working copy of, if recorded. */
  async loadDocumentId(): Promise<string | null> {
    return this.store.readDocumentId();
  }

  async save(document: ProjectDocument, documentId?: string): Promise<void> {
    await this.store.write(serializeProjectDocument(document), documentId);
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }
}

export const defaultCanvasPersistenceService = new CanvasPersistenceService();
