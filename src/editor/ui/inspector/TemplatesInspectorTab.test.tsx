import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupNode,
  createRectangleItem,
  createTextItem,
} from '../../document/documentDefaults';

import { TemplatesInspectorTab } from './TemplatesInspectorTab';

describe('TemplatesInspectorTab', () => {
  it('renders an empty state when no templates have been saved', () => {
    render(
      <TemplatesInspectorTab
        onDeleteTemplate={vi.fn()}
        onInsertTemplate={vi.fn()}
        templates={[]}
      />,
    );

    expect(screen.getByText('No templates yet')).toBeInTheDocument();
  });

  it('renders saved templates and wires insert and delete actions', async () => {
    const user = userEvent.setup();
    const onDeleteTemplate = vi.fn();
    const onInsertTemplate = vi.fn();
    const rectangle = createRectangleItem({
      id: 'rectangle-node',
      fill: '#123456',
      stroke: '#abcdef',
      strokeWidth: 2,
    });
    const text = createTextItem({
      id: 'text-node',
      fill: '#fedcba',
    });
    const group = createGroupNode([rectangle, text], 'Reusable Group');
    group.id = 'group-node';

    render(
      <TemplatesInspectorTab
        onDeleteTemplate={onDeleteTemplate}
        onInsertTemplate={onInsertTemplate}
        templates={[
          {
            id: 'template-1',
            name: 'Hero template',
            nodes: [group],
            fonts: [],
            createdAt: '2026-03-19T12:00:00.000Z',
            updatedAt: '2026-03-19T12:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Hero template')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    const preview = screen.getByTestId('template-preview-template-1');
    expect(preview).toHaveAttribute(
      'style',
      expect.stringContaining('repeat(3, minmax(0, 1fr))'),
    );
    const swatches = preview.querySelectorAll('.template-card-swatch');
    expect(swatches).toHaveLength(3);
    expect(swatches[0]).toHaveStyle({ background: 'rgb(18, 52, 86)' });
    expect(swatches[1]).toHaveStyle({ background: 'rgb(171, 205, 239)' });
    expect(swatches[2]).toHaveStyle({ background: 'rgb(254, 220, 186)' });

    await user.click(screen.getByRole('button', { name: 'Insert Hero template' }));
    expect(onInsertTemplate).toHaveBeenCalledWith('template-1');

    await user.click(
      screen.getByRole('button', { name: 'Delete template Hero template' }),
    );
    expect(onDeleteTemplate).toHaveBeenCalledWith('template-1');
  });
});
