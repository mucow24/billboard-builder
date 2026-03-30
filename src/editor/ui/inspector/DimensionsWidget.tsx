import { BareNumberInput } from './inspectorControls';
import type { DimensionAction } from './selectionInspectorModel';

interface DimensionsWidgetProps {
  disabled: boolean;
  width: number;
  widthMixed: boolean;
  height: number;
  heightMixed: boolean;
  scaleX: number;
  scaleXMixed: boolean;
  scaleY: number;
  scaleYMixed: boolean;
  locked: boolean;
  lockedMixed: boolean;
  originalSize: { width: number; height: number } | null;
  onCommit: (action: DimensionAction) => void;
}

export function DimensionsWidget({
  disabled,
  width,
  widthMixed,
  height,
  heightMixed,
  scaleX,
  scaleXMixed,
  scaleY,
  scaleYMixed,
  locked,
  lockedMixed,
  originalSize,
  onCommit,
}: DimensionsWidgetProps) {
  const widthPct = scaleXMixed ? null : Math.round((scaleX || 1) * 100);
  const heightPct = scaleYMixed ? null : Math.round((scaleY || 1) * 100);

  return (
    <div className="dimensions-widget">
      <span className="dimensions-widget-label">W:</span>
      <BareNumberInput
        disabled={disabled}
        digits={1}
        label="Width"
        min={1}
        mixed={widthMixed}
        value={widthMixed ? null : width}
        onChange={(value) => onCommit({ kind: 'absWidth', value, locked })}
      />
      <div className="dimensions-widget-pct-cell">
        <BareNumberInput
          disabled={disabled}
          digits={0}
          label="Width %"
          min={1}
          max={10000}
          step={1}
          value={widthPct}
          onChange={(value) => onCommit({ kind: 'pctWidth', value, locked })}
        />
        <span className="dimensions-widget-pct-label" aria-hidden="true">%</span>
      </div>

      <span className="dimensions-widget-bracket" aria-hidden="true" />

      <button
        type="button"
        aria-label="Lock aspect ratio"
        aria-pressed={lockedMixed ? 'mixed' : locked}
        className={[
          'dimensions-widget-lock',
          locked && !lockedMixed ? 'active' : '',
          lockedMixed ? 'mixed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={disabled}
        onClick={() => onCommit({ kind: 'setLock', value: lockedMixed ? true : !locked })}
      >
        <span aria-hidden="true">{locked && !lockedMixed ? '🔒' : '🔓'}</span>
      </button>

      <span className="dimensions-widget-label">H:</span>
      <BareNumberInput
        disabled={disabled}
        digits={1}
        label="Height"
        min={1}
        mixed={heightMixed}
        value={heightMixed ? null : height}
        onChange={(value) => onCommit({ kind: 'absHeight', value, locked })}
      />
      <div className="dimensions-widget-pct-cell">
        <BareNumberInput
          disabled={disabled}
          digits={0}
          label="Height %"
          min={1}
          max={10000}
          step={1}
          value={heightPct}
          onChange={(value) => onCommit({ kind: 'pctHeight', value, locked })}
        />
        <span className="dimensions-widget-pct-label" aria-hidden="true">%</span>
      </div>

      {originalSize !== null && (
        <button
          type="button"
          className="dimensions-widget-reset"
          disabled={disabled}
          onClick={() => onCommit({ kind: 'resetOriginal' })}
        >
          Reset to original size
        </button>
      )}
    </div>
  );
}
