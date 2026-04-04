import { ColorPickerControl } from '../ColorPickerControl';

import type { GradientFillAction } from './inspectorFieldHelpers';

interface GradientFillWidgetProps {
  disabled: boolean;
  gradientEnabled: boolean;
  gradientMixed: boolean;
  primaryColor: string;
  primaryMixed: boolean;
  secondaryColor: string;
  secondaryMixed: boolean;
  onCommit: (action: GradientFillAction) => void;
}

export function GradientFillWidget({
  disabled,
  gradientEnabled,
  gradientMixed,
  primaryColor,
  primaryMixed,
  secondaryColor,
  secondaryMixed,
  onCommit,
}: GradientFillWidgetProps) {
  const effectiveGradient = !gradientMixed && gradientEnabled;

  return (
    <div className="gradient-fill-widget">
      <ColorPickerControl
        disabled={disabled}
        label="Fill"
        mixed={primaryMixed}
        value={primaryColor}
        variant="compact"
        onChange={(v) => onCommit({ kind: 'primaryColor', value: v })}
      />
      <button
        type="button"
        className="gradient-fill-swap-button"
        aria-label="Swap fill colors"
        disabled={disabled}
        onClick={() => onCommit({ kind: 'swap' })}
      >
        ⇄
      </button>
      <ColorPickerControl
        disabled={disabled}
        label="Secondary fill"
        mixed={secondaryMixed}
        value={secondaryColor}
        variant="compact"
        onChange={(v) => onCommit({ kind: 'secondaryColor', value: v })}
      />
      <button
        type="button"
        className={
          effectiveGradient
            ? 'gradient-fill-toggle-button active'
            : 'gradient-fill-toggle-button'
        }
        aria-label="Toggle gradient"
        aria-pressed={gradientMixed ? 'mixed' : gradientEnabled}
        disabled={disabled}
        onClick={() =>
          onCommit({ kind: 'toggleGradient', value: gradientMixed ? true : !gradientEnabled })
        }
      >
        <span
          className="gradient-fill-toggle-icon"
          aria-hidden="true"
          style={{
            background: effectiveGradient
              ? primaryMixed ? 'linear-gradient(135deg, rgba(110,126,153,0.28), rgba(12,18,32,0.96))' : primaryColor
              : primaryMixed || secondaryMixed
                ? 'linear-gradient(135deg, rgba(110,126,153,0.28), rgba(12,18,32,0.96))'
                : `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
          }}
        />
      </button>
      <div
        className="gradient-fill-preview"
        aria-hidden="true"
        style={{
          background: effectiveGradient
            ? primaryMixed || secondaryMixed
              ? 'linear-gradient(135deg, rgba(110,126,153,0.28), rgba(12,18,32,0.96))'
              : `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`
            : primaryMixed
              ? 'linear-gradient(135deg, rgba(110,126,153,0.28), rgba(12,18,32,0.96))'
              : primaryColor,
        }}
      />
    </div>
  );
}
