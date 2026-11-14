import type { ReactNode } from 'react';

export function FieldShell({
  children,
  hint,
  label,
  layout = 'inline',
  tooltip,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
  layout?: 'inline' | 'stacked';
  /** Explains the property; shown when the pointer rests on the label. */
  tooltip?: string;
}) {
  if (layout === 'stacked') {
    return (
      <div className="inspector-field inspector-field-stacked">
        <div className="inspector-field-header">
          <span className="inspector-field-label" title={tooltip}>{label}</span>
          {hint ? <span className="inspector-field-hint">{hint}</span> : null}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="inspector-field inspector-field-inline">
      <div className="inspector-field-inline-copy">
        <div className="inspector-field-header">
          <span className="inspector-field-label" title={tooltip}>{label}:</span>
          {hint ? <span className="inspector-field-hint">{hint}</span> : null}
        </div>
      </div>
      <div className="inspector-field-inline-control">
        {children}
      </div>
    </div>
  );
}
