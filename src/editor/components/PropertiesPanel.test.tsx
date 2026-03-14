import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertiesPanel } from './PropertiesPanel';
import {
  createDefaultProjectDocument,
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../model/defaults';

describe('PropertiesPanel', () => {
  it('shows the empty state and available uploaded font count without a selection', () => {
    render(
      <PropertiesPanel
        availableFonts={[{ family: 'Session Sans', sourceName: 'SessionSans.ttf' }]}
        background="#ffffff00"
        fonts={[]}
        items={[]}
        missingFontFamilies={[]}
        onBackgroundChange={vi.fn()}
        onItemChange={vi.fn()}
        onReorder={vi.fn()}
        onSelectItem={vi.fn()}
      />
    );

    expect(screen.getByText('No selection')).toBeInTheDocument();
    expect(screen.getByText('1 uploaded font(s) ready in this session.')).toBeInTheDocument();
  });

  it('renders the missing font warning and selects layers in z-index order', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    const backItem = createRectangleItem({ zIndex: 0 });
    const frontItem = createTextItem({ zIndex: 1 });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[backItem, frontItem]}
        missingFontFamilies={['Ghost Sans']}
        onBackgroundChange={vi.fn()}
        onItemChange={vi.fn()}
        onReorder={vi.fn()}
        onSelectItem={onSelectItem}
      />
    );

    expect(screen.getByText('Ghost Sans')).toBeInTheDocument();

    const layerRows = screen.getAllByRole('button', { name: /rectangle|text/i });
    expect(layerRows[0]).toHaveTextContent('Text');
    expect(layerRows[1]).toHaveTextContent('Rectangle');

    await user.click(layerRows[0]);
    expect(onSelectItem).toHaveBeenCalledWith(frontItem.id);
  });

  it('deduplicates font options for text items and forwards text control changes', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const onReorder = vi.fn();
    const textItem = createTextItem({
      fontFamily: 'Session Sans',
    });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[
          { family: 'Session Sans', sourceName: 'SessionSans.ttf', kind: 'uploaded' },
          { family: 'Session Sans', sourceName: 'SessionSans.ttf', kind: 'uploaded' },
        ]}
        items={[textItem]}
        missingFontFamilies={[]}
        selectedItem={textItem}
        onBackgroundChange={vi.fn()}
        onItemChange={onItemChange}
        onReorder={onReorder}
        onSelectItem={vi.fn()}
      />
    );

    expect(screen.getAllByRole('option', { name: 'Session Sans' })).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Headline' },
    });
    await user.selectOptions(screen.getByLabelText('Text align'), 'center');
    await user.selectOptions(screen.getByLabelText('Font style'), 'bold-italic');
    await user.click(screen.getByRole('button', { name: 'Bring front' }));

    expect(onItemChange).toHaveBeenCalledWith({ text: 'Headline' });
    expect(onItemChange).toHaveBeenCalledWith({ align: 'center' });
    expect(onItemChange).toHaveBeenCalledWith({
      fontWeight: 'bold',
      fontStyle: 'italic',
    });
    expect(onReorder).toHaveBeenCalledWith('front');
  });

  it('renders line and image specific controls', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const lineItem = createLineItem();
    const imageItem = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 20,
      originalHeight: 10,
    });
    const document = createDefaultProjectDocument();

    const { rerender } = render(
      <PropertiesPanel
        availableFonts={[]}
        background={document.background}
        fonts={[]}
        items={[lineItem]}
        missingFontFamilies={[]}
        selectedItem={lineItem}
        onBackgroundChange={vi.fn()}
        onItemChange={onItemChange}
        onReorder={vi.fn()}
        onSelectItem={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('End X'), {
      target: { value: '900' },
    });
    expect(onItemChange).toHaveBeenCalledWith({ endX: 900 });

    rerender(
      <PropertiesPanel
        availableFonts={[]}
        background={document.background}
        fonts={[]}
        items={[imageItem]}
        missingFontFamilies={[]}
        selectedItem={imageItem}
        onBackgroundChange={vi.fn()}
        onItemChange={onItemChange}
        onReorder={vi.fn()}
        onSelectItem={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText('Preserve aspect ratio'));
    expect(onItemChange).toHaveBeenCalledWith({ preserveAspectRatio: false });
  });
});
