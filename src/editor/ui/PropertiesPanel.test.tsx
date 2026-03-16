import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertiesPanel } from './PropertiesPanel';
import {
  createDefaultProjectDocument,
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../document/documentDefaults';

describe('PropertiesPanel', () => {
  it('shows the empty state and available uploaded font count without a selection', () => {
    render(
      <PropertiesPanel
        availableFonts={[
          { family: 'Session Sans', sourceName: 'SessionSans.ttf', weight: '400', style: 'normal', kind: 'uploaded' },
        ]}
        background="#ffffff00"
        fonts={[]}
        items={[]}
        missingFontFamilies={[]}
        onBackgroundChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectItem={vi.fn()}
        onReorder={vi.fn()}
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
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText('Ghost Sans')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    const layerRows = screen.getAllByRole('button', { name: /^(Rectangle|Text)$/i });
    expect(layerRows[0]).toHaveTextContent('Text');
    expect(layerRows[1]).toHaveTextContent('Rectangle');

    await user.click(layerRows[0]);
    expect(onSelectItem).toHaveBeenCalledWith(frontItem.id);

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    expect(screen.getByRole('button', { name: 'Canvas background' })).toBeInTheDocument();
  });

  it('deduplicates font options and only enables uploaded style toggles when that variant is loaded', async () => {
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
        onReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Font' }));

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
    await user.click(screen.getByRole('button', { name: 'Align center' }));
    await user.click(screen.getByRole('button', { name: 'Align middle' }));

    expect(screen.getByRole('button', { name: 'Italic' })).toBeDisabled();
    expect(onItemChange).toHaveBeenCalledWith({ text: 'Headline' });
    expect(onItemChange).toHaveBeenCalledWith({ fontFamily: 'Arial' });
    expect(onItemChange).toHaveBeenCalledWith({ align: 'center' });
    expect(onItemChange).toHaveBeenCalledWith({ verticalAlign: 'middle' });
    expect(onDeleteItem).not.toHaveBeenCalled();
  });

  it('clamps opacity and line stroke inputs before forwarding changes', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const lineItem = createLineItem({
      strokeWidth: 6,
      opacity: 0.6,
      shadow: {
        color: '#000000',
        blur: 0,
        offsetX: 0,
        offsetY: 0,
        opacity: 0.3,
      },
    });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[lineItem]}
        missingFontFamilies={[]}
        selectedItem={lineItem}
        onBackgroundChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={onItemChange}
        onSelectItem={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Stroke width'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Opacity'), {
      target: { value: '2' },
    });

    await user.click(screen.getByRole('button', { name: 'Shadow' }));
    const shadowSection = screen.getByRole('button', { name: 'Shadow' }).closest('section');
    expect(shadowSection).not.toBeNull();
    fireEvent.change(within(shadowSection!).getByLabelText('Opacity'), {
      target: { value: '-1' },
    });

    expect(onItemChange).toHaveBeenCalledWith({ strokeWidth: 1 });
    expect(onItemChange).toHaveBeenCalledWith({ opacity: 1 });
    expect(onItemChange).toHaveBeenCalledWith({
      shadow: {
        ...lineItem.shadow,
        opacity: 0,
      },
    });
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
        onReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Geometry/i }));
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
        onReorder={vi.fn()}
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
        onReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
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

    await user.click(screen.getByRole('tab', { name: /Properties/i }));
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
        onReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    await user.click(screen.getByRole('button', { name: 'Delete Rectangle' }));

    expect(onDeleteItem).toHaveBeenCalledWith(backItem.id);
  });
  it('double-clicks a layer to jump to properties and exposes reorder controls in layers', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    const onReorder = vi.fn();
    const rectangleItem = createRectangleItem({ zIndex: 0 });

    render(
      <PropertiesPanel
        availableFonts={[]}
        background="#ffffff00"
        fonts={[]}
        items={[rectangleItem]}
        missingFontFamilies={[]}
        selectedItem={rectangleItem}
        onBackgroundChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectItem={onSelectItem}
        onReorder={onReorder}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rectangle' }));
    expect(onSelectItem).toHaveBeenCalledWith(rectangleItem.id);
    expect(screen.getByRole('tab', { name: /Properties/i })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: /Layers/i }));
    await user.click(screen.getByRole('button', { name: 'Bring front' }));
    expect(onReorder).toHaveBeenCalledWith('front');
  });


  it('keeps session fonts in the picker even when the document font list is empty', async () => {
    const user = userEvent.setup();
    const textItem = createTextItem({ fontFamily: 'Session Sans' });

    render(
      <PropertiesPanel
        availableFonts={[{ family: 'Session Sans', sourceName: 'SessionSans.ttf', weight: '400', style: 'normal', kind: 'uploaded' }]}
        background="#ffffff00"
        fonts={[]}
        items={[textItem]}
        missingFontFamilies={[]}
        selectedItem={textItem}
        onBackgroundChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectItem={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Font' }));
    expect(screen.getByRole('option', { name: 'Session Sans' })).toBeInTheDocument();
  });

  it('disables unavailable bold-italic requests for uploaded fonts', () => {
    const textItem = createTextItem({
      fontFamily: 'Custom Family',
      fontStyle: 'italic',
      fontWeight: 'normal',
    });

    render(
      <PropertiesPanel
        availableFonts={[
          { family: 'Custom Family', sourceName: 'CustomFamily-Regular.ttf', weight: '400', style: 'normal', kind: 'uploaded' },
          { family: 'Custom Family', sourceName: 'CustomFamily-Italic.ttf', weight: '400', style: 'italic', kind: 'uploaded' },
          { family: 'Custom Family', sourceName: 'CustomFamily-Bold.ttf', weight: '700', style: 'normal', kind: 'uploaded' },
        ]}
        background="#ffffff00"
        fonts={[]}
        items={[textItem]}
        missingFontFamilies={[]}
        selectedItem={textItem}
        onBackgroundChange={vi.fn()}
        onDeleteItem={vi.fn()}
        onItemChange={vi.fn()}
        onSelectItem={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeEnabled();
  });

});
