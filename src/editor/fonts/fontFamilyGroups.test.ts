import { describe, expect, it } from 'vitest';

import { groupFontOptions, splitFontFamilyVariant } from './fontFamilyGroups';

function options(...families: string[]) {
  return families.map((family) => ({ family }));
}

/** The menu's rows as text: a font by its name, a family as "Name > Member, Member". */
function describeEntries(families: string[]) {
  return groupFontOptions(options(...families)).map((entry) =>
    entry.kind === 'font'
      ? entry.option.family
      : `${entry.label} > ${entry.members.map((member) => member.label).join(', ')}`,
  );
}

describe('splitFontFamilyVariant', () => {
  it('leaves a name without a weight word whole', () => {
    expect(splitFontFamilyVariant('Playfair Display')).toEqual({
      base: 'Playfair Display',
      variant: null,
      weight: 400,
    });
  });

  it('takes the weight word off the end, however it is spaced or cased', () => {
    expect(splitFontFamilyVariant('Barlow Extra Light')).toEqual({
      base: 'Barlow',
      variant: 'Extra Light',
      weight: 200,
    });
    expect(splitFontFamilyVariant('Roboto ExtraLight')).toMatchObject({
      base: 'Roboto',
      variant: 'ExtraLight',
      weight: 200,
    });
    expect(splitFontFamilyVariant('Barlow Extrabold')).toMatchObject({
      base: 'Barlow',
      variant: 'Extrabold',
      weight: 800,
    });
    expect(splitFontFamilyVariant('Playfair Display SC Black')).toMatchObject({
      base: 'Playfair Display SC',
      variant: 'Black',
      weight: 900,
    });
  });

  it('only reads a weight word that is the last word of the name', () => {
    expect(splitFontFamilyVariant('Black Ops One').variant).toBeNull();
    expect(splitFontFamilyVariant('Zilla Slab Highlight').variant).toBeNull();
    expect(splitFontFamilyVariant('Light').variant).toBeNull();
    expect(splitFontFamilyVariant('Barlow Condensed').variant).toBeNull();
  });

  it('treats bold as a weight of its own, apart from the other bold words', () => {
    expect(splitFontFamilyVariant('Example Bold')).toEqual({
      base: 'Example',
      variant: 'Bold',
      weight: 700,
    });
    expect(splitFontFamilyVariant('Example Semi Bold')).toEqual({
      base: 'Example',
      variant: 'Semi Bold',
      weight: 600,
    });
    expect(splitFontFamilyVariant('Example ExtraBold').weight).toBe(800);
    expect(splitFontFamilyVariant('Boldonse').variant).toBeNull();
  });
});

describe('groupFontOptions', () => {
  it('leaves fonts without relatives as rows of their own, in list order', () => {
    expect(describeEntries(['Arial', 'Georgia', 'Verdana'])).toEqual([
      'Arial',
      'Georgia',
      'Verdana',
    ]);
  });

  it('gathers the weights of a family under one row, lightest first', () => {
    expect(
      describeEntries([
        'Arial',
        'Barlow',
        'Barlow Black',
        'Barlow Extra Light',
        'Barlow Extrabold',
        'Barlow Light',
        'Barlow Medium',
        'Barlow Semibold',
        'Barlow Thin',
        'Georgia',
      ]),
    ).toEqual([
      'Arial',
      'Barlow > Thin, Extra Light, Light, Regular, Medium, Semibold, Extrabold, Black',
      'Georgia',
    ]);
  });

  it('lists Bold among the weights, at 700', () => {
    expect(
      describeEntries(['Barlow', 'Barlow Black', 'Barlow Bold', 'Barlow Extrabold', 'Barlow Semibold']),
    ).toEqual(['Barlow > Regular, Semibold, Bold, Extrabold, Black']);
  });

  it('makes a family of weights without a regular one, named after them', () => {
    expect(describeEntries(['Super16Bit Bold'])).toEqual(['Super16Bit Bold']);
    expect(describeEntries(['Sulphur Bold', 'Sulphur Light'])).toEqual(['Sulphur > Light, Bold']);
  });

  it('puts the family row where its first font stood, and keeps the fonts between its members', () => {
    expect(
      describeEntries(['Barlow', 'Barlow Condensed', 'Barlow Light', 'Bungee']),
    ).toEqual(['Barlow > Light, Regular', 'Barlow Condensed', 'Bungee']);
  });

  it('keeps each member pointing at its place in the flat list', () => {
    const [entry] = groupFontOptions(options('Codystar', 'Codystar Light'));

    expect(entry).toEqual({
      kind: 'family',
      label: 'Codystar',
      members: [
        { option: { family: 'Codystar Light' }, index: 1, label: 'Light' },
        { option: { family: 'Codystar' }, index: 0, label: 'Regular' },
      ],
    });
  });

  it('does not make a family of a single weight', () => {
    expect(describeEntries(['Bungee Hairline', 'Bungee Inline'])).toEqual([
      'Bungee Hairline',
      'Bungee Inline',
    ]);
  });

  it('does not make a family of one name listed twice', () => {
    expect(describeEntries(['Barlow', 'Barlow'])).toEqual(['Barlow', 'Barlow']);
  });

  it('names a family without a regular weight after what its members share', () => {
    expect(describeEntries(['Buda Light', 'Buda Medium'])).toEqual(['Buda > Light, Medium']);
  });

  it('matches the names of one family without regard to case', () => {
    expect(describeEntries(['barlow', 'Barlow Thin'])).toEqual(['barlow > Thin, Regular']);
  });
});
