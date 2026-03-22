import { z } from 'zod';

import { parseCanvasNodes } from '../document/documentSchema';
import type { CanvasNode, DocumentFontReference } from '../document/documentTypes';

export interface StoredFavorite {
  createdAt: string;
  fonts: DocumentFontReference[];
  id: string;
  name: string;
  nodes: CanvasNode[];
  updatedAt: string;
}

export interface RawFavoriteLibraryStore {
  clear: () => void;
  read: () => string | null;
  write: (value: string) => void;
}

interface RawLegacyFavoriteLibraryStore {
  clear: () => void;
  read: () => string | null;
}

const STORAGE_KEY = 'billboard-builder:favorites:v1';
const LEGACY_STORAGE_KEY = 'billboard-builder:templates:v1';

const fontReferenceSchema = z.object({
  family: z.string(),
  sourceName: z.string(),
  kind: z.enum(['system', 'bundled', 'uploaded']),
});

const storedFavoriteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodes: z.unknown(),
  fonts: z.array(fontReferenceSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const storedFavoriteLibrarySchema = z.object({
  version: z.literal(1),
  favorites: z.array(storedFavoriteSchema),
});

const legacyStoredFavoriteLibrarySchema = z.object({
  version: z.literal(1),
  templates: z.array(storedFavoriteSchema),
});

function normalizeStoredFavorite(input: z.infer<typeof storedFavoriteSchema>): StoredFavorite {
  return {
    id: input.id,
    name: input.name,
    nodes: parseCanvasNodes(input.nodes),
    fonts: input.fonts,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function serializeStoredFavorite(favorite: StoredFavorite) {
  return {
    id: favorite.id,
    name: favorite.name,
    nodes: favorite.nodes,
    fonts: favorite.fonts,
    createdAt: favorite.createdAt,
    updatedAt: favorite.updatedAt,
  };
}

export function createDefaultRawFavoriteLibraryStore(): RawFavoriteLibraryStore {
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

function createDefaultRawLegacyFavoriteLibraryStore(): RawLegacyFavoriteLibraryStore {
  return {
    clear: () => {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    },
    read: () => window.localStorage.getItem(LEGACY_STORAGE_KEY),
  };
}

export class FavoriteLibraryService {
  private readonly store: RawFavoriteLibraryStore;
  private readonly legacyStore: RawLegacyFavoriteLibraryStore;

  constructor(
    store: RawFavoriteLibraryStore = createDefaultRawFavoriteLibraryStore(),
    legacyStore: RawLegacyFavoriteLibraryStore = createDefaultRawLegacyFavoriteLibraryStore(),
  ) {
    this.store = store;
    this.legacyStore = legacyStore;
  }

  load(): StoredFavorite[] {
    const serializedFavorites = this.store.read();
    if (serializedFavorites) {
      try {
        const parsed = storedFavoriteLibrarySchema.parse(JSON.parse(serializedFavorites));
        return parsed.favorites.map(normalizeStoredFavorite);
      } catch {
        this.store.clear();
        return [];
      }
    }

    const serializedLegacyFavorites = this.legacyStore.read();
    if (!serializedLegacyFavorites) {
      return [];
    }

    try {
      const parsed = legacyStoredFavoriteLibrarySchema.parse(JSON.parse(serializedLegacyFavorites));
      const favorites = parsed.templates.map(normalizeStoredFavorite);
      try {
        this.save(favorites);
      } catch {
        return favorites;
      }
      this.legacyStore.clear();
      return favorites;
    } catch {
      this.legacyStore.clear();
      return [];
    }
  }

  save(favorites: readonly StoredFavorite[]): void {
    this.store.write(
      JSON.stringify({
        version: 1,
        favorites: favorites.map(serializeStoredFavorite),
      }),
    );
  }

  clear(): void {
    this.store.clear();
  }
}

export const defaultFavoriteLibraryService = new FavoriteLibraryService();
