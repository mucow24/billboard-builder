import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Cross2Icon,
  Link2Icon,
  LinkBreak2Icon,
  MaskOnIcon,
  PinBottomIcon,
  PinTopIcon,
  StarFilledIcon,
} from '@radix-ui/react-icons';

import type { CanvasSize, ReorderMode } from '../document/documentTypes';
import type { InspectorTab } from './inspector/types';
import { ToolbarActionButton } from './ToolbarPrimitives';
import { CanvasNameField } from './CanvasNameField';
import { joinClassNames, modKey } from './toolbarUtils';
import { CanvasMenu, ExportMenu } from './ToolbarMenus';

interface ToolbarProps {
  background: string;
  canvas: CanvasSize;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canGroup: boolean;
  canReorder: boolean;
  /** The document has unsaved changes and a saved version to go back to. */
  canRevert: boolean;
  canSaveFavorite: boolean;
  canUngroup: boolean;
  /** The document has changes that are not in the library yet. */
  hasUnsavedChanges: boolean;
  canvasName: string;
  onCanvasNameChange: (name: string) => void;
  canvasFocusActive: boolean;
  onCanvasFocusToggle: () => void;
  favoriteStatusFading?: boolean;
  favoriteStatusMessage?: string | null;
  clipboardStatusFading?: boolean;
  clipboardStatusMessage?: string | null;
  onBackgroundChange: (background: string) => void;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportJson: () => void;
  onExportSvg: () => void;
  onExportToClipboard: () => void;
  onExportIntentChange?: (active: boolean) => void;
  onGroup: () => void;
  onLoadFromJson: () => void;
  onLoadFromLibrary: () => void;
  onNewProject: () => void;
  onRedo: () => void;
  onReorder: (mode: ReorderMode) => void;
  onRevert: () => void;
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
  canReorder,
  canRevert,
  canSaveFavorite,
  canUngroup,
  hasUnsavedChanges,
  canvasName,
  onCanvasNameChange,
  canvasFocusActive,
  onCanvasFocusToggle,
  favoriteStatusFading = false,
  favoriteStatusMessage = null,
  clipboardStatusFading = false,
  clipboardStatusMessage = null,
  onBackgroundChange,
  onCanvasSizeChange,
  onDelete,
  onExport,
  onExportJson,
  onExportSvg,
  onExportToClipboard,
  onExportIntentChange,
  onGroup,
  onLoadFromJson,
  onLoadFromLibrary,
  onNewProject,
  onRedo,
  onReorder,
  onRevert,
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
  const canvasPopoverRef = useRef<HTMLDivElement | null>(null);
  const canvasTriggerRef = useRef<HTMLButtonElement | null>(null);
  const exportPopoverRef = useRef<HTMLDivElement | null>(null);
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<'canvas' | 'export' | null>(null);
  const [isExportHovered, setIsExportHovered] = useState(false);
  const [isExportFocused, setIsExportFocused] = useState(false);
  const canvasMenuId = useId();
  const exportMenuId = useId();
  const exportMenuOpen = openMenu === 'export';

  useEffect(() => {
    onExportIntentChange?.(isExportHovered || isExportFocused || exportMenuOpen);
  }, [exportMenuOpen, isExportFocused, isExportHovered, onExportIntentChange]);

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

    const openPopoverRef = openMenu === 'export' ? exportPopoverRef : canvasPopoverRef;
    const openTriggerRef = openMenu === 'export' ? exportTriggerRef : canvasTriggerRef;

