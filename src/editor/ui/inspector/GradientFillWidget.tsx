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
  // The second color and the swap only matter to a gradient. A mixed selection
  // holds at least one gradient, so they stay usable there.
  const secondaryDisabled = disabled || (!gradientMixed && !gradientEnabled);

  return (
    <div className="gradient-fill-widget">
      <ColorPickerControl
        disabled={disabled}
        label="Fill"
        title="Main fill color. With the gradient on, this is the color the gradient starts from."
        mixed={primaryMixed}
        value={primaryColor}
        variant="compact"
        onChange={(v) => onCommit({ kind: 'primaryColor', value: v })}
      />
      <button
        type="button"
        className="gradient-fill-swap-button"
        aria-label="Swap fill colors"
        title="Swap the fill and secondary colors. Only available while the gradient is on."
        disabled={secondaryDisabled}
        onClick={() => onCommit({ kind: 'swap' })}
      >
        ⇄
      </button>
      <ColorPickerControl
        disabled={secondaryDisabled}
        label="Secondary fill"
        title="Color the gradient ends on. Only available while the gradient is on."
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
        title="Switch between a solid fill and a gradient from the fill color to the secondary color."
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
