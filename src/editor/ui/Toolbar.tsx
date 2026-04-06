import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import type { CanvasSize } from '../document/documentTypes';
import type { InspectorTab } from './inspector/types';
import { ToolbarActionButton, ToolbarIcon } from './ToolbarPrimitives';
import { joinClassNames, modKey } from './toolbarUtils';
import { CanvasMenu } from './ToolbarMenus';

interface ToolbarProps {
  background: string;
  canvas: CanvasSize;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canGroup: boolean;
  canSaveFavorite: boolean;
  canUngroup: boolean;
  canvasFocusActive: boolean;
  onCanvasFocusToggle: () => void;
  favoriteStatusFading?: boolean;
  favoriteStatusMessage?: string | null;
  onBackgroundChange: (background: string) => void;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportIntentChange?: (active: boolean) => void;
  onGroup: () => void;
  onLoad: () => void;
  onNewProject: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSaveFavorite: () => void;
  onUndo: () => void;
  onUngroup: () => void;
  activeInspectorTab: InspectorTab;
  panelCollapsed: boolean;
  onInspectorTabChange: (tab: InspectorTab) => void;
  itemCount: number;
  favoriteCount: number;
  inspectorPanel?: ReactNode;
}

export function Toolbar({
  background,
  canvas,
  canDelete,
  canUndo,
  canRedo,
  canGroup,
  canSaveFavorite,
  canUngroup,
  canvasFocusActive,
  onCanvasFocusToggle,
  favoriteStatusFading = false,
  favoriteStatusMessage = null,
  onBackgroundChange,
  onCanvasSizeChange,
  onDelete,
  onExport,
  onExportIntentChange,
  onGroup,
  onLoad,
  onNewProject,
  onRedo,
  onSave,
  onSaveFavorite,
  onUndo,
  onUngroup,
  activeInspectorTab,
  panelCollapsed,
  onInspectorTabChange,
  itemCount,
  favoriteCount,
  inspectorPanel,
}: ToolbarProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<'canvas' | null>(null);
  const [isExportHovered, setIsExportHovered] = useState(false);
  const [isExportFocused, setIsExportFocused] = useState(false);
  const canvasMenuId = useId();

  useEffect(() => {
    onExportIntentChange?.(isExportHovered || isExportFocused);
  }, [isExportFocused, isExportHovered, onExportIntentChange]);

  useEffect(() => () => onExportIntentChange?.(false), [onExportIntentChange]);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) {
        return;
      }
      setOpenMenu(null);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenMenu(null);
        window.requestAnimationFrame(() => canvasTriggerRef.current?.focus());
        return;
      }

      if (event.key === 'Tab') {
        setOpenMenu(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [openMenu]);

  function toggleMenu() {
    setOpenMenu((current) => (current === 'canvas' ? null : 'canvas'));
  }

  function closeMenu() {
    setOpenMenu(null);
  }

  function createMenuActionHandler(action: () => void) {
    return () => {
      closeMenu();
      action();
    };
  }

  return (
    <header ref={rootRef} className="top-toolbar">
      <div className="top-toolbar-row" role="toolbar" aria-label="Project toolbar">
        <button
          type="button"
          className="top-toolbar-button top-toolbar-control top-toolbar-button-export"
          onClick={onExport}
          onMouseEnter={() => setIsExportHovered(true)}
          onMouseLeave={() => setIsExportHovered(false)}
          onFocus={() => setIsExportFocused(true)}
          onBlur={() => setIsExportFocused(false)}
        >
          <ToolbarIcon>
            <path d="M10 3v9" />
            <path d="M6.5 8.5 10 12l3.5-3.5" />
            <path d="M4 15.5h12" />
          </ToolbarIcon>
          <span>Export PNG</span>
        </button>

        <div className={openMenu === 'canvas' ? 'top-toolbar-popover open' : 'top-toolbar-popover'}>
          <button
            ref={canvasTriggerRef}
            type="button"
            className="top-toolbar-button top-toolbar-control top-toolbar-menu-trigger"
            aria-controls={canvasMenuId}
            aria-expanded={openMenu === 'canvas'}
            aria-haspopup="true"
            onClick={toggleMenu}
          >
            <span>Canvas</span>
            <span className="top-toolbar-menu-caret" aria-hidden="true">▼</span>
          </button>
          {openMenu === 'canvas' ? (
            <CanvasMenu
              background={background}
              canvas={canvas}
              menuId={canvasMenuId}
              onBackgroundChange={onBackgroundChange}
              onCanvasSizeChange={onCanvasSizeChange}
              onLoad={onLoad}
              onSave={onSave}
              onNewProject={onNewProject}
              createMenuActionHandler={createMenuActionHandler}
            />
          ) : null}
        </div>

        <div className="top-toolbar-section-divider" aria-hidden="true" />

        <div className="top-toolbar-action-strip">
          <ToolbarActionButton label="Canvas focus" shortcut="F" onClick={onCanvasFocusToggle} pressed={canvasFocusActive}>
            <path d="M4 8V5a1 1 0 0 1 1-1h3" />
            <path d="M16 8V5a1 1 0 0 0-1-1h-3" />
            <path d="M4 12v3a1 1 0 0 0 1 1h3" />
            <path d="M16 12v3a1 1 0 0 1-1 1h-3" />
          </ToolbarActionButton>
        </div>

        <div className="top-toolbar-section-divider" aria-hidden="true" />

        <div className="top-toolbar-action-strip">
          <ToolbarActionButton label="Undo" shortcut={`${modKey}+Z`} onClick={onUndo} disabled={!canUndo}>
            <path d="M8 5 3.5 9.5 8 14" />
            <path d="M4 9.5h7a4.5 4.5 0 1 1 0 9" />
          </ToolbarActionButton>
          <ToolbarActionButton label="Redo" shortcut={`${modKey}+Shift+Z`} onClick={onRedo} disabled={!canRedo}>
            <path d="m12 5 4.5 4.5L12 14" />
            <path d="M16 9.5H9a4.5 4.5 0 1 0 0 9" />
          </ToolbarActionButton>
        </div>

        <div className="top-toolbar-section-divider" aria-hidden="true" />

        <div className="top-toolbar-action-strip">
          <ToolbarActionButton label="Delete" shortcut="Del" onClick={onDelete} disabled={!canDelete}>
            <path d="M5 6.5h10" />
            <path d="M7 6.5v9" />
            <path d="M13 6.5v9" />
            <path d="M4.5 6.5 5.5 16h9l1-9.5" />
            <path d="M7.5 4.5h5" />
          </ToolbarActionButton>
          <ToolbarActionButton label="Group" shortcut={`${modKey}+G`} onClick={onGroup} disabled={!canGroup}>
            <rect x="3.5" y="4.5" width="5.5" height="5.5" rx="1" />
            <rect x="11" y="4.5" width="5.5" height="5.5" rx="1" />
            <rect x="7.25" y="10" width="5.5" height="5.5" rx="1" />
          </ToolbarActionButton>
          <ToolbarActionButton label="Ungroup" shortcut={`${modKey}+Shift+G`} onClick={onUngroup} disabled={!canUngroup}>
            <rect x="3.5" y="4.5" width="5.5" height="11" rx="1" />
            <rect x="11" y="4.5" width="5.5" height="11" rx="1" />
            <path d="M9.5 10h1" />
          </ToolbarActionButton>
          <div className="top-toolbar-status-anchor">
            <ToolbarActionButton
              label="Save as favorite"
              onClick={onSaveFavorite}
              disabled={!canSaveFavorite}
            >
              <path d="m10 3.5 2.1 4.25 4.7.68-3.4 3.31.8 4.68L10 14.2l-4.2 2.22.8-4.68-3.4-3.31 4.7-.68Z" />
            </ToolbarActionButton>
            {favoriteStatusMessage ? (
              <div
                className={
                  favoriteStatusFading
                    ? 'top-toolbar-status-bubble fading'
                    : 'top-toolbar-status-bubble'
                }
                role="status"
              >
                {favoriteStatusMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className="top-toolbar-spacer" />

        <div className={joinClassNames('top-toolbar-inspector', !panelCollapsed && 'open')}>
          <div className="top-toolbar-inspector-tabs" role="tablist" aria-label="Inspector panels">
            {(['properties', 'layers', 'favorites'] as const).map((tab) => {
              const isActive = activeInspectorTab === tab;
              const isConnected = isActive && !panelCollapsed;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={isConnected}
                  className={joinClassNames(
                    'top-toolbar-inspector-tab',
                    isConnected && 'active',
                    isConnected && 'connected',
                  )}
                  onClick={() => onInspectorTabChange(tab)}
                >
                  <span>{tab === 'properties' ? 'Properties' : tab === 'layers' ? 'Layers' : 'Favorites'}</span>
                  {tab === 'layers' && <span className="top-toolbar-inspector-badge">{itemCount}</span>}
                  {tab === 'favorites' && <span className="top-toolbar-inspector-badge">{favoriteCount}</span>}
                </button>
              );
            })}
          </div>
          <div
            className="top-toolbar-inspector-panel"
            style={{ display: panelCollapsed ? 'none' : undefined }}
          >
            {inspectorPanel}
          </div>
        </div>
      </div>
    </header>
  );
}
