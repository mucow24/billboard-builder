/* eslint-disable react-refresh/only-export-components -- GENERATOR_ICONS shared with ToolPalette */
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { CANVAS_PRESETS } from '../document/documentDefaults';
import type { CanvasSize } from '../document/documentTypes';
import { ColorPickerControl } from './ColorPickerControl';
import { ToolbarIcon, ToolbarMenuAction } from './ToolbarPrimitives';
import { joinClassNames, modKey } from './toolbarUtils';

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

interface ToolbarSubmenuProps {
  /** The submenu's items, shown beside the trigger while it is open. */
  children: ReactNode;
  /** The paths of the trigger's icon. */
  icon: ReactNode;
  label: string;
  /** Accessible name of the group of items. */
  panelLabel: string;
  panelClassName?: string;
}

/** A menu item that opens a further menu beside it, on hover or click. */
function ToolbarSubmenu({ children, icon, label, panelLabel, panelClassName }: ToolbarSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <div
      className="top-toolbar-submenu"
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
        className="top-toolbar-menu-item top-toolbar-submenu-trigger"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <ToolbarIcon>{icon}</ToolbarIcon>
        <span>{label}</span>
        <span className="color-picker-submenu-arrow" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          className={joinClassNames('top-toolbar-popover-panel top-toolbar-submenu-panel', panelClassName)}
          role="group"
          aria-label={panelLabel}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface SizeSubmenuProps {
  canvas: CanvasSize;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
}

function SizeSubmenu({ canvas, onCanvasSizeChange }: SizeSubmenuProps) {
  const selectedPresetId = canvas.presetId ?? 'custom';

  function handlePresetSelect(presetId: string) {
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
    <ToolbarSubmenu
      label="Size"
      panelLabel="Canvas size"
      panelClassName="top-toolbar-size-panel"
      icon={
        <>
          <path d="M3.5 10h13" />
          <path d="M5.5 8l-2 2 2 2" />
          <path d="M14.5 8l2 2-2 2" />
          <path d="M10 3.5v13" />
          <path d="M8 5.5l2-2 2 2" />
          <path d="M8 14.5l2 2 2-2" />
        </>
      }
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
    </ToolbarSubmenu>
  );
}

interface CanvasMenuProps {
  background: string;
  canvas: CanvasSize;
  /** The document has unsaved changes and a saved version to go back to. */
  canRevert: boolean;
  /** The document has changes that are not in the library yet. */
  canSave: boolean;
  menuId: string;
  onBackgroundChange: (background: string) => void;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onLoadFromJson: () => void;
  onLoadFromLibrary: () => void;
  onRevert: () => void;
  onSave: () => void;
  onNewProject: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function CanvasMenu({
  background,
  canvas,
  canRevert,
  canSave,
  menuId,
  onBackgroundChange,
  onCanvasSizeChange,
  onLoadFromJson,
  onLoadFromLibrary,
  onRevert,
  onSave,
  onNewProject,
  createMenuActionHandler,
}: CanvasMenuProps) {
  return (
    <div id={menuId} className="top-toolbar-popover-panel" role="group" aria-label="Canvas actions">
      <ToolbarMenuAction label="New" onSelect={createMenuActionHandler(onNewProject)}>
        <path d="M6 4.5h8l2 2v9H4V4.5h2" />
        <path d="M8 7v4" />
        <path d="M6 9h4" />
      </ToolbarMenuAction>
      <ToolbarSubmenu
        label="Load"
        panelLabel="Load a canvas"
        icon={
          <>
            <path d="M3.5 7h4.2l1.4-2h7.4v9.5H3.5z" />
            <path d="M3.5 7h13" />
          </>
        }
      >
        <ToolbarMenuAction label="From library..." onSelect={createMenuActionHandler(onLoadFromLibrary)}>
          <rect x="3.5" y="4" width="5.5" height="5.5" rx="1" />
          <rect x="11" y="4" width="5.5" height="5.5" rx="1" />
          <rect x="3.5" y="11.5" width="5.5" height="5.5" rx="1" />
          <rect x="11" y="11.5" width="5.5" height="5.5" rx="1" />
        </ToolbarMenuAction>
        <ToolbarMenuAction label="From JSON..." onSelect={createMenuActionHandler(onLoadFromJson)}>
          <path d="M6 3.5h6l3 3v10H6z" />
          <path d="M12 3.5v3h3" />
        </ToolbarMenuAction>
      </ToolbarSubmenu>
      <ToolbarMenuAction
        label="Save"
        hint={`${modKey}+S`}
        disabled={!canSave}
        onSelect={createMenuActionHandler(onSave)}
      >
        <path d="M4 4.5h12v11H4z" />
        <path d="M7 4.5v4h6v-4" />
        <path d="M7 15.5h6" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="Revert" disabled={!canRevert} onSelect={createMenuActionHandler(onRevert)}>
        <path d="M7.5 5 4 8.5 7.5 12" />
        <path d="M4.5 8.5h7a4 4 0 1 1 0 8H9" />
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

interface ExportMenuProps {
  menuId: string;
  onExportJson: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportToClipboard: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function ExportMenu({
  menuId,
  onExportJson,
  onExportPng,
  onExportSvg,
  onExportToClipboard,
  createMenuActionHandler,
}: ExportMenuProps) {
  return (
    <div id={menuId} className="top-toolbar-popover-panel" role="group" aria-label="Export actions">
      <ToolbarMenuAction label="PNG" onSelect={createMenuActionHandler(onExportPng)}>
        <path d="M10 3v9" />
        <path d="M6.5 8.5 10 12l3.5-3.5" />
        <path d="M4 15.5h12" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="SVG" onSelect={createMenuActionHandler(onExportSvg)}>
        <path d="M4 4.5h12v11H4z" />
        <path d="M6.5 8l2 4 1.5-3 1.5 3 2-4" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="JSON" onSelect={createMenuActionHandler(onExportJson)}>
        <path d="M8 4.5c-2 0-2 1.5-2 2.75S5.5 10 4.5 10c1 0 1.5 1.5 1.5 2.75s0 2.75 2 2.75" />
        <path d="M12 4.5c2 0 2 1.5 2 2.75S14.5 10 15.5 10c-1 0-1.5 1.5-1.5 2.75s0 2.75-2 2.75" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="To clipboard" onSelect={createMenuActionHandler(onExportToClipboard)}>
        <rect x="5" y="4.5" width="10" height="12" rx="1" />
        <path d="M8 3.5h4v2H8z" />
        <path d="M7.5 9h5" />
        <path d="M7.5 12h5" />
      </ToolbarMenuAction>
    </div>
  );
}
