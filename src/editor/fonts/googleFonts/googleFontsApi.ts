/**
 * The Google Fonts Developer API: which families there are, and where the font
 * file of each style of a family is.
 *
 * The API needs a key, which this site gets at build time from
 * `VITE_GOOGLE_FONTS_API_KEY`. The key is public by nature (it is in the page's
 * own scripts); what protects it is its restriction, in the Google Cloud
 * console, to this site's addresses and to this one API. A build without a key
 * has no Google import.
 */
import { z } from 'zod';

import {
  parseGoogleFontVariant,
  sortGoogleFontVariants,
  type GoogleFontVariant,
} from './googleFontVariants';

const WEBFONTS_ENDPOINT = 'https://www.googleapis.com/webfonts/v1/webfonts';
/** Where Google serves font files from. No file is fetched from anywhere else. */
const FONT_FILE_ORIGIN = 'https://fonts.gstatic.com';

export interface GoogleFontFamily {
  family: string;
  /** "sans-serif", "serif", "display", "handwriting" or "monospace". */
  category: string;
  /** The family's styles, lightest first. */
  variants: GoogleFontVariant[];
}

const catalogSchema = z.object({
  items: z.array(
    z.object({
      family: z.string().min(1),
      category: z.string().optional(),
      variants: z.array(z.string()),
    }),
  ),
});

const filesSchema = z.object({
  items: z.array(
    z.object({
      family: z.string(),
      files: z.record(z.string(), z.string()),
    }),
  ),
});

/** The key this build was given for the Google Fonts API, or null when it has none. */
export function getGoogleFontsApiKey(): string | null {
  const key: unknown = import.meta.env.VITE_GOOGLE_FONTS_API_KEY;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
}

async function requestWebfonts(
  apiKey: string,
  parameters: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const query = new URLSearchParams({ key: apiKey, prettyPrint: 'false', ...parameters });
  const response = await fetch(`${WEBFONTS_ENDPOINT}?${query}`, { signal });
  if (!response.ok) {
    throw new Error(`Google Fonts answered with an error (${response.status}).`);
  }
  return response.json();
}

/**
 * Every family Google Fonts has, the most used first. A family with no style
 * the editor can read is left out.
 */
export async function fetchGoogleFontCatalog(
  apiKey: string,
  signal?: AbortSignal,
): Promise<GoogleFontFamily[]> {
  const body = await requestWebfonts(
    apiKey,
    { sort: 'popularity', fields: 'items(family,category,variants)' },
    signal,
  );
  const result = catalogSchema.safeParse(body);
  if (!result.success) {
    throw new Error('Google Fonts sent a list of fonts that could not be read.');
  }
  return result.data.items.flatMap((item) => {
    const variants = sortGoogleFontVariants(
      item.variants.flatMap((key) => parseGoogleFontVariant(key) ?? []),
    );
    return variants.length > 0
      ? [{ family: item.family, category: item.category ?? '', variants }]
      : [];
  });
}

let catalogRequest: { apiKey: string; families: Promise<GoogleFontFamily[]> } | null = null;

/**
 * `fetchGoogleFontCatalog`, asked once per page load: later calls get the same
 * list. A request that failed is forgotten, so the next call tries again.
 */
export function loadGoogleFontCatalog(apiKey: string): Promise<GoogleFontFamily[]> {
  if (catalogRequest?.apiKey === apiKey) {
    return catalogRequest.families;
  }
  const request = { apiKey, families: fetchGoogleFontCatalog(apiKey) };
  catalogRequest = request;
  request.families.catch(() => {
    if (catalogRequest === request) {
      catalogRequest = null;
    }
  });
  return request.families;
}

/** For tests: forget the list `loadGoogleFontCatalog` has. */
export function resetGoogleFontCatalog(): void {
  catalogRequest = null;
}

/**
 * The address of the font file of each style of `family`, by style key. The
 * files are complete TrueType fonts, one per style. Asked when a family is
 * imported and not kept, as the addresses change with each new version of a
 * family.
 */
export async function fetchGoogleFontFiles(
  apiKey: string,
  family: string,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const body = await requestWebfonts(apiKey, { family, fields: 'items(family,files)' }, signal);
  const result = filesSchema.safeParse(body);
  const item = result.success
    ? result.data.items.find((entry) => entry.family === family)
    : undefined;
  if (!item) {
    throw new Error(`Google Fonts has no files for ${family}.`);
  }
  const files = new Map<string, string>();
  for (const [key, address] of Object.entries(item.files)) {
    // The API has answered with http addresses in the past; the page can only fetch https.
    const secureAddress = address.replace(/^http:\/\//, 'https://');
    if (secureAddress.startsWith(`${FONT_FILE_ORIGIN}/`)) {
      files.set(key, secureAddress);
    }
  }
  return files;
}
