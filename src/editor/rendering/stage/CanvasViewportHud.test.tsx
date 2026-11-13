import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CanvasViewportHud } from './CanvasViewportHud';
import { parseZoomPercentInput } from './viewportMath';

function renderHud(zoom = 0.5) {
  const onSetZoom = vi.fn();
  render(
    <CanvasViewportHud
      canvasHeight={1080}
      canvasWidth={1920}
      guidesCount={0}
      onFitCanvas={vi.fn()}
      onSetZoom={onSetZoom}
      zoom={zoom}
      zoomStep={0.1}
    />,
  );
  return { onSetZoom };
}

describe('parseZoomPercentInput', () => {
  it.each([
    ['150', 1.5],
    ['150%', 1.5],
    ['  37.5 % ', 0.375],
    ['.5', 0.005],
    ['100.', 1],
  ])('reads %j as zoom %d', (text, expected) => {
    expect(parseZoomPercentInput(text)).toBeCloseTo(expected, 10);
  });

  it.each(['', '   ', '%', 'abc', '0', '0%', '-50', '1e3', '12px', '1,5', '50%%'])(
    'rejects %j',
    (text) => {
      expect(parseZoomPercentInput(text)).toBeNull();
    },
  );
});

describe('CanvasViewportHud zoom readout', () => {
  it('opens an input holding the current percentage, selected, when clicked', async () => {
    const user = userEvent.setup();
    renderHud(0.5);

    await user.click(screen.getByTestId('viewport-zoom'));

    const input = screen.getByTestId('viewport-zoom-input');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('50');
    expect(input).toHaveAccessibleName('Zoom:');
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(2);
  });

  it('applies the typed percentage on Enter and returns focus to the readout', async () => {
    const user = userEvent.setup();
    const { onSetZoom } = renderHud(0.5);

    await user.click(screen.getByTestId('viewport-zoom'));
    await user.keyboard('250%{Enter}');

    expect(onSetZoom).toHaveBeenCalledTimes(1);
    expect(onSetZoom).toHaveBeenCalledWith(2.5);
    expect(screen.queryByTestId('viewport-zoom-input')).toBeNull();
    expect(screen.getByTestId('viewport-zoom')).toHaveFocus();
  });

  it('applies the typed percentage when the input loses focus', async () => {
    const user = userEvent.setup();
    const { onSetZoom } = renderHud(0.5);

    await user.click(screen.getByTestId('viewport-zoom'));
    await user.keyboard('75');
    await user.click(screen.getByTestId('canvas-size'));

    expect(onSetZoom).toHaveBeenCalledTimes(1);
    expect(onSetZoom).toHaveBeenCalledWith(0.75);
    expect(screen.queryByTestId('viewport-zoom-input')).toBeNull();
  });

  it('keeps the zoom when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { onSetZoom } = renderHud(0.5);

    await user.click(screen.getByTestId('viewport-zoom'));
    await user.keyboard('300{Escape}');

    expect(onSetZoom).not.toHaveBeenCalled();
    expect(screen.queryByTestId('viewport-zoom-input')).toBeNull();
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 50%');
    expect(screen.getByTestId('viewport-zoom')).toHaveFocus();
  });

  it('keeps the zoom when the text is not a positive number', async () => {
    const user = userEvent.setup();
    const { onSetZoom } = renderHud(0.5);

    await user.click(screen.getByTestId('viewport-zoom'));
    await user.keyboard('abc{Enter}');

    expect(onSetZoom).not.toHaveBeenCalled();
    expect(screen.getByTestId('viewport-zoom')).toHaveTextContent('Zoom: 50%');
  });
});
