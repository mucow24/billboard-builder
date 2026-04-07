import type { ReactNode } from 'react';

import { joinClassNames } from '../toolbarUtils';

interface InspectorRailIconButtonProps {
  ariaDisabled?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  title?: string;
}

export function InspectorRailIconButton({
  ariaDisabled,
  children,
  className,
  disabled = false,
  label,
  onClick,
  pressed,
  title,
}: InspectorRailIconButtonProps) {
  return (
    <button
      type="button"
      className={joinClassNames('inspector-rail-icon-button', className)}
      aria-disabled={ariaDisabled || undefined}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
