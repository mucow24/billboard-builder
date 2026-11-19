import { describe, expect, it } from 'vitest';

import { createRectangleItem, createTextItem } from '../document/documentDefaults';

import { buildTextStyleToggleCommands } from './textStyleToggle';

describe('buildTextStyleToggleCommands', () => {
  it('turns bold on for plain text and off for bold text', () => {
    const plain = createTextItem({ id: 'plain', fontWeight: 'normal' });
    const bold = createTextItem({ id: 'bold', fontWeight: 'bold' });

    expect(buildTextStyleToggleCommands([plain], 'bold')).toEqual([
      { type: 'update_node', itemId: 'plain', changes: { fontWeight: 'bold' } },
    ]);
    expect(buildTextStyleToggleCommands([bold], 'bold')).toEqual([
      { type: 'update_node', itemId: 'bold', changes: { fontWeight: 'normal' } },
    ]);
  });

  it('turns italic on for upright text and off for italic text', () => {
    const upright = createTextItem({ id: 'upright', fontStyle: 'normal' });
    const italic = createTextItem({ id: 'italic', fontStyle: 'italic' });

    expect(buildTextStyleToggleCommands([upright], 'italic')).toEqual([
      { type: 'update_node', itemId: 'upright', changes: { fontStyle: 'italic' } },
    ]);
    expect(buildTextStyleToggleCommands([italic], 'italic')).toEqual([
      { type: 'update_node', itemId: 'italic', changes: { fontStyle: 'normal' } },
    ]);
  });

  it('turns a partly bold selection fully bold, touching only the items that change', () => {
    const plain = createTextItem({ id: 'plain', fontWeight: 'normal' });
    const bold = createTextItem({ id: 'bold', fontWeight: 'bold' });

    expect(buildTextStyleToggleCommands([bold, plain], 'bold')).toEqual([
      { type: 'update_node', itemId: 'plain', changes: { fontWeight: 'bold' } },
    ]);
  });

  it('turns bold off only when every text item is bold', () => {
    const first = createTextItem({ id: 'first', fontWeight: 'bold' });
    const second = createTextItem({ id: 'second', fontWeight: 'bold' });

    expect(buildTextStyleToggleCommands([first, second], 'bold')).toEqual([
      { type: 'update_node', itemId: 'first', changes: { fontWeight: 'normal' } },
      { type: 'update_node', itemId: 'second', changes: { fontWeight: 'normal' } },
    ]);
  });

  it('leaves the other style alone', () => {
    const boldItalic = createTextItem({ id: 'both', fontWeight: 'bold', fontStyle: 'italic' });

    expect(buildTextStyleToggleCommands([boldItalic], 'bold')).toEqual([
      { type: 'update_node', itemId: 'both', changes: { fontWeight: 'normal' } },
    ]);
  });

  it('skips other kinds and decides from the text items alone', () => {
    const shape = createRectangleItem({ id: 'shape' });
    const bold = createTextItem({ id: 'bold', fontWeight: 'bold' });

    expect(buildTextStyleToggleCommands([shape, bold], 'bold')).toEqual([
      { type: 'update_node', itemId: 'bold', changes: { fontWeight: 'normal' } },
    ]);
  });

  it('returns no commands without text items', () => {
    expect(buildTextStyleToggleCommands([], 'bold')).toEqual([]);
    expect(buildTextStyleToggleCommands([createRectangleItem()], 'italic')).toEqual([]);
  });
});
