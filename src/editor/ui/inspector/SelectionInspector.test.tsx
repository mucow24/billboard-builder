import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createImageItem,
  createLineItem,
  createPolygonItem,
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

  it('renders text fields from descriptors and offers bold and italic whatever files the family has', async () => {
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
    expect(screen.getByRole('button', { name: 'Font' })).toHaveTextContent('Custom Family');
    expect(screen.getByRole('button', { name: 'Previous font' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next font' })).toBeInTheDocument();
    // The family has no bold italic file: the browser fakes the bold.
    expect(screen.getByLabelText('Bold')).toBeEnabled();
    expect(screen.getByLabelText('Italic')).toBeEnabled();
    expect(screen.getByLabelText('Size').closest('.inspector-field-inline')).not.toBeNull();
    expect(screen.getByLabelText('Text content').closest('.inspector-field-stacked')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Headline' },
    });
    await user.click(screen.getByRole('button', { name: 'Font' }));
    expect(screen.getByRole('option', { name: 'Arial' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Arial' }));
    fireEvent.change(screen.getByLabelText('Size'), {
      target: { value: '1' },
    });
    fireEvent.blur(screen.getByLabelText('Size'));
    await user.click(screen.getByLabelText('Align center'));
    await user.click(screen.getByLabelText('Align middle'));

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

  it('cycles fonts from the descriptor-driven text inspector with wraparound controls', async () => {
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
        selectedNodeCount={1}
        selectedItems={[textItem]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Next font' }));
    await user.click(screen.getByRole('button', { name: 'Previous font' }));

    expect(onItemChange).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(onItemChange.mock.calls[0]?.[0](textItem)).toEqual({
      fontFamily: 'Zulu Display',
    });
    expect(onItemChange.mock.calls[1]?.[0](textItem)).toEqual({
      fontFamily: 'Trebuchet MS',
    });
  });

  it('collapses and re-expands section bodies without removing them from the DOM', async () => {
    const user = userEvent.setup();
    const rectangleItem = createRectangleItem({
      x: 120,
      y: 160,
      width: 180,
      height: 110,
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItem={rectangleItem}
        selectedNodeCount={1}
        selectedItems={[rectangleItem]}
      />
    );

    const geometryToggle = screen.getByRole('button', { name: 'Geometry' });
    const xField = screen.getByRole('spinbutton', { hidden: true, name: 'X' });

    expect(geometryToggle).toHaveAttribute('aria-expanded', 'false');
    expect(xField).not.toBeVisible();

    await user.click(geometryToggle);
    expect(geometryToggle).toHaveAttribute('aria-expanded', 'true');
    expect(xField).toBeVisible();

    await user.click(geometryToggle);
    expect(geometryToggle).toHaveAttribute('aria-expanded', 'false');
    expect(xField).not.toBeVisible();
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

    fireEvent.change(screen.getByLabelText('Width'), {
      target: { value: '0' },
    });
    fireEvent.blur(screen.getByLabelText('Width'));
    await user.click(screen.getByRole('button', { name: 'Shadow' }));
    fireEvent.change(screen.getByLabelText('Blur Radius'), {
      target: { value: '12' },
    });
    fireEvent.blur(screen.getByLabelText('Blur Radius'));

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
    fireEvent.blur(screen.getByLabelText('Brightness'));
    fireEvent.click(screen.getByLabelText('Preserve aspect ratio'));
    await user.click(screen.getByRole('button', { name: 'Mirror' }));

    expect(onItemChange.mock.calls.at(-4)?.[0](imageItem)).toEqual({
      adjustments: {
        ...imageItem.adjustments,
        tintColor: '#ff0000ff',
      },
    });
    expect(onItemChange.mock.calls.at(-3)?.[0](imageItem)).toEqual({
      adjustments: {
        ...imageItem.adjustments,
        brightness: 100,
      },
    });
    expect(onItemChange.mock.calls.at(-2)?.[0](imageItem)).toEqual({
      preserveAspectRatio: false,
    });
    expect(onItemChange.mock.calls.at(-1)?.[0](imageItem)).toEqual({
      mirrorHorizontal: true,
    });
  });

  it('shows gradient fill widget with both color pickers, swap, and toggle buttons', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const rectangleItem = createRectangleItem({
      fill: '#123456ff',
      secondaryFill: '#abcdef12',
      gradientEnabled: true,
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={rectangleItem}
        selectedNodeCount={1}
        selectedItems={[rectangleItem]}
      />
    );

    expect(screen.getByLabelText('Fill')).toBeEnabled();
    expect(screen.getByLabelText('Secondary fill')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Swap fill colors' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Toggle gradient' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Secondary fill' }));
    fireEvent.change(screen.getByLabelText('Secondary fill hex'), {
      target: { value: '#fedcba98' },
    });
    fireEvent.keyDown(screen.getByLabelText('Secondary fill hex'), {
      key: 'Enter',
    });

    expect(expectLatestChange(onItemChange, rectangleItem)).toEqual({
      secondaryFill: '#fedcba98',
    });
  });

  it('toggles gradient on via toggle button', () => {
    const onItemChange = vi.fn();
    const rectangleItem = createRectangleItem({
      fill: '#ff0000ff',
      secondaryFill: '#0000ffff',
      gradientEnabled: false,
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={rectangleItem}
        selectedNodeCount={1}
        selectedItems={[rectangleItem]}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: 'Toggle gradient' });
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggleBtn);

    expect(expectLatestChange(onItemChange, rectangleItem)).toEqual({
      gradientEnabled: true,
    });
  });

  it('shows only shared fields for multi-selection and marks mixed states across control types', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const first = createTextItem({
      fill: '#ff0000',
      fontFamily: 'Arial',
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
      fontFamily: 'Verdana',
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
    expect(screen.getByLabelText('Bold')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Font' })).toHaveTextContent('Mixed fonts');
    expect(screen.getAllByText('Mixed').length).toBeGreaterThan(0);
    // Text has an outline, so two texts share the Stroke section.
    expect(screen.getByRole('button', { name: 'Stroke' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Shared headline' },
    });
    await user.click(screen.getByLabelText('Bold'));
    await user.click(screen.getByLabelText('Align center'));
    await user.click(screen.getByLabelText('Fill'));
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
    const rectangle = createRectangleItem({ fill: '#ff0000', secondaryFill: '#112233', gradientEnabled: true });
    const text = createTextItem({ fill: '#00ff00', secondaryFill: '#112233', gradientEnabled: true });

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

    expect(screen.getByText('Fill', { selector: '.property-block-toggle span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Geometry' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fill')).toBeInTheDocument();
    expect(screen.getByLabelText('Secondary fill')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle gradient' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Geometry' }));
    expect(screen.getByLabelText('X')).toBeInTheDocument();
    // A rectangle's border and a text's outline are the same two fields.
    expect(screen.getByRole('button', { name: 'Stroke' })).toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'Hero Group' })).toBeInTheDocument();
    expect(screen.getByLabelText('Group Opacity')).toBeInTheDocument();
    expect(screen.queryByText('2 items selected')).not.toBeInTheDocument();
  });

  it('renders group heading without subtitle for default-named groups', () => {
    const child = createRectangleItem();
    const group = createGroupNode([child]);

    const { container } = render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedGroup={group}
        selectedNodeCount={1}
        selectedItems={[child]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Group' })).toBeInTheDocument();
    expect(container.querySelector('.slim-item-subtitle')).toBeNull();
  });

  it('renders single rectangle heading without subtitle', () => {
    const rect = createRectangleItem();

    const { container } = render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItem={rect}
        selectedNodeCount={1}
        selectedItems={[rect]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Rectangle' })).toBeInTheDocument();
    expect(container.querySelector('.slim-item-subtitle')).toBeNull();
  });

  it('renders single text heading without subtitle', () => {
    const text = createTextItem();

    const { container } = render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItem={text}
        selectedNodeCount={1}
        selectedItems={[text]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Text' })).toBeInTheDocument();
    expect(container.querySelector('.slim-item-subtitle')).toBeNull();
  });

  it('renders the gradient fill widget with all controls in a single field', () => {
    const rectangleItem = createRectangleItem({
      fill: '#ff0000ff',
      secondaryFill: '#0000ffff',
      gradientEnabled: true,
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItem={rectangleItem}
        selectedNodeCount={1}
        selectedItems={[rectangleItem]}
      />
    );

    const fillToggle = screen.getByRole('button', { name: 'Fill', expanded: true });
    const fillSection = fillToggle.closest('section')!;
    const widget = fillSection.querySelector('.gradient-fill-widget');
    expect(widget).toBeInTheDocument();

    // All controls live inside the single widget
    expect(screen.getByLabelText('Fill')).toBeInTheDocument();
    expect(screen.getByLabelText('Secondary fill')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Swap fill colors' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle gradient' })).toBeInTheDocument();
  });

  it('swaps fill and secondary fill colors when the swap button is clicked', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const rectangleItem = createRectangleItem({
      fill: '#ff0000ff',
      secondaryFill: '#0000ffff',
      gradientEnabled: true,
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={rectangleItem}
        selectedNodeCount={1}
        selectedItems={[rectangleItem]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Swap fill colors' }));

    expect(expectLatestChange(onItemChange, rectangleItem)).toEqual({
      fill: '#0000ffff',
      secondaryFill: '#ff0000ff',
    });
  });

  it('disables the swap and secondary fill controls while the fill is solid', () => {
    const rectangleItem = createRectangleItem({
      fill: '#ff0000ff',
      secondaryFill: '#0000ffff',
      gradientEnabled: false,
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItem={rectangleItem}
        selectedNodeCount={1}
        selectedItems={[rectangleItem]}
      />
    );

    expect(screen.getByRole('button', { name: 'Swap fill colors' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Secondary fill' })).toBeDisabled();
    // The section heading and the main color swatch are both named Fill.
    for (const fillButton of screen.getAllByRole('button', { name: 'Fill' })) {
      expect(fillButton).toBeEnabled();
    }
    expect(screen.getByRole('button', { name: 'Toggle gradient' })).toBeEnabled();
  });

  it('keeps the swap and secondary fill controls usable for a gradient and for a mixed selection', () => {
    const gradientItem = createRectangleItem({ gradientEnabled: true });
    const solidItem = createRectangleItem({ gradientEnabled: false });

    const { rerender } = render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItem={gradientItem}
        selectedNodeCount={1}
        selectedItems={[gradientItem]}
      />
    );

    expect(screen.getByRole('button', { name: 'Swap fill colors' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Secondary fill' })).toBeEnabled();

    rerender(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedNodeCount={2}
        selectedItems={[gradientItem, solidItem]}
      />
    );

    expect(screen.getByRole('button', { name: 'Swap fill colors' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Secondary fill' })).toBeEnabled();
  });

  it('explains a property when the pointer rests on its label', () => {
    const textItem = createTextItem();

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={vi.fn()}
        selectedItem={textItem}
        selectedNodeCount={1}
        selectedItems={[textItem]}
      />
    );

    expect(screen.getByText('Size:')).toHaveAttribute('title', 'Font size in pixels.');
    // computeGradientEndpoints: 0 runs top to bottom, 90 left to right.
    expect(screen.getByText('Gradient angle:')).toHaveAttribute(
      'title',
      expect.stringContaining('0 runs top to bottom and 90 left to right'),
    );
    expect(screen.getByText('W:')).toHaveAttribute('title', 'Width in pixels.');
  });

  it('opens the Polygon section from the start, with a Mirror button that flips the polygon on each click', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const polygonItem = createPolygonItem({
      vertices: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 0, y: 80 },
      ],
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={polygonItem}
        selectedNodeCount={1}
        selectedItems={[polygonItem]}
      />
    );

    expect(screen.getByRole('button', { name: 'Polygon' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('slider', { name: 'Curve radius' })).toBeVisible();
    expect(screen.getByText('Curve radius:')).toHaveAttribute(
      'title',
      expect.stringContaining('pixels'),
    );
    expect(screen.getByText('Mirror:')).toHaveAttribute(
      'title',
      expect.stringContaining('left to right'),
    );

    // An action, not a toggle: there is no pressed state to report.
    const mirrorButton = screen.getByRole('button', { name: 'Mirror' });
    expect(mirrorButton).not.toHaveAttribute('aria-pressed');

    await user.click(mirrorButton);
    expect(expectLatestChange(onItemChange, polygonItem)).toMatchObject({
      vertices: [
        { x: 50, y: 0 },
        { x: 0, y: 0 },
        { x: 50, y: 80 },
      ],
    });
  });

  describe('Reset crop', () => {
    function createTestImage(name: string) {
      return createImageItem({
        name,
        src: 'data:image/png;base64,AAA',
        mimeType: 'image/png',
        originalWidth: 160,
        originalHeight: 90,
        x: 30,
        y: 20,
      });
    }

    function createCroppedImage(name: string) {
      return {
        ...createTestImage(name),
        width: 80,
        height: 45,
        sourceTransform: { x: -20, y: -10, width: 160, height: 90, rotation: 0 },
      };
    }

    function renderImageInspector(
      selectedItems: CanvasItem[],
      onItemChange = vi.fn(),
    ) {
      render(
        <SelectionInspector
          availableFonts={[]}
          fonts={[]}
          onGroupOpacityChange={vi.fn()}
          onItemChange={onItemChange}
          selectedItem={selectedItems.length === 1 ? selectedItems[0] : undefined}
          selectedNodeCount={selectedItems.length}
          selectedItems={selectedItems}
        />
      );
      return onItemChange;
    }

    it('sits last in the Image section, right below Tint strength', () => {
      renderImageInspector([createTestImage('Photo')]);

      const imageSection = document.querySelector('[data-section="image"]');
      const fields = Array.from(imageSection?.children ?? []);
      expect(fields.at(-2)).toHaveTextContent('Tint strength');
      expect(fields.at(-1)).toContainElement(screen.getByRole('button', { name: 'Reset crop' }));
    });

    it('is disabled while the image is not cropped', () => {
      renderImageInspector([createTestImage('Photo')]);

      expect(screen.getByRole('button', { name: 'Reset crop' })).toBeDisabled();
    });

    it('shows the whole image in its box again when clicked', async () => {
      const user = userEvent.setup();
      const croppedImage = createCroppedImage('Photo');
      const onItemChange = renderImageInspector([croppedImage]);

      const resetButton = screen.getByRole('button', { name: 'Reset crop' });
      expect(resetButton).toBeEnabled();
      expect(resetButton).toHaveAttribute('title', expect.stringContaining('whole image'));

      await user.click(resetButton);
      expect(onItemChange).toHaveBeenCalledTimes(1);
      // Panned and zoomed, not cut: the box keeps its size.
      expect(expectLatestChange(onItemChange, croppedImage)).toEqual({
        width: 80,
        height: 45,
        crop: { x: 0, y: 0, width: 160, height: 90 },
        sourceTransform: { x: 0, y: 0, width: 80, height: 45, rotation: 0 },
      });
    });

    it('resets only the cropped images of a selection', async () => {
      const user = userEvent.setup();
      const croppedImage = createCroppedImage('Cropped');
      const uncroppedImage = createTestImage('Uncropped');
      const onItemChange = renderImageInspector([croppedImage, uncroppedImage]);

      await user.click(screen.getByRole('button', { name: 'Reset crop' }));
      expect(expectLatestChange(onItemChange, croppedImage)).toMatchObject({
        sourceTransform: { x: 0, y: 0, width: 80, height: 45, rotation: 0 },
      });
      expect(expectLatestChange(onItemChange, uncroppedImage)).toEqual({});
    });

    it('is disabled for a selection of uncropped images', () => {
      renderImageInspector([createTestImage('One'), createTestImage('Two')]);

      expect(screen.getByRole('button', { name: 'Reset crop' })).toBeDisabled();
    });
  });

  it('swaps fill colors for text items', async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const textItem = createTextItem({
      fill: '#aabbccff',
      secondaryFill: '#ddeeffff',
      gradientEnabled: true,
    });

    render(
      <SelectionInspector
        availableFonts={[]}
        fonts={[]}
        onGroupOpacityChange={vi.fn()}
        onItemChange={onItemChange}
        selectedItem={textItem}
        selectedNodeCount={1}
        selectedItems={[textItem]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Swap fill colors' }));

    expect(expectLatestChange(onItemChange, textItem)).toEqual({
      fill: '#ddeeffff',
      secondaryFill: '#aabbccff',
    });
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

  describe('selection lock button', () => {
    const inspectorProps = {
      availableFonts: [] as [],
      fonts: [] as [],
      onGroupOpacityChange: vi.fn(),
      onItemChange: vi.fn(),
    };

    it('locks an unlocked item from the item header', async () => {
      const user = userEvent.setup();
      const onSelectionLockedChange = vi.fn();
      const item = createRectangleItem();

      render(
        <SelectionInspector
          {...inspectorProps}
          onSelectionLockedChange={onSelectionLockedChange}
          selectedItem={item}
          selectedNodeCount={1}
          selectedItems={[item]}
          selectionLockState="unlocked"
        />
      );

      const button = screen.getByRole('button', { name: 'Lock selection' });
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(button.closest('.slim-item-header')).not.toBeNull();

      await user.click(button);

      expect(onSelectionLockedChange).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('unlocks a locked group from the group header', async () => {
      const user = userEvent.setup();
      const onSelectionLockedChange = vi.fn();
      const child = createRectangleItem();
      const group = { ...createGroupNode([child], 'Hero Group'), locked: true };

      render(
        <SelectionInspector
          {...inspectorProps}
          onSelectionLockedChange={onSelectionLockedChange}
          selectedGroup={group}
          selectedNodeCount={1}
          selectedItems={[child]}
          selectionLockState="locked"
        />
      );

      const button = screen.getByRole('button', { name: 'Unlock selection' });
      expect(button).toHaveAttribute('aria-pressed', 'true');

      await user.click(button);

      expect(onSelectionLockedChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('shows a partly locked multi-selection as mixed and locks it on click', async () => {
      const user = userEvent.setup();
      const onSelectionLockedChange = vi.fn();
      const first = createRectangleItem({ locked: true });
      const second = createRectangleItem();

      render(
        <SelectionInspector
          {...inspectorProps}
          onSelectionLockedChange={onSelectionLockedChange}
          selectedItem={first}
          selectedNodeCount={2}
          selectedItems={[first, second]}
          selectionLockState="mixed"
        />
      );

      const button = screen.getByRole('button', { name: 'Lock selection' });
      expect(button).toHaveAttribute('aria-pressed', 'mixed');
      expect(button).toHaveAttribute('title', 'Partly locked: click to lock everything');

      await user.click(button);

      expect(onSelectionLockedChange).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('is absent with nothing selected', () => {
      render(
        <SelectionInspector
          {...inspectorProps}
          onSelectionLockedChange={vi.fn()}
          selectedNodeCount={0}
          selectedItems={[]}
          selectionLockState={null}
        />
      );

      expect(screen.queryByRole('button', { name: /lock selection/i })).not.toBeInTheDocument();
    });
  });
});
