/* eslint-disable react-refresh/only-export-components -- GENERATOR_ICONS shared with ToolPalette */
import { type ReactNode } from 'react';

import { ToolbarMenuAction } from './ToolbarPrimitives';

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

interface FileMenuProps {
  menuId: string;
  onLoad: () => void;
  onSave: () => void;
  onNewProject: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function FileMenu({
  menuId,
  onLoad,
  onSave,
  onNewProject,
  createMenuActionHandler,
}: FileMenuProps) {
  return (
    <div id={menuId} className="top-toolbar-popover-panel" role="group" aria-label="File actions">
      <ToolbarMenuAction label="New" onSelect={createMenuActionHandler(onNewProject)}>
        <path d="M6 4.5h8l2 2v9H4V4.5h2" />
        <path d="M8 7v4" />
        <path d="M6 9h4" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="Load..." onSelect={createMenuActionHandler(onLoad)}>
        <path d="M3.5 7h4.2l1.4-2h7.4v9.5H3.5z" />
        <path d="M3.5 7h13" />
      </ToolbarMenuAction>
      <ToolbarMenuAction label="Save" onSelect={createMenuActionHandler(onSave)}>
        <path d="M4 4.5h12v11H4z" />
        <path d="M7 4.5v4h6v-4" />
        <path d="M7 15.5h6" />
      </ToolbarMenuAction>
    </div>
  );
}

interface ExportMenuProps {
  menuId: string;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportToClipboard: () => void;
  createMenuActionHandler: (action: () => void) => () => void;
}

export function ExportMenu({
  menuId,
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
      <ToolbarMenuAction label="To clipboard" onSelect={createMenuActionHandler(onExportToClipboard)}>
        <rect x="5" y="4.5" width="10" height="12" rx="1" />
        <path d="M8 3.5h4v2H8z" />
        <path d="M7.5 9h5" />
        <path d="M7.5 12h5" />
      </ToolbarMenuAction>
    </div>
  );
}
