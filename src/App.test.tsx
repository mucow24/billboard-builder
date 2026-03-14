import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createDefaultProjectDocument, createRectangleItem } from './editor/model/defaults';
import { serializeProjectDocument } from './editor/model/schema';
import { AUTOSAVE_KEY } from './editor/io/projectFile';
import { useEditorStore } from './editor/state/store';

vi.mock('./editor/io/fonts', async () => {
  const actual = await vi.importActual<typeof import('./editor/io/fonts')>('./editor/io/fonts');
  return {
    ...actual,
    loadBundledFonts: vi.fn().mockResolvedValue([]),
  };
});

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

function resetEditorStore() {
  useEditorStore.setState({
    document: createDefaultProjectDocument(),
    activeTool: 'select',
    availableFonts: [],
    missingFontFamilies: [],
    exportScale: 2,
    historyPast: [],
    historyFuture: [],
  });
}

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEditorStore();
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

  it('restores the autosaved document on boot', async () => {
    const autosavedDocument = createDefaultProjectDocument();
    autosavedDocument.items = [createRectangleItem()];
    localStorage.setItem(AUTOSAVE_KEY, serializeProjectDocument(autosavedDocument));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    });
    expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    expect(document.querySelectorAll('.layer-row')).toHaveLength(1);
  });

  it('supports global tool and history hotkeys', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard('t');
    expect(screen.getByRole('button', { name: /Text/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Rect/ }));
    expect(screen.getAllByText('Rectangle')).toHaveLength(2);

    await user.keyboard('{Control>}z{/Control}');
    expect(screen.queryByText('Rectangle')).not.toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(screen.getAllByText('Rectangle')).toHaveLength(2);

    await user.keyboard('{Control>}y{/Control}');
    expect(screen.getAllByText('Rectangle')).toHaveLength(2);
  });

  it('does not delete the selected item while a text field is focused', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Text/ }));

    const textarea = screen.getByLabelText('Text content');
    await user.click(textarea);
    await user.keyboard('{Backspace}');

    expect(screen.getByTestId('mock-stage')).toHaveTextContent('Items: 1');
    expect(document.querySelectorAll('.layer-row')).toHaveLength(1);
    expect(screen.getByLabelText('Text content')).toBeInTheDocument();
  });

  it('shows a visible error when opening an invalid project file', async () => {
    render(<App />);

    const openInput = screen.getByTestId('project-open-input');
    const invalidFile = new File(['not valid json'], 'broken-project.json', {
      type: 'application/json',
    });

    fireEvent.change(openInput, {
      target: {
        files: [invalidFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to open project');
    });
  });
});