    // The menu's own controls, not the trigger button that opens it.
    function isInsideOpenMenu(node: EventTarget | null) {
      return (
        node instanceof Node &&
        node !== openTriggerRef.current &&
        Boolean(openPopoverRef.current?.contains(node))
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenMenu(null);
        window.requestAnimationFrame(() => openTriggerRef.current?.focus());
        return;
      }

      // Tab from a control inside the menu (canvas size fields, color picker)
      // moves focus as usual; handleKeyUp closes the menu once focus has left it.
      if (event.key === 'Tab' && !isInsideOpenMenu(event.target)) {
        setOpenMenu(null);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === 'Tab' && !isInsideOpenMenu(document.activeElement)) {
        setOpenMenu(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [openMenu]);

  function toggleMenu(menu: 'canvas' | 'export') {
    setOpenMenu((current) => (current === menu ? null : menu));
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
        <div className="top-toolbar-status-anchor">
          <div ref={exportPopoverRef} className={joinClassNames('top-toolbar-popover', exportMenuOpen && 'open')}>
            <button
              ref={exportTriggerRef}
              type="button"
              className="top-toolbar-button top-toolbar-control top-toolbar-button-export"
              aria-controls={exportMenuId}
              aria-expanded={exportMenuOpen}
              aria-haspopup="true"
              onClick={() => {
                // Closing via click is the user signaling "I'm done." Drop the
                // browser-default focus the click leaves behind so a subsequent
                // mouse-leave actually clears the export-bounds cue.
                if (exportMenuOpen) {
                  exportTriggerRef.current?.blur();
                }
                toggleMenu('export');
              }}
              onMouseEnter={() => setIsExportHovered(true)}
              onMouseLeave={() => setIsExportHovered(false)}
              onFocus={() => setIsExportFocused(true)}
              onBlur={() => setIsExportFocused(false)}
            >
              <span>Export</span>
              <span className="top-toolbar-menu-caret" aria-hidden="true">▼</span>
            </button>
            {exportMenuOpen ? (
              <ExportMenu
                menuId={exportMenuId}
                onExportJson={onExportJson}
                onExportPng={onExport}
                onExportSvg={onExportSvg}
                onExportToClipboard={onExportToClipboard}
                createMenuActionHandler={createMenuActionHandler}
              />
            ) : null}
          </div>
          {clipboardStatusMessage ? (
            <div
              className={
                clipboardStatusFading
                  ? 'top-toolbar-status-bubble fading'
                  : 'top-toolbar-status-bubble'
              }
              role="status"
            >
              {clipboardStatusMessage}
            </div>
          ) : null}
        </div>

        <div ref={canvasPopoverRef} className={openMenu === 'canvas' ? 'top-toolbar-popover open' : 'top-toolbar-popover'}>
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
            <CanvasMenu
              background={background}
              canvas={canvas}
              canRevert={canRevert}
              canSave={hasUnsavedChanges}
              menuId={canvasMenuId}
              onBackgroundChange={onBackgroundChange}
              onCanvasSizeChange={onCanvasSizeChange}
              onLoadFromJson={onLoadFromJson}
              onLoadFromLibrary={onLoadFromLibrary}
              onRevert={onRevert}
              onSave={onSave}
              onNewProject={onNewProject}
              createMenuActionHandler={createMenuActionHandler}
            />
          ) : null}
        </div>

        <CanvasNameField name={canvasName} onChange={onCanvasNameChange} />
        {hasUnsavedChanges ? (
          <span
            className="top-toolbar-dirty-dot"
            data-testid="canvas-unsaved-indicator"
            role="img"
            aria-label="Unsaved changes"
            title="Unsaved changes"
          />
        ) : null}

        <div className="top-toolbar-section-divider" aria-hidden="true" />

        <div className="top-toolbar-action-strip">
          <ToolbarActionButton
            label="Canvas focus"
            shortcut="F"
            onClick={onCanvasFocusToggle}
            pressed={canvasFocusActive}
            icon={<MaskOnIcon width={16} height={16} />}
          />
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
          <ToolbarActionButton
            label="Delete"
            shortcut="Del"
            onClick={onDelete}
            disabled={!canDelete}
            icon={<Cross2Icon width={16} height={16} />}
          />
          <ToolbarActionButton
            label="Group"
            shortcut={`${modKey}+G`}
            onClick={onGroup}
            disabled={!canGroup}
            icon={<Link2Icon width={16} height={16} />}
          />
          <ToolbarActionButton
            label="Ungroup"
            shortcut={`${modKey}+Shift+G`}
            onClick={onUngroup}
            disabled={!canUngroup}
            icon={<LinkBreak2Icon width={16} height={16} />}
          />
          <div className="top-toolbar-status-anchor">
            <ToolbarActionButton
              label="Save as favorite"
              onClick={onSaveFavorite}
              disabled={!canSaveFavorite}
              icon={<StarFilledIcon width={16} height={16} />}
            />
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

        <div className="top-toolbar-section-divider" aria-hidden="true" />

        <div className="top-toolbar-action-strip" role="group" aria-label="Layer order controls">
          <ToolbarActionButton
            label="Move to top"
            shortcut={`${modKey}+Shift+Up`}
            onClick={() => onReorder('front')}
            disabled={!canReorder}
            icon={<PinTopIcon width={16} height={16} />}
          />
          <ToolbarActionButton
            label="Move up"
            shortcut={`${modKey}+Up`}
            onClick={() => onReorder('forward')}
            disabled={!canReorder}
            icon={<ArrowUpIcon width={16} height={16} />}
          />
          <ToolbarActionButton
            label="Move down"
            shortcut={`${modKey}+Down`}
            onClick={() => onReorder('backward')}
            disabled={!canReorder}
            icon={<ArrowDownIcon width={16} height={16} />}
          />
          <ToolbarActionButton
            label="Move to bottom"
            shortcut={`${modKey}+Shift+Down`}
            onClick={() => onReorder('back')}
            disabled={!canReorder}
            icon={<PinBottomIcon width={16} height={16} />}
          />
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
