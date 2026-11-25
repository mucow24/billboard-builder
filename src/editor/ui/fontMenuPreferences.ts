import { z } from 'zod';

export const FONT_MENU_PREFERENCES_STORAGE_KEY = 'billboard-builder:font-menu-prefs:v1';

const preferencesSchema = z.object({
  version: z.literal(1),
  /** The ids of the sections of the font menu that are closed. */
  collapsedSections: z.array(z.string()),
});

/** The sections of the font menu the user has closed. Storage that cannot be read counts as none. */
export function loadCollapsedFontMenuSections(): string[] {
  try {
    const raw = window.localStorage.getItem(FONT_MENU_PREFERENCES_STORAGE_KEY);
    return raw ? preferencesSchema.parse(JSON.parse(raw)).collapsedSections : [];
  } catch {
    return [];
  }
}

export function saveCollapsedFontMenuSections(collapsedSections: readonly string[]): void {
  try {
    window.localStorage.setItem(
      FONT_MENU_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, collapsedSections }),
    );
  } catch {
    // Without storage the sections are as they were left only until the page is closed.
  }
}
