import type { CanvasTool } from '../document/documentTypes';

const TOOLS: Array<{ id: CanvasTool; label: string; hotkey: string; icon: string }> = [
  { id: 'select', label: 'Select', hotkey: 'V', icon: '↖' },
  { id: 'pan', label: 'Hand', hotkey: 'H', icon: '✋' },
  { id: 'zoom', label: 'Zoom', hotkey: 'Z', icon: '⌕' },
  { id: 'text', label: 'Text', hotkey: 'T', icon: 'T' },
  { id: 'rectangle', label: 'Rect', hotkey: 'R', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', hotkey: 'O', icon: '◯' },
  { id: 'line', label: 'Line', hotkey: 'L', icon: '／' },
];

interface ToolPaletteProps {
  activeTool: CanvasTool;
  onChange: (tool: CanvasTool) => void;
}

export function ToolPalette({ activeTool, onChange }: ToolPaletteProps) {
  return (
    <div className="tool-palette" role="toolbar" aria-label="Tools">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={tool.id === activeTool ? 'tool-button active' : 'tool-button'}
          type="button"
          onClick={() => {
            onChange(tool.id);
          }}
          aria-label={`${tool.label} (${tool.hotkey})`}
          title={`${tool.label} (${tool.hotkey})`}
          aria-pressed={tool.id === activeTool}
        >
          <span className="tool-button-icon" aria-hidden="true">
            {tool.icon}
          </span>
          <span className="sr-only">{tool.label}</span>
        </button>
      ))}
    </div>
  );
}
