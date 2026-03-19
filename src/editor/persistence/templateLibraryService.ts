import { z } from 'zod';

import { parseCanvasNodes } from '../document/documentSchema';
import type { CanvasNode, DocumentFontReference } from '../document/documentTypes';

export interface StoredTemplate {
  createdAt: string;
  fonts: DocumentFontReference[];
  id: string;
  name: string;
  nodes: CanvasNode[];
  updatedAt: string;
}

export interface RawTemplateLibraryStore {
  clear: () => void;
  read: () => string | null;
  write: (value: string) => void;
}

const STORAGE_KEY = 'billboard-builder:templates:v1';

const fontReferenceSchema = z.object({
  family: z.string(),
  sourceName: z.string(),
  kind: z.enum(['system', 'bundled', 'uploaded']),
});

const storedTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodes: z.unknown(),
  fonts: z.array(fontReferenceSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const storedTemplateLibrarySchema = z.object({
  version: z.literal(1),
  templates: z.array(storedTemplateSchema),
});

function normalizeStoredTemplate(input: z.infer<typeof storedTemplateSchema>): StoredTemplate {
  return {
    id: input.id,
    name: input.name,
    nodes: parseCanvasNodes(input.nodes),
    fonts: input.fonts,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function serializeStoredTemplate(template: StoredTemplate) {
  return {
    id: template.id,
    name: template.name,
    nodes: template.nodes,
    fonts: template.fonts,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function createDefaultRawTemplateLibraryStore(): RawTemplateLibraryStore {
  return {
    clear: () => {
      window.localStorage.removeItem(STORAGE_KEY);
    },
    read: () => window.localStorage.getItem(STORAGE_KEY),
    write: (value) => {
      window.localStorage.setItem(STORAGE_KEY, value);
    },
  };
}

export class TemplateLibraryService {
  private readonly store: RawTemplateLibraryStore;

  constructor(store: RawTemplateLibraryStore = createDefaultRawTemplateLibraryStore()) {
    this.store = store;
  }

  load(): StoredTemplate[] {
    const serializedTemplates = this.store.read();
    if (!serializedTemplates) {
      return [];
    }

    try {
      const parsed = storedTemplateLibrarySchema.parse(JSON.parse(serializedTemplates));
      return parsed.templates.map(normalizeStoredTemplate);
    } catch {
      this.store.clear();
      return [];
    }
  }

  save(templates: readonly StoredTemplate[]): void {
    this.store.write(
      JSON.stringify({
        version: 1,
        templates: templates.map(serializeStoredTemplate),
      }),
    );
  }

  clear(): void {
    this.store.clear();
  }
}

export const defaultTemplateLibraryService = new TemplateLibraryService();
