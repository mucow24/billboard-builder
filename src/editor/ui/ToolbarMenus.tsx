/* eslint-disable react-refresh/only-export-components -- GENERATOR_ICONS shared with ToolPalette */
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { CANVAS_PRESETS } from '../document/documentDefaults';
import type { CanvasSize } from '../document/documentTypes';
import { ColorPickerControl } from './ColorPickerControl';
import { ToolbarIcon, ToolbarMenuAction } from './ToolbarPrimitives';

export const GENERATOR_ICONS: Record<string, ReactNode> = {
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

interface SizeSubmenuProps {
  canvas: CanvasSize;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
}

function SizeSubmenu({ canvas, onCanvasSizeChange }: SizeSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const selectedPresetId = canvas.presetId ?? 'custom';

  function handlePresetSelect(presetId: string) {
    if (presetId === 'custom') {
      onCanvasSizeChange({ ...canvas, presetId: undefined });
      return;
    }
    const preset = CANVAS_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    onCanvasSizeChange({ width: preset.width, height: preset.height, presetId: preset.id });
  }

  function handleCustomWidthChange(event: ChangeEvent<HTMLInputElement>) {
    onCanvasSizeChange({ width: Number(event.target.value), height: canvas.height, presetId: undefined });
  }

  function handleCustomHeightChange(event: ChangeEvent<HTMLInputElement>) {
    onCanvasSizeChange({ width: canvas.width, height: Number(event.target.value), presetId: undefined });
  }

  return (
    <div
      className="size-submenu"
      onMouseEnter={() => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
        setIsOpen(true);
      }}
      onMouseLeave={() => {
        closeTimerRef.current = setTimeout(() => setIsOpen(false), 250);
      }}
    >
      <button
        type="button"
        className="top-toolbar-menu-item size-submenu-trigger"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <ToolbarIcon>
          <path d="M3.5 10h13" />
          <path d="M5.5 8l-2 2 2 2" />
          <path d="M14.5 8l2 2-2 2" />
          <path d="M10 3.5v13" />
          <path d="M8 5.5l2-2 2 2" />
          <path d="M8 14.5l2 2 2-2" />
        </ToolbarIcon>
        <span>Size</span>
        <span className="color-picker-submenu-arrow" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          className="top-toolbar-popover-panel size-submenu-panel top-toolbar-size-panel"
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
                onSelect={() => handlePresetSelect(preset.id)}
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
                onChange={handleCustomWidthChange}
              />
              <span className="top-toolbar-size-menu-separator" aria-hidden="true">x</span>
              <input
                className="top-toolbar-field top-toolbar-size-menu-input"
                aria-label="Canvas height"
                type="number"
                min={1}
                value={canvas.height}
                onChange={handleCustomHeightChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface CanvasMenuProps {
  background: string;
  canvas: CanvasSize;
  menuId: string;
  onBackgroundChange: (background: string) => void;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onLoad: () => void;
  onSave: () => void;
  onNewProject: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function CanvasMenu({
  background,
  canvas,
  menuId,
  onBackgroundChange,
  onCanvasSizeChange,
  onLoad,
  onSave,
  onNewProject,
  createMenuActionHandler,
}: CanvasMenuProps) {
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
      <ColorPickerControl
        label="Canvas background"
        triggerLabel="Color"
        value={background}
        onChange={onBackgroundChange}
        variant="menu-item"
        inline
      />
      <SizeSubmenu canvas={canvas} onCanvasSizeChange={onCanvasSizeChange} />
    </div>
  );
}
