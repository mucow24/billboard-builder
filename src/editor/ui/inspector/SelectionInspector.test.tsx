import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createImageItem,
  createLineItem,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';
import type { CanvasItem } from '../../document/documentTypes';

import { SelectionInspector } from './SelectionInspector';

function expectLatestChange(
  onItemChange: ReturnType<typeof vi.fn>,
  item: CanvasItem
) {
  const latestChange = onItemChange.mock.calls.at(-1)?.[0];
  expect(typeof latestChange).toBe('function');
  return latestChange(item);
}

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
        selectedNodeCount={0}
        selectedItems={[]}
      />
    );

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(screen.getByText('1 uploaded font(s) ready in this session.')).toBeInTheDocument();
  });

  it('renders text fields from descriptors and preserves font capability disabling', async () => {
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
        selectedNodeCount={1}
        selectedItems={[textItem]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Arial' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Custom Family')).toBeInTheDocument();
    expect(screen.getByLabelText('Bold')).toBeDisabled();
    expect(screen.getByLabelText('Italic')).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Headline' },
    });
    fireEvent.change(screen.getByLabelText('Font'), {
      target: { value: 'Arial' },
    });
    fireEvent.change(screen.getByLabelText('Size'), {
      target: { value: '1' },
    });
    await user.selectOptions(screen.getByLabelText('Align'), 'center');
    await user.selectOptions(screen.getByLabelText('Vertical align'), 'middle');

    expect(expectLatestChange(onItemChange, textItem)).toEqual({
      verticalAlign: 'middle',
    });
    expect(onItemChange).toHaveBeenCalledTimes(5);
    expect(onItemChange.mock.calls.map(([change]) => change(textItem))).toEqual(
      expect.arrayContaining([
        { text: 'Headline' },
        { fontFamily: 'Arial' },
        { fontSize: 1 },
        { align: 'center' },
        { verticalAlign: 'middle' },
      ])
    );
  });

  it('renders line and image descriptor fields and keeps nested patches per item', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const lineItem = createLineItem({
      strokeWidth: 6,
      opacity: 0.6,
      shadow: {
        color: '#000000',
        blur: 0,
        offsetX: 9,
        offsetY: 4,
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
        selectedNodeCount={1}
        selectedItems={[lineItem]}
      />
    );

    fireEvent.change(screen.getByLabelText('Stroke width'), {
      target: { value: '0' },
    });
    await user.click(screen.getByRole('button', { name: 'Shadow' }));
    fireEvent.change(screen.getByLabelText('Blur'), {
      target: { value: '12' },
    });

    expect(onItemChange.mock.calls[0]?.[0](lineItem)).toEqual({ strokeWidth: 1 });
    expect(onItemChange.mock.calls[1]?.[0](lineItem)).toEqual({
      shadow: {
        ...lineItem.shadow,
        blur: 12,
      },
    });

    rerender(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={imageItem}
        selectedNodeCount={1}
        selectedItems={[imageItem]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Tint color' }));
    fireEvent.change(screen.getByLabelText('Tint color hex'), {
      target: { value: '#ff0000ff' },
    });
    fireEvent.keyDown(screen.getByLabelText('Tint color hex'), {
      key: 'Enter',
    });
    fireEvent.change(screen.getByLabelText('Brightness'), {
      target: { value: '98' },
    });
    fireEvent.click(screen.getByLabelText('Preserve aspect ratio'));

    expect(onItemChange.mock.calls.at(-3)?.[0](imageItem)).toEqual({
      adjustments: {
        ...imageItem.adjustments,
        tintColor: '#ff0000ff',
      },
    });
    expect(onItemChange.mock.calls.at(-2)?.[0](imageItem)).toEqual({
      adjustments: {
        ...imageItem.adjustments,
        brightness: 100,
      },
    });
    expect(onItemChange.mock.calls.at(-1)?.[0](imageItem)).toEqual({
      preserveAspectRatio: false,
    });
  });

  it('shows only shared fields for multi-selection and marks mixed states across control types', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const first = createTextItem({
      fill: '#ff0000',
      text: 'First headline',
      fontWeight: 'bold',
      align: 'left',
      shadow: {
        color: '#111111',
        blur: 1,
        offsetX: 2,
        offsetY: 3,
        opacity: 0.4,
      },
    });
    const second = createTextItem({
      fill: '#00ff00',
      text: 'Second headline',
      fontWeight: 'normal',
      align: 'right',
      shadow: {
        color: '#222222',
        blur: 6,
        offsetX: 7,
        offsetY: 8,
        opacity: 0.7,
      },
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedNodeCount={2}
        selectedItems={[first, second]}
      />
    );

    expect(screen.getByRole('heading', { name: '2 items selected' })).toBeInTheDocument();
    expect(screen.getByLabelText('Text content')).toHaveValue('');
    expect(screen.getByLabelText('Bold')).not.toBeChecked();
    expect((screen.getByLabelText('Bold') as HTMLInputElement).indeterminate).toBe(true);
    expect(screen.getByLabelText('Align')).toHaveValue('');
    expect(screen.getAllByText('Mixed').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Stroke width')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Shared headline' },
    });
    await user.click(screen.getByLabelText('Bold'));
    await user.selectOptions(screen.getByLabelText('Align'), 'center');
    await user.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.change(screen.getByLabelText('Fill hex'), {
      target: { value: '#abcdef12' },
    });
    fireEvent.keyDown(screen.getByLabelText('Fill hex'), {
      key: 'Enter',
    });

    expect(onItemChange.mock.calls[0]?.[0](first)).toEqual({
      text: 'Shared headline',
    });
    expect(onItemChange.mock.calls[1]?.[0](second)).toEqual({
      fontWeight: 'bold',
    });
    expect(onItemChange.mock.calls[2]?.[0](first)).toEqual({
      align: 'center',
    });
    expect(onItemChange.mock.calls[3]?.[0](second)).toEqual({
      fill: '#abcdef12',
    });
  });

  it('shows dynamic shared fields across different item kinds', () => {
    const rectangle = createRectangleItem({ fill: '#ff0000' });
    const text = createTextItem({ fill: '#00ff00' });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedNodeCount={2}
        selectedItems={[rectangle, text]}
      />
    );

    expect(screen.getByRole('button', { name: 'Color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Geometry' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fill')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Geometry' }));
    expect(screen.getByLabelText('X')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stroke width')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Font')).not.toBeInTheDocument();
  });

  it('shows group controls for a single selected group even when it contains multiple items', () => {
    const first = createRectangleItem();
    const second = createRectangleItem();
    const group = createGroupNode([first, second], 'Hero Group');

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedGroup={group}
        selectedNodeCount={1}
        selectedItems={[first, second]}
      />
    );

    expect(screen.getByLabelText('Group Opacity')).toBeInTheDocument();
    expect(screen.queryByText('2 items selected')).not.toBeInTheDocument();
  });

  it('keeps multi-selection controls when multiple nodes are selected, even if the primary node is a group', () => {
    const first = createRectangleItem({ opacity: 0.5 });
    const second = createRectangleItem({ opacity: 0.7 });
    const group = createGroupNode([first], 'Hero Group');

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedGroup={group}
        selectedNodeCount={2}
        selectedItems={[first, second]}
      />
    );

    expect(screen.getByText('2 items selected')).toBeInTheDocument();
    expect(screen.queryByLabelText('Group Opacity')).not.toBeInTheDocument();
  });
});
