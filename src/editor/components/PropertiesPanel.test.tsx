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
        availableFonts={[
          { family: 'Session Sans', sourceName: 'SessionSans.ttf' },
        ]}
        background="#ffffff00"
        fonts={[]}
        items={[]}
        missingFontFamilies={[]}
        onBackgroundChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectItem={vi.fn()}
      />,
    );

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(
      screen.getByText('1 uploaded font(s) ready in this session.'),
    ).toBeInTheDocument();
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
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectItem={onSelectItem}
      />,
    );

    expect(screen.getByText('Ghost Sans')).toBeInTheDocument();

    const layerRows = screen.getAllByRole('button', { name: /^(Rectangle|Text)$/i });
    expect(layerRows[0]).toHaveTextContent('Text');
    expect(layerRows[1]).toHaveTextContent('Rectangle');

    await user.click(layerRows[0]);
    expect(onSelectItem).toHaveBeenCalledWith(frontItem.id);

    await user.click(screen.getByRole('button', { name: /Layers/i }));
    expect(screen.queryByRole('button', { name: 'Canvas background' })).not.toBeInTheDocument();
  });

  it('deduplicates font options for text items and forwards text control changes', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const onDeleteItem = vi.fn();
    const textItem = createTextItem({
      fontFamily: 'Session Sans',
    });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[
          {
            family: 'Session Sans',
            sourceName: 'SessionSans.ttf',
            kind: 'uploaded',
          },
          {
            family: 'Session Sans',
            sourceName: 'SessionSans.ttf',
            kind: 'uploaded',
          },
        ]}
        items={[textItem]}
        missingFontFamilies={[]}
        selectedItem={textItem}
        onBackgroundChange={vi.fn()}
        onDeleteItem={onDeleteItem}
        onItemChange={onItemChange}
        onSelectItem={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Font family' }));

    expect(
      screen.getAllByRole('option', { name: 'Session Sans' }),
    ).toHaveLength(1);
    expect(
      screen
        .getByRole('option', { name: 'Session Sans' })
        .getAttribute('style'),
    ).toContain('Session Sans');

    await user.click(screen.getByRole('option', { name: 'Arial' }));

    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Headline' },
    });
    await user.selectOptions(screen.getByLabelText('Text align'), 'center');
    await user.selectOptions(screen.getByLabelText('Text vertical align'), 'middle');
    await user.selectOptions(
      screen.getByLabelText('Font style'),
      'bold-italic',
    );

    expect(onItemChange).toHaveBeenCalledWith({ text: 'Headline' });
    expect(onItemChange).toHaveBeenCalledWith({ fontFamily: 'Arial' });
    expect(onItemChange).toHaveBeenCalledWith({ align: 'center' });
    expect(onItemChange).toHaveBeenCalledWith({ verticalAlign: 'middle' });
    expect(onItemChange).toHaveBeenCalledWith({
      fontWeight: 'bold',
      fontStyle: 'italic',
    });
    expect(onDeleteItem).not.toHaveBeenCalled();
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
        onDeleteItem={vi.fn()}
        onItemChange={onItemChange}
        onSelectItem={vi.fn()}
      />,
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
        onDeleteItem={vi.fn()}
        onItemChange={onItemChange}
        onSelectItem={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('Preserve aspect ratio'));
    expect(onItemChange).toHaveBeenCalledWith({ preserveAspectRatio: false });
  });

  it('wires the reusable color picker for canvas and shape colors', async () => {
    const user = userEvent.setup();
    const onBackgroundChange = vi.fn();
    const onItemChange = vi.fn();
    const rectangleItem = createRectangleItem({
      fill: '#ff000080',
      stroke: '#0000ffff',
    });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[rectangleItem]}
        missingFontFamilies={[]}
        selectedItem={rectangleItem}
        onBackgroundChange={onBackgroundChange}
        onDeleteItem={vi.fn()}
        onItemChange={onItemChange}
        onSelectItem={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Canvas background' }));
    expect(screen.getByLabelText('Canvas background hex')).toHaveValue(
      '#ffffff00',
    );

    await user.clear(screen.getByLabelText('Canvas background hex'));
    await user.type(
      screen.getByLabelText('Canvas background hex'),
      '#11223344{Enter}',
    );
    expect(onBackgroundChange).toHaveBeenCalledWith('#11223344');

    await user.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.change(screen.getByLabelText('Fill hue'), {
      target: { value: '120' },
    });
    expect(onItemChange).toHaveBeenCalledWith({ fill: '#00ff0080' });

    await user.click(screen.getByRole('button', { name: 'Stroke' }));
    expect(screen.getByLabelText('Stroke alpha')).toHaveValue('100');
  });

  it('deletes a layer from its row action without selecting it first', async () => {
    const user = userEvent.setup();
    const onDeleteItem = vi.fn();
    const backItem = createRectangleItem({ zIndex: 0 });
    const frontItem = createTextItem({ zIndex: 1 });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[backItem, frontItem]}
        missingFontFamilies={[]}
        selectedItem={frontItem}
        onBackgroundChange={vi.fn()}
        onDeleteItem={onDeleteItem}
        onItemChange={vi.fn()}
        onSelectItem={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete Rectangle' }));

    expect(onDeleteItem).toHaveBeenCalledWith(backItem.id);
  });
});
