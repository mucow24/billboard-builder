import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useEditorStore } from '../../../state/store';
import { createDefaultEditorState } from '../../../core/editorState';
import { NumberInput } from './NumberControls';

describe('NumberInput slider variant', () => {
  beforeEach(() => {
    // Reset the editor store between tests so interactionSnapshot starts null.
    useEditorStore.setState({ editor: createDefaultEditorState() });
  });

  it('brackets a slider drag with beginInteraction and commitInteraction', () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        label="Stroke width"
        min={0}
        max={10}
        step={1}
        slider
        value={3}
        onChange={onChange}
      />,
    );

    const slider = screen.getByLabelText('Stroke width') as HTMLInputElement;
    expect(useEditorStore.getState().editor.interactionSnapshot).toBeNull();

    // Drag begins.
    fireEvent.pointerDown(slider);
    expect(useEditorStore.getState().editor.interactionSnapshot).not.toBeNull();

    // Intermediate change fires during the drag.
    fireEvent.change(slider, { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);

    // Drag ends — interaction committed.
    fireEvent.pointerUp(slider);
    expect(useEditorStore.getState().editor.interactionSnapshot).toBeNull();
  });

  it('commits the interaction on pointer cancel', () => {
    render(
      <NumberInput label="Opacity" min={0} max={1} step={0.01} slider value={0.5} onChange={vi.fn()} />,
    );

    const slider = screen.getByLabelText('Opacity') as HTMLInputElement;
    fireEvent.pointerDown(slider);
    expect(useEditorStore.getState().editor.interactionSnapshot).not.toBeNull();

    fireEvent.pointerCancel(slider);
    expect(useEditorStore.getState().editor.interactionSnapshot).toBeNull();
  });

  it('commits the interaction if the component unmounts mid-drag', () => {
    const { unmount } = render(
      <NumberInput label="Opacity" min={0} max={1} step={0.01} slider value={0.5} onChange={vi.fn()} />,
    );

    fireEvent.pointerDown(screen.getByLabelText('Opacity'));
    expect(useEditorStore.getState().editor.interactionSnapshot).not.toBeNull();

    unmount();
    expect(useEditorStore.getState().editor.interactionSnapshot).toBeNull();
  });

  it('does not touch interactionSnapshot for non-slider usage', () => {
    render(<NumberInput label="Count" value={5} onChange={vi.fn()} />);
    expect(useEditorStore.getState().editor.interactionSnapshot).toBeNull();
    // Typing in the text input does not emit pointer events on a range input.
    const input = screen.getByLabelText('Count') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.blur(input);
    expect(useEditorStore.getState().editor.interactionSnapshot).toBeNull();
  });
});
