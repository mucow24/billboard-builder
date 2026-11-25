import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGoogleFontCssUrl,
  loadGoogleFontPreview,
  parseGoogleFontCss,
  releaseGoogleFontPreviews,
} from './googleFontPreview';
import { parseGoogleFontVariant, type GoogleFontVariant } from './googleFontVariants';

function variants(...keys: string[]): GoogleFontVariant[] {
  return keys.flatMap((key) => parseGoogleFontVariant(key) ?? []);
}

/** A stylesheet as the service sends it, one face per [weight, style]. */
function stylesheet(faces: Array<[weight: number, style: string, file: string]>) {
  return faces
    .map(
      ([weight, style, file]) => `@font-face {
  font-family: 'Playfair Display';
  font-style: ${style};
  font-weight: ${weight};
  src: url(https://fonts.gstatic.com/l/font?kit=${file}&v=v40) format('woff2');
  unicode-range: U+53, U+68-69;
}`,
    )
    .join('\n');
}

describe('buildGoogleFontCssUrl', () => {
  it('asks for the styles in the order the service wants, cut down to the characters of the text', () => {
    const url = buildGoogleFontCssUrl(
      'Playfair Display',
      variants('700italic', 'regular', '900', 'italic'),
      'banana',
    );

    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=Playfair%20Display:ital,wght@0,400;0,900;1,400;1,700&text=ban',
    );
  });

  it('escapes the characters of the text', () => {
    expect(buildGoogleFontCssUrl('Roboto', variants('regular'), 'a&b c')).toBe(
      'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400&text=a%26b%20c',
    );
  });
});

describe('parseGoogleFontCss', () => {
  it('reads the weight, style and file of every face', () => {
    expect(
      parseGoogleFontCss(
        stylesheet([
          [900, 'italic', 'aaa'],
          [400, 'normal', 'bbb'],
        ]),
      ),
    ).toEqual([
      { weight: 900, italic: true, source: 'https://fonts.gstatic.com/l/font?kit=aaa&v=v40' },
      { weight: 400, italic: false, source: 'https://fonts.gstatic.com/l/font?kit=bbb&v=v40' },
    ]);
  });

  it('leaves out a face whose file is not on Google’s font server', () => {
    const css = `@font-face { font-weight: 400; src: url(https://example.com/font.woff2); }`;

    expect(parseGoogleFontCss(css)).toEqual([]);
  });

  it('finds nothing in what is not a stylesheet of faces', () => {
    expect(parseGoogleFontCss('<html>Error 400</html>')).toEqual([]);
  });
});

describe('loadGoogleFontPreview', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const added: FontFace[] = [];
  const fontFaces: Array<{ family: string; source: string; descriptors: unknown }> = [];

  class RecordingFontFace {
    constructor(family: string, source: string, descriptors: unknown) {
      fontFaces.push({ family, source, descriptors });
    }

    async load() {
      return this;
    }
  }

  beforeEach(() => {
    fetchMock.mockReset();
    added.length = 0;
    fontFaces.length = 0;
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('FontFace', RecordingFontFace);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        add: (fontFace: FontFace) => added.push(fontFace),
        delete: (fontFace: FontFace) => added.splice(added.indexOf(fontFace), 1),
      },
    });
  });

  afterEach(() => {
    releaseGoogleFontPreviews();
    vi.unstubAllGlobals();
  });

  it('registers each face under the preview’s own name, with its weight and style', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        stylesheet([
          [400, 'normal', 'regular'],
          [700, 'italic', 'bolditalic'],
        ]),
      ),
    );

    const preview = await loadGoogleFontPreview({
      id: 'specimen:Playfair Display',
      family: 'Playfair Display',
      variants: variants('regular', '700italic'),
      text: 'Sphinx',
    });

    expect(preview.cssFamily).toBe('gf-preview-specimen:Playfair Display');
    expect(fontFaces).toEqual([
      {
        family: 'gf-preview-specimen:Playfair Display',
        source: 'url("https://fonts.gstatic.com/l/font?kit=regular&v=v40")',
        descriptors: { weight: '400', style: 'normal' },
      },
      {
        family: 'gf-preview-specimen:Playfair Display',
        source: 'url("https://fonts.gstatic.com/l/font?kit=bolditalic&v=v40")',
        descriptors: { weight: '700', style: 'italic' },
      },
    ]);
    expect(added).toHaveLength(2);
  });

  it('registers a face as a regular one when asked to, whatever its weight', async () => {
    fetchMock.mockResolvedValue(new Response(stylesheet([[300, 'normal', 'light']])));

    await loadGoogleFontPreview({
      id: 'name:Buda',
      family: 'Buda',
      variants: variants('300'),
      text: 'Buda',
      asRegular: true,
    });

    expect(fontFaces[0].descriptors).toEqual({});
  });

  it('loads a preview once, however often it is asked for', async () => {
    fetchMock.mockImplementation(async () => new Response(stylesheet([[400, 'normal', 'regular']])));
    const request = { id: 'name:Play', family: 'Play', variants: variants('regular'), text: 'Play' };

    const [first, second] = await Promise.all([
      loadGoogleFontPreview(request),
      loadGoogleFontPreview(request),
    ]);

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when the service has no stylesheet for the family', async () => {
    fetchMock.mockResolvedValue(new Response('Bad request', { status: 400 }));

    await expect(
      loadGoogleFontPreview({
        id: 'name:Nonesuch',
        family: 'Nonesuch',
        variants: variants('regular'),
        text: 'Nonesuch',
      }),
    ).rejects.toThrow('(400)');
    expect(added).toHaveLength(0);
  });

  it('takes every preview face off the page on release, and loads afresh after it', async () => {
    fetchMock.mockImplementation(async () => new Response(stylesheet([[400, 'normal', 'regular']])));
    const request = { id: 'name:Play', family: 'Play', variants: variants('regular'), text: 'Play' };
    await loadGoogleFontPreview(request);
    expect(added).toHaveLength(1);

    releaseGoogleFontPreviews();

    expect(added).toHaveLength(0);
    await loadGoogleFontPreview(request);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(added).toHaveLength(1);
  });

  it('does not register a preview that was released while it loaded', async () => {
    let respond: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    const preview = loadGoogleFontPreview({
      id: 'name:Play',
      family: 'Play',
      variants: variants('regular'),
      text: 'Play',
    });

    releaseGoogleFontPreviews();
    respond(new Response(stylesheet([[400, 'normal', 'regular']])));

    await expect(preview).rejects.toThrow('no longer wanted');
    expect(added).toHaveLength(0);
  });
});
