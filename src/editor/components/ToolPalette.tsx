import type { CanvasTool } from '../model/types';

const TOOLS: Array<{ id: CanvasTool; label: string; hotkey: string }> = [
  { id: 'select', label: 'Arrow', hotkey: 'V' },
  { id: 'text', label: 'Text', hotkey: 'T' },
  { id: 'rectangle', label: 'Rect', hotkey: 'R' },
  { id: 'ellipse', label: 'Ellipse', hotkey: 'O' },
  { id: 'line', label: 'Line', hotkey: 'L' },
];

interface ToolPaletteProps {
  activeTool: CanvasTool;
  onChange: (tool: CanvasTool) => void;
  onCreate: (tool: Exclude<CanvasTool, 'select'>) => void;
}

export function ToolPalette({ activeTool, onChange, onCreate }: ToolPaletteProps) {
  return (
    <aside className="tool-palette" aria-label="Tools">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={tool.id === activeTool ? 'tool-button active' : 'tool-button'}
          type="button"
          onClick={() => {
            if (tool.id === 'select') {
              onChange(tool.id);
              return;
            }
            onCreate(tool.id);
          }}
          aria-pressed={tool.id === activeTool}
        >
          <span>{tool.label}</span>
          <small>{tool.hotkey}</small>
        </button>
      ))}
    </aside>
  );
}
