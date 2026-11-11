import path from 'node:path';

import { expect, type Page } from '@playwright/test';

/** The path of a bundled font file in the repository. */
export function bundledFontPath(fontFile: string): string {
  return path.join(process.cwd(), 'src/assets/fonts', fontFile);
}

/** Matches the request for a bundled font file, with or without the build's content hash. */
export function fontRequestPattern(fontFile: string): RegExp {
  const { name, ext } = path.parse(fontFile);
  const urlName = encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`/${urlName}(-[\\w-]+)?\\${ext}$`);
}

/** Whether the browser has a loaded face for the family, which is what canvas text needs to be drawn with it. */
export function hasFontFamily(page: Page, family: string): Promise<boolean> {
  return page.evaluate(
    (wanted) =>
      [...document.fonts].some(
        // Chrome reports a family with spaces in quotes.
        (face) => face.family.replace(/^["']|["']$/g, '') === wanted && face.status === 'loaded',
      ),
    family,
  );
}

export async function waitForFontFamily(page: Page, family: string) {
  await expect
    .poll(() => hasFontFamily(page, family), {
      message: `waiting for the font family "${family}" to be registered with the browser`,
      timeout: 30_000,
    })
    .toBe(true);
}
