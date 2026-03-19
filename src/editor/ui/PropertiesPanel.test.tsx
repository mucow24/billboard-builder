import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertiesPanel } from './PropertiesPanel';
import {
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';
import { flattenLayerRows } from '../document/sceneGraph';

describe('PropertiesPanel', () => {
  it('shows the missing font warning and shell tabs', async () => {
    const user = userEvent.setup();
    const item = createRectangleItem();

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[item]}
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={['Ghost Sans']}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText('Ghost Sans')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    expect(screen.getByRole('button', { name: 'Canvas background' })).toBeInTheDocument();
  });

  it('routes a layer double-click back to the properties tab', async () => {
    const user = userEvent.setup();
    const item = createTextItem({ zIndex: 1 });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[item]}
        layerRows={flattenLayerRows([item])}
        missingFontFamilies={[]}
        selectedItem={item}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Text' }));

    expect(screen.getByRole('tab', { name: /Properties/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('passes the properties tab through to the selection inspector', () => {
    render(
      <PropertiesPanel
        availableFonts={[
          {
            family: 'Session Sans',
            sourceName: 'SessionSans.ttf',
            weight: '400',
            style: 'normal',
            kind: 'uploaded',
          },
        ]}
        background="#ffffff00"
        fonts={[]}
        items={[]}
        layerRows={[]}
        missingFontFamilies={[]}
        onBackgroundChange={vi.fn()}
        onGroupOpacityChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectNode={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(screen.getByText('1 uploaded font(s) ready in this session.')).toBeInTheDocument();
  });
});
