import { useId, useState, type ReactNode } from 'react';

import { DEFAULT_FONT_FAMILY, WEB_SAFE_FONTS } from '../model/defaults';
import type {
  CanvasItem,
  DocumentFontReference,
  TextAlign,
  TextVerticalAlign,
  UploadedFont,
} from '../model/types';
import { ColorPickerControl } from './ColorPickerControl';
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
  onDeleteItem: (itemId: string) => void;
  onSelectItem: (itemId: string) => void;
}

function formatDisplayedNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number(value.toFixed(digits)).toString();
}

function NumberInput({
  label,
  value,
  min,
  step = 1,
  digits,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  digits?: number;
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
        value={digits === undefined ? (Number.isFinite(value) ? value : 0) : formatDisplayedNumber(value, digits)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="property-block">
      <h3>{title}</h3>
      <div className="property-block-body">{children}</div>
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
  onDeleteItem,
  onSelectItem,
}: PropertiesPanelProps) {
  const [layersExpanded, setLayersExpanded] = useState(true);
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
      list.findIndex(
        (entry) => entry.family === font.family && entry.kind === font.kind,
      ) === index,
  );

  return (
    <aside className="properties-panel">
      {missingFontFamilies.length > 0 ? (
        <section className="panel-section panel-section-banner warning">
          <h2>Missing fonts</h2>
          <p>{missingFontFamilies.join(', ')}</p>
        </section>
      ) : null}

      <section className="panel-section panel-section-layers">
        <div className="panel-heading-row panel-heading-row-collapsible">
          <button
            type="button"
            className="section-toggle"
            aria-expanded={layersExpanded}
            aria-controls="layers-panel-body"
            onClick={() => setLayersExpanded((value) => !value)}
          >
            <span>Layers</span>
            <span className="panel-badge">{items.length}</span>
            <span className="section-toggle-icon" aria-hidden="true">
              {layersExpanded ? '▾' : '▸'}
            </span>
          </button>
        </div>
        {layersExpanded ? (
          <div id="layers-panel-body" className="layers-panel-body">
            <div className="layer-list">
              {items
                .slice()
                .sort((left, right) => right.zIndex - left.zIndex)
                .map((item) => (
                  <div
                    key={item.id}
                    className={
                      item.id === selectedItem?.id
                        ? 'layer-row active'
                        : 'layer-row'
                    }
                  >
                    <button
                      aria-label={item.name}
                      className="layer-row-select"
                      type="button"
                      onClick={() => onSelectItem(item.id)}
                    >
                      <span className="layer-row-copy">
                        <strong>{item.name}</strong>
                        <small>{item.kind}</small>
                      </span>
                      <span className="layer-row-chevron" aria-hidden="true">
                        ›
                      </span>
                    </button>
                    <button
                      aria-label={`Delete ${item.name}`}
                      className="layer-row-delete"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteItem(item.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
            <div className="layers-panel-footer">
              <ColorPickerControl
                label="Canvas background"
                value={background}
                onChange={onBackgroundChange}
              />
            </div>
          </div>
        ) : null}
      </section>

      {selectedItem ? (
        <section className="panel-section panel-section-details">
          <div className="panel-heading-stack">
            <span className="eyebrow">Selected layer</span>
            <h2>{selectedItem.name}</h2>
          </div>

          {selectedItem.kind === 'text' ? (
            <SectionBlock title="Content">
              <label>
                Text
                <textarea
                  aria-label="Text content"
                  value={selectedItem.text}
                  onChange={(event) => onItemChange({ text: event.target.value })}
                />
              </label>
              <div className="field-grid">
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
                  digits={1}
                  onChange={(value) => onItemChange({ lineHeight: value })}
                />
                <NumberInput
                  label="Character spacing"
                  step={0.5}
                  value={selectedItem.letterSpacing}
                  digits={1}
                  onChange={(value) => onItemChange({ letterSpacing: value })}
                />
              </div>
            </SectionBlock>
          ) : null}

          {selectedItem.kind === 'image' ? (
            <SectionBlock title="Content">
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
            </SectionBlock>
          ) : null}

          {selectedItem.kind === 'line' ? (
            <SectionBlock title="Geometry">
              <div className="field-grid">
                <NumberInput
                  label="Start X"
                  value={selectedItem.startX}
                  step={0.1}
                  digits={1}
                  onChange={(value) => onItemChange({ startX: value })}
                />
                <NumberInput
                  label="Start Y"
                  value={selectedItem.startY}
                  step={0.1}
                  digits={1}
                  onChange={(value) => onItemChange({ startY: value })}
                />
                <NumberInput
                  label="End X"
                  value={selectedItem.endX}
                  step={0.1}
                  digits={1}
                  onChange={(value) => onItemChange({ endX: value })}
                />
                <NumberInput
                  label="End Y"
                  value={selectedItem.endY}
                  step={0.1}
                  digits={1}
                  onChange={(value) => onItemChange({ endY: value })}
                />
              </div>
            </SectionBlock>
          ) : null}

          {('fill' in selectedItem || 'stroke' in selectedItem) ? (
            <SectionBlock title="Colors">
              {'fill' in selectedItem ? (
                <ColorPickerControl
                  label="Fill"
                  value={selectedItem.fill}
                  onChange={(value) => onItemChange({ fill: value })}
                />
              ) : null}

              {'stroke' in selectedItem ? (
                <ColorPickerControl
                  label="Stroke"
                  value={selectedItem.stroke}
                  onChange={(value) => onItemChange({ stroke: value })}
                />
              ) : null}
            </SectionBlock>
          ) : null}

          <SectionBlock title="Style">
            {'stroke' in selectedItem ? (
              <NumberInput
                label="Stroke width"
                min={0}
                value={selectedItem.strokeWidth}
                onChange={(value) => onItemChange({ strokeWidth: value })}
              />
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
                <div className="field-label-group">
                  <span id={fontLabelId}>Font family</span>
                  <FontFamilyPicker
                    fonts={fontOptions}
                    labelId={fontLabelId}
                    value={selectedItem.fontFamily || DEFAULT_FONT_FAMILY}
                    onChange={(fontFamily) => onItemChange({ fontFamily })}
                  />
                </div>
                <div className="field-grid">
                  <label>
                    Align
                    <select
                      aria-label="Text align"
                      value={selectedItem.align}
                      onChange={(event) =>
                        onItemChange({
                          align: event.target.value as TextAlign,
                        })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label>
                    Vertical align
                    <select
                      aria-label="Text vertical align"
                      value={selectedItem.verticalAlign}
                      onChange={(event) =>
                        onItemChange({
                          verticalAlign: event.target.value as TextVerticalAlign,
                        })
                      }
                    >
                      <option value="top">Top</option>
                      <option value="middle">Middle</option>
                      <option value="bottom">Bottom</option>
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
                </div>
              </>
            ) : null}

            <div className="field-grid">
              <NumberInput
                label="Opacity"
                min={0}
                step={0.1}
                value={selectedItem.opacity}
                digits={1}
                onChange={(value) => onItemChange({ opacity: value })}
              />
              {selectedItem.kind !== 'line' ? (
                <NumberInput
                  label="Rotation"
                  value={selectedItem.rotation}
                  digits={1}
                  onChange={(value) => onItemChange({ rotation: value })}
                />
              ) : null}
            </div>
          </SectionBlock>

          {selectedItem.kind !== 'line' ? (
            <SectionBlock title="Layout">
              <div className="field-grid">
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
                  label="X"
                  value={selectedItem.x}
                  step={0.1}
                  digits={1}
                  onChange={(value) => onItemChange({ x: value })}
                />
                <NumberInput
                  label="Y"
                  value={selectedItem.y}
                  step={0.1}
                  digits={1}
                  onChange={(value) => onItemChange({ y: value })}
                />
              </div>
            </SectionBlock>
          ) : null}
        </section>
      ) : (
        <section className="panel-section panel-section-details empty-panel">
          <span className="eyebrow">Nothing selected</span>
          <p>
            Select an item to edit it, or choose a tool and drag a new item onto
            the canvas.
          </p>
          {availableFonts.length > 0 ? (
            <p>
              {availableFonts.length} uploaded font(s) ready in this session.
            </p>
          ) : null}
        </section>
      )}
    </aside>
  );
}
