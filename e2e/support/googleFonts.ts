import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Page, Route } from '@playwright/test';

/**
 * A family of the stand-in Google Fonts: its styles by Google's key
 * ("regular", "italic", "300", "700italic"), each with the bundled font file
 * that is served as that style.
 */
export interface GoogleFontFixture {
  family: string;
  category: string;
  files: Record<string, string>;
}

export interface GoogleFontsMock {
  /** Every request the page made to a Google host, in order. */
  requests: string[];
}

const CORS_HEADERS = { 'access-control-allow-origin': '*' };

function slug(family: string) {
  return family.toLowerCase().replace(/\s+/g, '');
}

/** "regular", "italic", "300", "300italic" for an italic flag and a weight. */
function styleKey(italic: boolean, weight: number) {
  if (weight === 400) {
    return italic ? 'italic' : 'regular';
  }
  return `${weight}${italic ? 'italic' : ''}`;
}

/**
 * Stands in for Google Fonts: answers every request the "Import font from
 * Google…" dialog makes, so no spec depends on the network or on an API key.
 *
 * - the Developer API (`www.googleapis.com/webfonts`): the list of `families`,
 *   and the files of one of them;
 * - the stylesheet service (`fonts.googleapis.com/css2`): a face for each style
 *   asked for;
 * - the font server (`fonts.gstatic.com`): the bundled file that stands in for
 *   the style.
 *
 * Call it before the page makes its first request. A request to any of the
 * three hosts that it has no answer for fails with 404.
 */
export async function mockGoogleFonts(
  page: Page,
  families: GoogleFontFixture[],
): Promise<GoogleFontsMock> {
  const requests: string[] = [];
  const bySlug = new Map(families.map((family) => [slug(family.family), family]));

  async function fulfillFont(route: Route, family: GoogleFontFixture | undefined, key: string) {
    const fileName = family?.files[key];
    if (!fileName) {
      await route.fulfill({ status: 404, headers: CORS_HEADERS, body: 'No such font file.' });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      contentType: 'font/ttf',
      body: await fs.readFile(path.join(process.cwd(), 'src/assets/fonts', fileName)),
    });
  }

  await page.route('https://www.googleapis.com/webfonts/v1/webfonts**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    const familyName = url.searchParams.get('family');
    if (familyName === null) {
      await route.fulfill({
        status: 200,
        headers: CORS_HEADERS,
        json: {
          items: families.map((family) => ({
            family: family.family,
            category: family.category,
            variants: Object.keys(family.files),
          })),
        },
      });
      return;
    }
    const family = bySlug.get(slug(familyName));
    if (!family) {
      await route.fulfill({ status: 404, headers: CORS_HEADERS, json: { error: { code: 404 } } });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      json: {
        items: [
          {
            family: family.family,
            files: Object.fromEntries(
              Object.keys(family.files).map((key) => [
                key,
                `https://fonts.gstatic.com/s/${slug(family.family)}/v1/${key}.ttf`,
              ]),
            ),
          },
        ],
      },
    });
  });

  await page.route('https://fonts.googleapis.com/css2**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    // family=Name:ital,wght@0,400;1,700
    const [familyName, styles = ''] = (url.searchParams.get('family') ?? '').split(':ital,wght@');
    const family = bySlug.get(slug(familyName));
    const faces = styles
      .split(';')
      .map((style) => style.split(',').map(Number))
      .filter(([italic, weight]) => family?.files[styleKey(italic === 1, weight)]);
    if (!family || faces.length === 0) {
      await route.fulfill({ status: 400, headers: CORS_HEADERS, body: 'No such family.' });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      contentType: 'text/css',
      body: faces
        .map(
          ([italic, weight]) => `@font-face {
  font-family: '${family.family}';
  font-style: ${italic === 1 ? 'italic' : 'normal'};
  font-weight: ${weight};
  src: url(https://fonts.gstatic.com/l/font?kit=${slug(family.family)}.${styleKey(italic === 1, weight)}) format('truetype');
}`,
        )
        .join('\n'),
    });
  });

  await page.route('https://fonts.gstatic.com/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    // A preview face: /l/font?kit=<family>.<style>
    const [kitFamily, kitStyle] = (url.searchParams.get('kit') ?? '').split('.');
    if (kitFamily && kitStyle) {
      await fulfillFont(route, bySlug.get(kitFamily), kitStyle);
      return;
    }
    // A whole file: /s/<family>/v1/<style>.ttf
    const [, , fileFamily, , fileName = ''] = url.pathname.split('/');
    await fulfillFont(route, bySlug.get(fileFamily), fileName.replace(/\.ttf$/, ''));
  });

  return { requests };
}
