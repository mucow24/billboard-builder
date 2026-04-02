import type { ReactNode } from 'react';

import { joinClassNames } from './toolbarUtils';

interface ToolbarIconProps {
  children: ReactNode;
}

export function ToolbarIcon({ children }: ToolbarIconProps) {
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

export function ToolbarMenuAction({
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

export function ToolbarActionButton({
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
