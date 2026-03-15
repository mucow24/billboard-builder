import { CANVAS_PRESETS } from '../model/defaults';
import type { CanvasSize } from '../model/types';

interface ToolbarProps {
  canvas: CanvasSize;
  exportScale: number;
  canUndo: boolean;
  canRedo: boolean;
  canReorderSelection: boolean;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportScaleChange: (value: number) => void;
  onFontUpload: () => void;
  onImageUpload: () => void;
  onLoad: () => void;
  onNewProject: () => void;
  onRedo: () => void;
  onReorder: (mode: 'front' | 'forward' | 'backward' | 'back') => void;
  onSave: () => void;
  onUndo: () => void;
}

const ORDER_ACTIONS = [
  { mode: 'front', label: 'Bring front', icon: '⇡' },
  { mode: 'forward', label: 'Forward', icon: '↑' },
  { mode: 'backward', label: 'Backward', icon: '↓' },
  { mode: 'back', label: 'Send back', icon: '⇣' },
] as const;

export function Toolbar({
  canvas,
  exportScale,
  canUndo,
  canRedo,
  canReorderSelection,
  onCanvasSizeChange,
  onDelete,
  onExport,
  onExportScaleChange,
  onFontUpload,
  onImageUpload,
  onLoad,
  onNewProject,
  onRedo,
  onReorder,
  onSave,
  onUndo,
}: ToolbarProps) {
  return (
    <header className="top-toolbar">
      <div className="toolbar-clusters">
        <div className="toolbar-group toolbar-group-primary">
          <button type="button" onClick={onNewProject}>
            New
          </button>
          <button type="button" onClick={onLoad}>
            Open
          </button>
          <button type="button" onClick={onSave}>
            Save
          </button>
          <button type="button" className="button-accent" onClick={onExport}>
            Export PNG
          </button>
          <button type="button" onClick={onImageUpload}>
            Add image
          </button>
          <button type="button" onClick={onFontUpload}>
            Upload font
          </button>
        </div>

        <div className="toolbar-group toolbar-group-fields">
          <label>
            <span>Preset</span>
            <select
              aria-label="Canvas preset"
              value={canvas.presetId ?? 'custom'}
              onChange={(event) => {
                if (event.target.value === 'custom') {
                  onCanvasSizeChange({
                    ...canvas,
                    presetId: undefined,
                  });
                  return;
                }
                const preset = CANVAS_PRESETS.find((entry) => entry.id === event.target.value);
                if (!preset) {
                  return;
                }
                onCanvasSizeChange({
                  width: preset.width,
                  height: preset.height,
                  presetId: preset.id,
                });
              }}
            >
              {CANVAS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            <span>W</span>
            <input
              aria-label="Canvas width"
              type="number"
              min={1}
              value={canvas.width}
              onChange={(event) =>
                onCanvasSizeChange({
                  width: Number(event.target.value),
                  height: canvas.height,
                  presetId: undefined,
                })
              }
            />
          </label>
          <label>
            <span>H</span>
            <input
              aria-label="Canvas height"
              type="number"
              min={1}
              value={canvas.height}
              onChange={(event) =>
                onCanvasSizeChange({
                  width: canvas.width,
                  height: Number(event.target.value),
                  presetId: undefined,
                })
              }
            />
          </label>
          <label>
            <span>Export</span>
            <input
              aria-label="Export scale"
              type="number"
              min={1}
              max={6}
              step={1}
              value={exportScale}
              onChange={(event) => onExportScaleChange(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="toolbar-group toolbar-group-history">
          {ORDER_ACTIONS.map((action) => (
            <button
              key={action.mode}
              type="button"
              className="toolbar-icon-button"
              aria-label={action.label}
              title={action.label}
              disabled={!canReorderSelection}
              onClick={() => onReorder(action.mode)}
            >
              <span aria-hidden="true">{action.icon}</span>
            </button>
          ))}
          <button type="button" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </header>
  );
}
