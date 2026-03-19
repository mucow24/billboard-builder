import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import { SelectionInspector } from './SelectionInspector';

describe('SelectionInspector', () => {
  it('shows the empty state and uploaded font count with no selection', () => {
    render(
      <SelectionInspector
        availableFonts={[
          {
            family: 'Session Sans',
            sourceName: 'SessionSans.ttf',
            weight: '400',
            style: 'normal',
            kind: 'uploaded',
          },
        ]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItems={[]}
      />,
    );

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(screen.getByText('1 uploaded font(s) ready in this session.')).toBeInTheDocument();
  });

  it('renders multi-selection controls and marks mixed opacity values', () => {
    const onItemChange = vi.fn();
    const first = createRectangleItem({ opacity: 0.5 });
    const second = createRectangleItem({ opacity: 0.7 });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItems={[first, second]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Opacity'), {
      target: { value: '0.3' },
    });

    expect(screen.getByText('Mixed')).toBeInTheDocument();
    expect(onItemChange).toHaveBeenCalledWith({ opacity: 0.3 });
  });

  it('renders text controls, keeps session fonts available, and enforces style capability rules', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const textItem = createTextItem({
      fontFamily: 'Custom Family',
      fontStyle: 'italic',
      fontWeight: 'normal',
    });

    render(
      <SelectionInspector
        availableFonts={[
          {
            family: 'Custom Family',
            sourceName: 'CustomFamily-Regular.ttf',
            weight: '400',
            style: 'normal',
            kind: 'uploaded',
          },
          {
            family: 'Custom Family',
            sourceName: 'CustomFamily-Italic.ttf',
            weight: '400',
            style: 'italic',
            kind: 'uploaded',
          },
          {
            family: 'Custom Family',
            sourceName: 'CustomFamily-Bold.ttf',
            weight: '700',
            style: 'normal',
            kind: 'uploaded',
          },
        ]}
        fonts={[
          {
            family: 'Custom Family',
            sourceName: 'CustomFamily-Regular.ttf',
            kind: 'uploaded',
          },
        ]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={textItem}
        selectedItems={[textItem]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Font' }));
    expect(screen.getByRole('option', { name: 'Custom Family' })).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Custom Family' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeEnabled();

    await user.click(screen.getByRole('option', { name: 'Arial' }));
    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Headline' },
    });
    await user.click(screen.getByRole('button', { name: 'Align center' }));
    await user.click(screen.getByRole('button', { name: 'Align middle' }));

    expect(onItemChange).toHaveBeenCalledWith({ fontFamily: 'Arial' });
    expect(onItemChange).toHaveBeenCalledWith({ text: 'Headline' });
    expect(onItemChange).toHaveBeenCalledWith({ align: 'center' });
    expect(onItemChange).toHaveBeenCalledWith({ verticalAlign: 'middle' });
  });

  it('cycles fonts from the text inspector using sorted wraparound controls', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const textItem = createTextItem({
      fontFamily: 'Verdana',
    });

    render(
      <SelectionInspector
        availableFonts={[
          {
            family: 'Zulu Display',
            sourceName: 'ZuluDisplay.ttf',
            weight: '400',
            style: 'normal',
            kind: 'uploaded',
          },
          {
            family: 'Alpha Sans',
            sourceName: 'AlphaSans.ttf',
            weight: '400',
            style: 'normal',
            kind: 'uploaded',
          },
        ]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={textItem}
        selectedItems={[textItem]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next font' }));
    await user.click(screen.getByRole('button', { name: 'Previous font' }));

    expect(onItemChange).toHaveBeenNthCalledWith(1, { fontFamily: 'Zulu Display' });
    expect(onItemChange).toHaveBeenNthCalledWith(2, { fontFamily: 'Trebuchet MS' });
  });

  it('renders line and image controls, clamps ranges, and keeps image opacity out of geometry', async () => {
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
    const imageItem = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 20,
      originalHeight: 10,
    });
    imageItem.opacity = 0.4;

    const { rerender } = render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={lineItem}
        selectedItems={[lineItem]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Stroke width'), {
      target: { value: '0' },
    });
    await user.click(screen.getByRole('button', { name: 'Shadow' }));
    fireEvent.change(within(screen.getByRole('button', { name: 'Shadow' }).closest('section')!).getByLabelText('Opacity'), {
      target: { value: '-1' },
    });

    expect(onItemChange).toHaveBeenCalledWith({ strokeWidth: 1 });
    expect(onItemChange).toHaveBeenCalledWith({
      shadow: {
        ...lineItem.shadow,
        opacity: 0,
      },
    });

    rerender(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={imageItem}
        selectedItems={[imageItem]}
      />,
    );

    const imageSection = screen.getByRole('button', { name: 'Image' }).closest('section');
    expect(imageSection).not.toBeNull();
    fireEvent.change(within(imageSection!).getByLabelText('Opacity'), {
      target: { value: '2' },
    });
    await user.click(screen.getByRole('button', { name: /Geometry/i }));
    const geometrySection = screen.getByRole('button', { name: /Geometry/i }).closest('section');

    expect(onItemChange).toHaveBeenCalledWith({ opacity: 1 });
    expect(geometrySection).not.toBeNull();
    expect(within(geometrySection!).queryByLabelText('Opacity')).not.toBeInTheDocument();
  });

  it('supports image color adjustments, line geometry edits, and advanced text padding updates', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const imageItem = createImageItem({
      src: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      originalWidth: 20,
      originalHeight: 10,
    });
    const lineItem = createLineItem();
    const textItem = createTextItem();

    const { rerender } = render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={imageItem}
        selectedItems={[imageItem]}
      />,
    );

    await user.click(screen.getByLabelText('Preserve aspect ratio'));
    fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), {
      target: { value: '98' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Contrast' }), {
      target: { value: '49' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Tint strength' }), {
      target: { value: '60' },
    });

    expect(onItemChange).toHaveBeenCalledWith({ preserveAspectRatio: false });
    expect(onItemChange).toHaveBeenCalledWith({
      adjustments: { ...imageItem.adjustments, brightness: 100 },
    });
    expect(onItemChange).toHaveBeenCalledWith({
      adjustments: { ...imageItem.adjustments, contrast: 50 },
    });
    expect(onItemChange).toHaveBeenCalledWith({
      adjustments: { ...imageItem.adjustments, tintStrength: 60 },
    });

    rerender(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={lineItem}
        selectedItems={[lineItem]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Geometry/i }));
    fireEvent.change(screen.getByLabelText('End X'), {
      target: { value: '900' },
    });
    expect(onItemChange).toHaveBeenCalledWith({ endX: 900 });

    rerender(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={textItem}
        selectedItems={[textItem]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Advanced text' }));
    fireEvent.change(screen.getByLabelText('Padding top'), {
      target: { value: '-12' },
    });
    fireEvent.change(screen.getByLabelText('Padding left'), {
      target: { value: '24' },
    });

    expect(onItemChange).toHaveBeenCalledWith({
      padding: { top: -12, right: 0, bottom: 0, left: 0 },
    });
    expect(onItemChange).toHaveBeenCalledWith({
      padding: { top: 0, right: 0, bottom: 0, left: 24 },
    });
  });
});
