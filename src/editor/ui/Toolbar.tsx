import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';

import { CANVAS_PRESETS } from '../document/documentDefaults';
import type { CanvasSize } from '../document/documentTypes';

type ToolbarMenuName = 'canvas' | 'size' | 'upload';

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

interface ToolbarProps {
  canvas: CanvasSize;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canGroup: boolean;
  canSaveFavorite: boolean;
  canUngroup: boolean;
  favoriteStatusFading?: boolean;
  favoriteStatusMessage?: string | null;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportIntentChange?: (active: boolean) => void;
  onFontUpload: () => void;
  onGroup: () => void;
  onImageUpload: () => void;
  onLoad: () => void;
  onNewProject: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSaveFavorite: () => void;
  onUndo: () => void;
  onUngroup: () => void;
}

interface ToolbarIconProps {
  children: ReactNode;
}

function ToolbarIcon({ children }: ToolbarIconProps) {
  return (
    <span className="top-toolbar-svg-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        {children}
      </svg>
    </span>
  );
}

interface ToolbarMenuActionProps {
  children?: ReactNode;
  label: string;
  onSelect: () => void;
  pressed?: boolean;
  selected?: boolean;
}

function ToolbarMenuAction({
  children,
  label,
  onSelect,
  pressed,
  selected = false,
}: ToolbarMenuActionProps) {
  return (
    <button
      type="button"
      className={joinClassNames('top-toolbar-menu-item', selected && 'selected')}
      aria-pressed={pressed}
      onClick={onSelect}
    >
      {children ? <ToolbarIcon>{children}</ToolbarIcon> : null}
      <span>{label}</span>
    </button>
  );
}

interface ToolbarActionButtonProps {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}

function ToolbarActionButton({
  children,
  disabled,
  label,
  onClick,
}: ToolbarActionButtonProps) {
  return (
    <button
      type="button"
      className="top-toolbar-button top-toolbar-control top-toolbar-icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <ToolbarIcon>{children}</ToolbarIcon>
    </button>
  );
}

