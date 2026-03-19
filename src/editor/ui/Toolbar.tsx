import { CANVAS_PRESETS } from '../document/documentDefaults';
import type { CanvasSize } from '../document/documentTypes';

interface ToolbarProps {
  canvas: CanvasSize;
  canUndo: boolean;
  canRedo: boolean;
  canGroup: boolean;
  canSaveTemplate: boolean;
  canUngroup: boolean;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onDelete: () => void;
  onExport: () => void;
  onFontUpload: () => void;
  onGroup: () => void;
  onImageUpload: () => void;
  onLoad: () => void;
  onNewProject: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSaveTemplate: () => void;
  onUndo: () => void;
  onUngroup: () => void;
}

export function Toolbar({
  canvas,
  canUndo,
  canRedo,
  canGroup,
  canSaveTemplate,
  canUngroup,
  onCanvasSizeChange,
  onDelete,
  onExport,
  onFontUpload,
  onGroup,
  onImageUpload,
  onLoad,
  onNewProject,
  onRedo,
  onSave,
  onSaveTemplate,
  onUndo,
  onUngroup,
}: ToolbarProps) {
  return (
    <header className="top-toolbar">
      <div className="toolbar-clusters">
        <div className="toolbar-group toolbar-group-primary">
          <button type="button" onClick={onNewProject}>New</button>
          <button type="button" onClick={onLoad}>Open</button>
          <button type="button" onClick={onSave}>Save</button>
          <button type="button" className="button-accent" onClick={onExport}>Export PNG</button>
          <button type="button" onClick={onImageUpload}>Add image</button>
          <button type="button" onClick={onFontUpload}>Upload font</button>
        </div>

        <div className="toolbar-group toolbar-group-fields">
          <label>
            <span>Preset</span>
            <select
              aria-label="Canvas preset"
              value={canvas.presetId ?? 'custom'}
              onChange={(event) => {
                if (event.target.value === 'custom') {
                  onCanvasSizeChange({ ...canvas, presetId: undefined });
                  return;
                }
                const preset = CANVAS_PRESETS.find((entry) => entry.id === event.target.value);
                if (!preset) {
                  return;
                }
                onCanvasSizeChange({ width: preset.width, height: preset.height, presetId: preset.id });
              }}
            >
              {CANVAS_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
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
              onChange={(event) => onCanvasSizeChange({ width: Number(event.target.value), height: canvas.height, presetId: undefined })}
            />
          </label>
          <label>
            <span>H</span>
            <input
              aria-label="Canvas height"
              type="number"
              min={1}
              value={canvas.height}
              onChange={(event) => onCanvasSizeChange({ width: canvas.width, height: Number(event.target.value), presetId: undefined })}
            />
          </label>
        </div>

        <div className="toolbar-group toolbar-group-history">
          <button type="button" onClick={onGroup} disabled={!canGroup}>Group</button>
          <button type="button" onClick={onUngroup} disabled={!canUngroup}>Ungroup</button>
          {canSaveTemplate ? (
            <button type="button" onClick={onSaveTemplate}>Save as template</button>
          ) : null}
          <button type="button" onClick={onUndo} disabled={!canUndo}>Undo</button>
          <button type="button" onClick={onRedo} disabled={!canRedo}>Redo</button>
          <button type="button" className="danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </header>
  );
}
