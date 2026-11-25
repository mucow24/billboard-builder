import { describe, expect, it } from 'vitest';

import { groupFontOptions } from './fontFamilyGroups';
import {
  buildFontMenuSections,
  fontMenuEntryFamilies,
  fontMenuEntryName,
} from './fontMenuSections';

const ENTRIES = groupFontOptions(
  ['Arial', 'Barlow', 'Barlow Black', 'Barlow Light', 'Georgia', 'Verdana'].map((family) => ({
    family,
  })),
);

function namesOf(indexes: number[]) {
  return indexes.map((index) => fontMenuEntryName(ENTRIES[index]));
}

describe('fontMenuSections', () => {
  it('names a row after its family or its font, and lists the fonts it stands for', () => {
    expect(ENTRIES.map(fontMenuEntryName)).toEqual(['Arial', 'Barlow', 'Georgia', 'Verdana']);
    expect(fontMenuEntryFamilies(ENTRIES[0])).toEqual(['Arial']);
    expect(fontMenuEntryFamilies(ENTRIES[1])).toEqual(['Barlow Light', 'Barlow', 'Barlow Black']);
  });

  it('repeats the rows of the canvas and the favorites above the full list', () => {
    const sections = buildFontMenuSections(ENTRIES, {
      canvasFamilies: ['Verdana', 'Barlow Black'],
      favoriteNames: ['Georgia', 'Barlow'],
    });

    expect(sections.map((section) => section.title)).toEqual([
      'In this canvas',
      'Favorites',
      'All fonts',
    ]);
    // A family is in the canvas when any of its weights is, and each section keeps list order.
    expect(namesOf(sections[0].entryIndexes)).toEqual(['Barlow', 'Verdana']);
    expect(namesOf(sections[1].entryIndexes)).toEqual(['Barlow', 'Georgia']);
    expect(namesOf(sections[2].entryIndexes)).toEqual(['Arial', 'Barlow', 'Georgia', 'Verdana']);
  });

  it('keeps a section that has no rows, and ignores names that match no row', () => {
    const sections = buildFontMenuSections(ENTRIES, {
      canvasFamilies: [],
      favoriteNames: ['Gone Font', 'Barlow Light'],
    });

    expect(sections.map((section) => [section.id, section.entryIndexes.length])).toEqual([
      ['canvas', 0],
      ['favorites', 0],
      ['all', 4],
    ]);
  });

  it('leaves out the sections it has no source for', () => {
    const sections = buildFontMenuSections(ENTRIES, { canvasFamilies: null, favoriteNames: null });

    expect(sections.map((section) => section.id)).toEqual(['all']);
  });
});
