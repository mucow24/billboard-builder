import { useId } from 'react';

import { parseHexColor, toHexColorWithAlpha } from '../model/colors';
import { DEFAULT_FONT_FAMILY, WEB_SAFE_FONTS } from '../model/defaults';
import type { CanvasItem, DocumentFontReference, UploadedFont } from '../model/types';
import { FontFamilyPicker } from './FontFamilyPicker';

interface PropertiesPanelProps {
  availableFonts: UploadedFont[];
  background: string;
  fonts: DocumentFontReference[];
  items: CanvasItem[];
  missingFontFamilies: string[];
  selectedItem?: CanvasItem;
  onBackgroundChange: (background: string) => void;
  onItemChange: (changes: Partial<CanvasItem>) => void;
  onReorder: (mode: 'forward' | 'backward' | 'front' | 'back') => void;
  onSelectItem: (itemId: string) => void;
}

function NumberInput({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseHexColor(value);
  return (
    <div className="color-control">
      <label>
        {label}
        <input
          aria-label={label}
          type="color"
          value={parsed.hex}
          onChange={(event) => onChange(toHexColorWithAlpha(event.target.value, parsed.alpha))}
        />
      </label>
      <label>
        {label} alpha
        <input
          aria-label={`${label} alpha`}
          type="range"
          min={0}
          max={100}
          value={Math.round(parsed.alpha * 100)}
          onChange={(event) =>
            onChange(toHexColorWithAlpha(parsed.hex, Number(event.target.value) / 100))
          }
        />
      </label>
      <span className="alpha-value">{Math.round(parsed.alpha * 100)}%</span>
    </div>
  );
}

export function PropertiesPanel({
  availableFonts,
  background,
  fonts,
  items,
  missingFontFamilies,
  selectedItem,
  onBackgroundChange,
  onItemChange,
  onReorder,
  onSelectItem,
}: PropertiesPanelProps) {
  const fontLabelId = useId();
  const fontOptions = [
    ...WEB_SAFE_FONTS.map((family) => ({
      family,
      sourceName: family,
      kind: 'system' as const,
    })),
    ...fonts,
  ].filter(
    (font, index, list) =>
      list.findIndex((entry) => entry.family === font.family && entry.kind === font.kind) ===
      index
  );

  return (
    <aside className="properties-panel">
      <section className="panel-section">
        <h2>Canvas</h2>
        <ColorControl label="Canvas background" value={background} onChange={onBackgroundChange} />
      </section>

      {missingFontFamilies.length > 0 ? (
        <section className="panel-section warning">
          <h2>Missing fonts</h2>
          <p>{missingFontFamilies.join(', ')}</p>
        </section>
      ) : null}

      <section className="panel-section">
        <h2>Layers</h2>
        <div className="layer-list">
          {items
            .slice()
            .sort((left, right) => right.zIndex - left.zIndex)
            .map((item) => (
              <button
                key={item.id}
                className={item.id === selectedItem?.id ? 'layer-row active' : 'layer-row'}
                type="button"
                onClick={() => onSelectItem(item.id)}
              >
                <span>{item.name}</span>
                <small>{item.kind}</small>
              </button>
            ))}
        </div>
      </section>

      {selectedItem ? (
        <section className="panel-section">
          <h2>{selectedItem.name}</h2>
          <div className="field-grid">
            {selectedItem.kind === 'line' ? (
              <>
                <NumberInput
                  label="Start X"
                  value={selectedItem.startX}
                  onChange={(value) => onItemChange({ startX: value })}
                />
                <NumberInput
                  label="Start Y"
                  value={selectedItem.startY}
                  onChange={(value) => onItemChange({ startY: value })}
                />
                <NumberInput
                  label="End X"
                  value={selectedItem.endX}
                  onChange={(value) => onItemChange({ endX: value })}
                />
                <NumberInput
                  label="End Y"
                  value={selectedItem.endY}
                  onChange={(value) => onItemChange({ endY: value })}
                />
              </>
            ) : (
              <>
                <NumberInput
                  label="X"
                  value={selectedItem.x}
                  onChange={(value) => onItemChange({ x: value })}
                />
                <NumberInput
                  label="Y"
                  value={selectedItem.y}
                  onChange={(value) => onItemChange({ y: value })}
                />
                <NumberInput
                  label="Width"
                  min={1}
                  value={selectedItem.width}
                  onChange={(value) => onItemChange({ width: value })}
                />
                <NumberInput
                  label="Height"
                  min={1}
                  value={selectedItem.height}
                  onChange={(value) => onItemChange({ height: value })}
                />
                <NumberInput
                  label="Rotation"
                  value={selectedItem.rotation}
                  onChange={(value) => onItemChange({ rotation: value })}
                />
              </>
            )}
            <NumberInput
              label="Opacity"
              min={0}
              step={0.1}
              value={selectedItem.opacity}
              onChange={(value) => onItemChange({ opacity: value })}
            />
          </div>

          <div className="layer-actions">
            <button type="button" onClick={() => onReorder('front')}>
              Bring front
            </button>
            <button type="button" onClick={() => onReorder('forward')}>
              Forward
            </button>
            <button type="button" onClick={() => onReorder('backward')}>
              Backward
            </button>
            <button type="button" onClick={() => onReorder('back')}>
              Send back
            </button>
          </div>

          {'fill' in selectedItem ? (
            <ColorControl
              label="Fill"
              value={selectedItem.fill}
              onChange={(value) => onItemChange({ fill: value })}
            />
          ) : null}

          {'stroke' in selectedItem ? (
            <>
              <ColorControl
                label="Stroke"
                value={selectedItem.stroke}
                onChange={(value) => onItemChange({ stroke: value })}
              />
              <NumberInput
                label="Stroke width"
                min={0}
                value={selectedItem.strokeWidth}
                onChange={(value) => onItemChange({ strokeWidth: value })}
              />
            </>
          ) : null}

          {selectedItem.kind === 'rectangle' ? (
            <NumberInput
              label="Corner radius"
              min={0}
              value={selectedItem.cornerRadius}
              onChange={(value) => onItemChange({ cornerRadius: value })}
            />
          ) : null}

          {selectedItem.kind === 'text' ? (
            <>
              <label>
                Text
                <textarea
                  aria-label="Text content"
                  value={selectedItem.text}
                  onChange={(event) => onItemChange({ text: event.target.value })}
                />
              </label>
              <div className="field-label-group">
                <span id={fontLabelId}>Font family</span>
                <FontFamilyPicker
                  fonts={fontOptions}
                  labelId={fontLabelId}
                  value={selectedItem.fontFamily || DEFAULT_FONT_FAMILY}
                  onChange={(fontFamily) => onItemChange({ fontFamily })}
                />
              </div>
              <NumberInput
                label="Font size"
                min={8}
                value={selectedItem.fontSize}
                onChange={(value) => onItemChange({ fontSize: value })}
              />
              <NumberInput
                label="Line height"
                min={0.5}
                step={0.1}
                value={selectedItem.lineHeight}
                onChange={(value) => onItemChange({ lineHeight: value })}
              />
              <NumberInput
                label="Character spacing"
                step={0.5}
                value={selectedItem.letterSpacing}
                onChange={(value) => onItemChange({ letterSpacing: value })}
              />
              <label>
                Align
                <select
                  aria-label="Text align"
                  value={selectedItem.align}
                  onChange={(event) =>
                    onItemChange({ align: event.target.value as 'left' | 'center' | 'right' })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>
                Style
                <select
                  aria-label="Font style"
                  value={`${selectedItem.fontWeight}-${selectedItem.fontStyle}`}
                  onChange={(event) => {
                    const [fontWeight, fontStyle] = event.target.value.split('-');
                    onItemChange({
                      fontWeight: fontWeight as 'normal' | 'bold',
                      fontStyle: fontStyle as 'normal' | 'italic',
                    });
                  }}
                >
                  <option value="normal-normal">Regular</option>
                  <option value="bold-normal">Bold</option>
                  <option value="normal-italic">Italic</option>
                  <option value="bold-italic">Bold italic</option>
                </select>
              </label>
            </>
          ) : null}

          {selectedItem.kind === 'image' ? (
            <label className="checkbox-row">
              <input
                aria-label="Preserve aspect ratio"
                type="checkbox"
                checked={selectedItem.preserveAspectRatio}
                onChange={(event) =>
                  onItemChange({
                    preserveAspectRatio: event.target.checked,
                  })
                }
              />
              Preserve aspect ratio
            </label>
          ) : null}
        </section>
      ) : (
        <section className="panel-section empty-panel">
          <h2>No selection</h2>
          <p>Select an item to edit it, or choose a tool and drag a new item onto the canvas.</p>
          {availableFonts.length > 0 ? (
            <p>{availableFonts.length} uploaded font(s) ready in this session.</p>
          ) : null}
        </section>
      )}
    </aside>
  );
}