export function Toolbar({
  canvas,
  canDelete,
  canUndo,
  canRedo,
  canGroup,
  canSaveFavorite,
  canUngroup,
  favoriteStatusFading = false,
  favoriteStatusMessage = null,
  onCanvasSizeChange,
  onDelete,
  onExport,
  onExportIntentChange,
  onFontUpload,
  onGroup,
  onImageUpload,
  onLoad,
  onNewProject,
  onRedo,
  onSave,
  onSaveFavorite,
  onUndo,
  onUngroup,
}: ToolbarProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sizeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const uploadTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<ToolbarMenuName | null>(null);
  const [isExportHovered, setIsExportHovered] = useState(false);
  const [isExportFocused, setIsExportFocused] = useState(false);
  const canvasMenuId = useId();
  const sizeMenuId = useId();
  const uploadMenuId = useId();

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

    function restoreFocus(menu: ToolbarMenuName) {
      const triggerByMenu: Record<ToolbarMenuName, HTMLButtonElement | null> = {
        canvas: canvasTriggerRef.current,
        size: sizeTriggerRef.current,
        upload: uploadTriggerRef.current,
      };
      window.requestAnimationFrame(() => {
        triggerByMenu[menu]?.focus();
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        const activeMenu = openMenu;
        setOpenMenu(null);
        if (activeMenu) {
          restoreFocus(activeMenu);
        }
        return;
      }

      if (event.key === 'Tab') {
        setOpenMenu(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [openMenu]);

  function toggleMenu(menu: ToolbarMenuName) {
    setOpenMenu((currentMenu) => (currentMenu === menu ? null : menu));
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

  function handleCanvasSizeChange(nextSize: CanvasSize) {
    onCanvasSizeChange(nextSize);
  }

  function handlePresetSelect(nextPresetId: string) {
    closeMenu();

    if (nextPresetId === 'custom') {
      handleCanvasSizeChange({ ...canvas, presetId: undefined });
      return;
    }

    const preset = CANVAS_PRESETS.find((entry) => entry.id === nextPresetId);
    if (!preset) {
      return;
    }

    handleCanvasSizeChange({
      width: preset.width,
      height: preset.height,
      presetId: preset.id,
    });
  }

  function handleCustomWidthChange(event: ChangeEvent<HTMLInputElement>) {
    handleCanvasSizeChange({
      width: Number(event.target.value),
      height: canvas.height,
      presetId: undefined,
    });
  }

  function handleCustomHeightChange(event: ChangeEvent<HTMLInputElement>) {
    handleCanvasSizeChange({
      width: canvas.width,
      height: Number(event.target.value),
      presetId: undefined,
    });
  }

  const selectedPresetId = canvas.presetId ?? 'custom';

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
            onClick={() => toggleMenu('canvas')}
          >
            <span>Canvas</span>
            <span className="top-toolbar-menu-caret" aria-hidden="true">▼</span>
          </button>
          {openMenu === 'canvas' ? (
            <div id={canvasMenuId} className="top-toolbar-popover-panel" role="group" aria-label="Canvas actions">
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
          ) : null}
        </div>

        <div className={openMenu === 'size' ? 'top-toolbar-popover open' : 'top-toolbar-popover'}>
          <button
            ref={sizeTriggerRef}
            type="button"
            className="top-toolbar-button top-toolbar-control top-toolbar-menu-trigger"
            aria-controls={sizeMenuId}
            aria-expanded={openMenu === 'size'}
            aria-haspopup="true"
            onClick={() => toggleMenu('size')}
          >
            <span>Size</span>
            <span className="top-toolbar-menu-caret" aria-hidden="true">▼</span>
          </button>
          {openMenu === 'size' ? (
            <div
              id={sizeMenuId}
              className="top-toolbar-popover-panel top-toolbar-size-panel"
              role="group"
              aria-label="Canvas size"
            >
              {CANVAS_PRESETS.map((preset) => (
                <ToolbarMenuAction
                  key={preset.id}
                  label={preset.label}
                  selected={selectedPresetId === preset.id}
                  pressed={selectedPresetId === preset.id}
                  onSelect={() => handlePresetSelect(preset.id)}
                />
              ))}
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

        <div className={openMenu === 'upload' ? 'top-toolbar-popover open' : 'top-toolbar-popover'}>
          <button
            ref={uploadTriggerRef}
            type="button"
            className="top-toolbar-button top-toolbar-control top-toolbar-menu-trigger"
            aria-controls={uploadMenuId}
            aria-expanded={openMenu === 'upload'}
            aria-haspopup="true"
            onClick={() => toggleMenu('upload')}
          >
            <span>Upload</span>
            <span className="top-toolbar-menu-caret" aria-hidden="true">▼</span>
          </button>
          {openMenu === 'upload' ? (
            <div id={uploadMenuId} className="top-toolbar-popover-panel" role="group" aria-label="Upload actions">
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
          ) : null}
        </div>

        <div className="top-toolbar-section-divider" aria-hidden="true" />

        <div className="top-toolbar-action-strip">
          <ToolbarActionButton label="Undo" onClick={onUndo} disabled={!canUndo}>
            <path d="M8 5 3.5 9.5 8 14" />
            <path d="M4 9.5h7a4.5 4.5 0 1 1 0 9" />
          </ToolbarActionButton>
          <ToolbarActionButton label="Redo" onClick={onRedo} disabled={!canRedo}>
            <path d="m12 5 4.5 4.5L12 14" />
            <path d="M16 9.5H9a4.5 4.5 0 1 0 0 9" />
          </ToolbarActionButton>
        </div>

        <div className="top-toolbar-section-divider" aria-hidden="true" />

        <div className="top-toolbar-action-strip">
          <ToolbarActionButton label="Delete" onClick={onDelete} disabled={!canDelete}>
            <path d="M5 6.5h10" />
            <path d="M7 6.5v9" />
            <path d="M13 6.5v9" />
            <path d="M4.5 6.5 5.5 16h9l1-9.5" />
            <path d="M7.5 4.5h5" />
          </ToolbarActionButton>
          <ToolbarActionButton label="Group" onClick={onGroup} disabled={!canGroup}>
            <rect x="3.5" y="4.5" width="5.5" height="5.5" rx="1" />
            <rect x="11" y="4.5" width="5.5" height="5.5" rx="1" />
            <rect x="7.25" y="10" width="5.5" height="5.5" rx="1" />
          </ToolbarActionButton>
          <ToolbarActionButton label="Ungroup" onClick={onUngroup} disabled={!canUngroup}>
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
      </div>
    </header>
  );
}
