import { CANVAS_PRESETS } from '../model/defaults';
import type { CanvasSize } from '../model/types';

interface ToolbarProps {
  canvas: CanvasSize;
  exportScale: number;
  canUndo: boolean;
  canRedo: boolean;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportScaleChange: (value: number) => void;
  onFontUpload: () => void;
  onImageUpload: () => void;
  onLoad: () => void;
  onNewProject: () => void;
  onRedo: () => void;
  onSave: () => void;
  onUndo: () => void;
}

export function Toolbar({
  canvas,
  exportScale,
  canUndo,
  canRedo,
  onCanvasSizeChange,
  onDelete,
  onExport,
  onExportScaleChange,
  onFontUpload,
  onImageUpload,
  onLoad,
  onNewProject,
  onRedo,
  onSave,
  onUndo,
}: ToolbarProps) {
  return (
    <header className="top-toolbar">
      <div className="toolbar-group">
        <button type="button" onClick={onNewProject}>
          New
        </button>
        <button type="button" onClick={onLoad}>
          Open
        </button>
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onExport}>
          Export PNG
        </button>
      </div>

      <div className="toolbar-group">
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

      <div className="toolbar-group">
        <button type="button" onClick={onImageUpload}>
          Add image
        </button>
        <button type="button" onClick={onFontUpload}>
          Upload font
        </button>
      </div>

      <div className="toolbar-group">
        <label>
          Preset
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
          W
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
          H
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
          Export x
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
    </header>
  );
}
