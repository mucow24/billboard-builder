import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createDefaultProjectDocument } from './editor/model/defaults';
import { useEditorStore } from './editor/state/store';

vi.mock('./editor/canvas/CanvasStage', () => ({
  CanvasStage: ({
    activeTool,
    document,
  }: {
    activeTool: string;
    document: { items: Array<{ id: string }> };
  }) => (
    <div>
      <div data-testid="mock-stage">
        Tool: {activeTool} / Items: {document.items.length}
      </div>
    </div>
  ),
}));

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({
      document: createDefaultProjectDocument(),
      activeTool: 'select',
      availableFonts: [],
      missingFontFamilies: [],
      exportScale: 2,
      historyPast: [],
      historyFuture: [],
    });
  });

  it('places a rectangle from the tool palette and returns to arrow mode', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Rect/ }));

    expect(screen.getAllByText('Rectangle')).toHaveLength(2);
    expect(screen.getByTestId('mock-stage')).toHaveTextContent('Tool: select / Items: 1');
  });

  it('starts with a transparent background and exposes alpha controls', () => {
    render(<App />);

    expect(screen.getByLabelText('Canvas background alpha')).toHaveValue('0');
  });
});
