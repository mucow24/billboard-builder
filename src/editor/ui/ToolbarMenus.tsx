import type { ChangeEvent } from 'react';

import { CANVAS_PRESETS } from '../document/documentDefaults';
import type { CanvasSize } from '../document/documentTypes';
import { getAllGenerators } from '../generators';
import { ToolbarMenuAction } from './ToolbarPrimitives';

interface CanvasMenuProps {
  menuId: string;
  onLoad: () => void;
  onSave: () => void;
  onNewProject: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function CanvasMenu({ menuId, onLoad, onSave, onNewProject, createMenuActionHandler }: CanvasMenuProps) {
  return (
    <div id={menuId} className="top-toolbar-popover-panel" role="group" aria-label="Canvas actions">
      <ToolbarMenuAction label="Load..." onSelect={createMenuActionHandler(onLoad)}>
        <path d="M3.5 7h4.2l1.4-2h7.4v9.5H3.5z" />
        <path d="M3.5 7h13" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="Save" onSelect={createMenuActionHandler(onSave)}>
        <path d="M4 4.5h12v11H4z" />
        <path d="M7 4.5v4h6v-4" />
        <path d="M7 15.5h6" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="Reset" onSelect={createMenuActionHandler(onNewProject)}>
        <path d="M10 4a6 6 0 1 1-4.24 1.76" />
        <path d="M4 4.5h4v4" />
      </ToolbarMenuAction>
    </div>
  );
}

interface SizeMenuProps {
  menuId: string;
  canvas: CanvasSize;
  selectedPresetId: string;
  onPresetSelect: (presetId: string) => void;
  onCustomWidthChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCustomHeightChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function SizeMenu({
  menuId,
  canvas,
  selectedPresetId,
  onPresetSelect,
  onCustomWidthChange,
  onCustomHeightChange,
}: SizeMenuProps) {
  return (
    <div
      id={menuId}
      className="top-toolbar-popover-panel top-toolbar-size-panel"
      role="group"
      aria-label="Canvas size"
    >
      {CANVAS_PRESETS.map((preset) => {
        const maxDim = Math.max(preset.width, preset.height);
        const w = (preset.width / maxDim) * 12;
        const h = (preset.height / maxDim) * 12;
        const x = 10 - w / 2;
        const y = 10 - h / 2;
        return (
          <ToolbarMenuAction
            key={preset.id}
            label={preset.label}
            selected={selectedPresetId === preset.id}
            pressed={selectedPresetId === preset.id}
            onSelect={() => onPresetSelect(preset.id)}
          >
            <rect x={x} y={y} width={w} height={h} rx="1" />
          </ToolbarMenuAction>
        );
      })}
      <div className="top-toolbar-menu-divider" aria-hidden="true" />
      <div className="top-toolbar-size-menu-row">
        <span className="top-toolbar-size-menu-label">Custom:</span>
        <div className="top-toolbar-size-menu-fields">
          <input
            className="top-toolbar-field top-toolbar-size-menu-input"
            aria-label="Canvas width"
            type="number"
            min={1}
            value={canvas.width}
            onChange={onCustomWidthChange}
          />
          <span className="top-toolbar-size-menu-separator" aria-hidden="true">x</span>
          <input
            className="top-toolbar-field top-toolbar-size-menu-input"
            aria-label="Canvas height"
            type="number"
            min={1}
            value={canvas.height}
            onChange={onCustomHeightChange}
          />
        </div>
      </div>
    </div>
  );
}

interface UploadMenuProps {
  menuId: string;
  onImageUpload: () => void;
  onFontUpload: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function UploadMenu({ menuId, onImageUpload, onFontUpload, createMenuActionHandler }: UploadMenuProps) {
  return (
    <div id={menuId} className="top-toolbar-popover-panel" role="group" aria-label="Upload actions">
      <ToolbarMenuAction label="Image..." onSelect={createMenuActionHandler(onImageUpload)}>
        <rect x="3.5" y="4.5" width="13" height="11" rx="1.5" />
        <path d="m6 12 2.4-2.5 2.3 2.2 2.8-3 2.5 3.3" />
        <path d="M7 8h.01" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="Font..." onSelect={createMenuActionHandler(onFontUpload)}>
        <path d="M5 15.5 8.5 4.5" />
        <path d="M11.5 15.5 15 4.5" />
        <path d="M6.4 11.2h6.9" />
      </ToolbarMenuAction>
    </div>
  );
}

interface GeneratorsMenuProps {
  menuId: string;
  onAddGenerator: (generatorType: string) => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function GeneratorsMenu({ menuId, onAddGenerator, createMenuActionHandler }: GeneratorsMenuProps) {
  return (
    <div id={menuId} className="top-toolbar-popover-panel" role="group" aria-label="Generator types">
      {getAllGenerators().map((spec) => (
        <ToolbarMenuAction
          key={spec.type}
          label={spec.label}
          onSelect={createMenuActionHandler(() => onAddGenerator(spec.type))}
        />
      ))}
    </div>
  );
}
