import type { ChangeEvent, ReactNode } from 'react';

import { CANVAS_PRESETS } from '../document/documentDefaults';
import type { CanvasSize } from '../document/documentTypes';
import { getAllGenerators } from '../generators';
import { ColorPickerControl } from './ColorPickerControl';
import { ToolbarMenuAction } from './ToolbarPrimitives';

const GENERATOR_ICONS: Record<string, ReactNode> = {
  bands: (
    <>
      <path d="M4 6h12" />
      <path d="M4 10h12" />
      <path d="M4 14h12" />
    </>
  ),
  burst: (
    <>
      <path d="M10 3v14" />
      <path d="M3 10h14" />
      <path d="M5.05 5.05l9.9 9.9" />
      <path d="M14.95 5.05l-9.9 9.9" />
    </>
  ),
  zigzags: (
    <>
      <path d="M3 7l3.5-3.5L10 7l3.5-3.5L17 7" />
      <path d="M3 13l3.5-3.5L10 13l3.5-3.5L17 13" />
    </>
  ),
  flatGrid: (
    <>
      <rect x="4" y="4" width="12" height="12" rx="1" />
      <path d="M4 10h12" />
      <path d="M10 4v12" />
    </>
  ),
  perspectiveGrid: (
    <>
      <path d="M4 16L10 4l6 12" />
      <path d="M5.5 13h9" />
      <path d="M7 10h6" />
    </>
  ),
  scanlines: (
    <>
      <path d="M4 5h12" />
      <path d="M4 8h12" />
      <path d="M4 11h12" />
      <path d="M4 14h12" />
    </>
  ),
  noise: (
    <>
      <circle cx="6" cy="7" r="1" />
      <circle cx="14" cy="5" r="1" />
      <circle cx="10" cy="11" r="1" />
      <circle cx="15" cy="14" r="1" />
      <circle cx="5" cy="14" r="1" />
    </>
  ),
  vignette: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <ellipse cx="10" cy="10" rx="5" ry="5" />
    </>
  ),
  shapes: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <circle cx="14" cy="6" r="3" />
      <path d="M10 17L7 12h6z" />
    </>
  ),
};

interface CanvasMenuProps {
  background: string;
  menuId: string;
  onBackgroundChange: (background: string) => void;
  onLoad: () => void;
  onSave: () => void;
  onNewProject: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function CanvasMenu({ background, menuId, onBackgroundChange, onLoad, onSave, onNewProject, createMenuActionHandler }: CanvasMenuProps) {
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
      <div className="top-toolbar-menu-divider" aria-hidden="true" />
      <div className="top-toolbar-size-menu-row">
        <span className="top-toolbar-size-menu-label">Color</span>
        <ColorPickerControl
          label="Canvas background"
          value={background}
          onChange={onBackgroundChange}
          variant="compact"
          inline
        />
      </div>
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
        >
          {GENERATOR_ICONS[spec.type]}
        </ToolbarMenuAction>
      ))}
    </div>
  );
}
