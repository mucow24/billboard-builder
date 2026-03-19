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
    const rectangle = createRectangleItem({ id: 'rectangle-node' });
    const text = createTextItem({ id: 'text-node' });
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

    await user.click(screen.getByRole('button', { name: 'Insert Hero template' }));
    expect(onInsertTemplate).toHaveBeenCalledWith('template-1');

    await user.click(
      screen.getByRole('button', { name: 'Delete template Hero template' }),
    );
    expect(onDeleteTemplate).toHaveBeenCalledWith('template-1');
  });
});
