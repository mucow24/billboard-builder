import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Cross2Icon,
  Link2Icon,
  LinkBreak2Icon,
  MaskOnIcon,
  StarFilledIcon,
} from '@radix-ui/react-icons';

import type { InspectorTab } from './inspector/types';
import { ToolbarActionButton } from './ToolbarPrimitives';
import { CanvasNameField } from './CanvasNameField';
import { joinClassNames, modKey } from './toolbarUtils';
import { ExportMenu, FileMenu } from './ToolbarMenus';

interface ToolbarProps {
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canGroup: boolean;
  canSaveFavorite: boolean;
  canUngroup: boolean;
  canvasName: string;
  onCanvasNameChange: (name: string) => void;
  canvasFocusActive: boolean;
  onCanvasFocusToggle: () => void;
  favoriteStatusFading?: boolean;
  favoriteStatusMessage?: string | null;
  clipboardStatusFading?: boolean;
  clipboardStatusMessage?: string | null;
  onDelete: () => void;
  onExport: () => void;
  onExportSvg: () => void;
  onExportToClipboard: () => void;
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
  canDelete,
  canUndo,
  canRedo,
  canGroup,
  canSaveFavorite,
  canUngroup,
  canvasName,
  onCanvasNameChange,
  canvasFocusActive,
  onCanvasFocusToggle,
  favoriteStatusFading = false,
  favoriteStatusMessage = null,
  clipboardStatusFading = false,
  clipboardStatusMessage = null,
  onDelete,
  onExport,
  onExportSvg,
  onExportToClipboard,
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
  const fileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<'file' | 'export' | null>(null);
  const [isExportHovered, setIsExportHovered] = useState(false);
  const [isExportFocused, setIsExportFocused] = useState(false);
  const fileMenuId = useId();
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        const triggerToRefocus = openMenu === 'export' ? exportTriggerRef : fileTriggerRef;
        setOpenMenu(null);
        window.requestAnimationFrame(() => triggerToRefocus.current?.focus());
        return;
      }

      if (event.key === 'Tab') {
        setOpenMenu(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [openMenu]);

  function toggleMenu(menu: 'file' | 'export') {
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
          <div className={joinClassNames('top-toolbar-popover', exportMenuOpen && 'open')}>
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

        <div className={openMenu === 'file' ? 'top-toolbar-popover open' : 'top-toolbar-popover'}>
          <button
            ref={fileTriggerRef}
            type="button"
            className="top-toolbar-button top-toolbar-control top-toolbar-menu-trigger"
            aria-controls={fileMenuId}
            aria-expanded={openMenu === 'file'}
            aria-haspopup="true"
            onClick={() => toggleMenu('file')}
          >
            <span>File</span>
            <span className="top-toolbar-menu-caret" aria-hidden="true">▼</span>
          </button>
          {openMenu === 'file' ? (
            <FileMenu
              menuId={fileMenuId}
              onLoad={onLoad}
              onSave={onSave}
              onNewProject={onNewProject}
              createMenuActionHandler={createMenuActionHandler}
            />
          ) : null}
        </div>

        <CanvasNameField name={canvasName} onChange={onCanvasNameChange} />

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
