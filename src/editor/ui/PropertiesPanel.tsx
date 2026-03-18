import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { DEFAULT_FONT_FAMILY, WEB_SAFE_FONTS } from '../document/documentDefaults';
import { familySupportsVariant } from '../fonts';
import type {
  CanvasItem,
  DocumentFontReference,
  ImageAdjustments,
  ReorderMode,
  TextAlign,
  TextVerticalAlign,
  UploadedFont,
} from '../document/documentTypes';
import { ColorPickerControl } from './ColorPickerControl';
import { FontFamilyPicker } from './FontFamilyPicker';

interface PropertiesPanelProps {
  availableFonts: UploadedFont[];
  background: string;
  fonts: DocumentFontReference[];
  items: CanvasItem[];
  missingFontFamilies: string[];
  selectedItem?: CanvasItem;
  selectedItems?: CanvasItem[];
  onBackgroundChange: (background: string) => void;
  onItemChange: (changes: Partial<CanvasItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onSelectItem: (itemId: string) => void;
  onReorder: (mode: ReorderMode) => void;
}

function formatDisplayedNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number(value.toFixed(digits)).toString();
}

function clampNumberInputValue(value: number, min?: number, max?: number): number {
  let nextValue = Number.isFinite(value) ? value : min ?? 0;
  if (min !== undefined) {
    nextValue = Math.max(min, nextValue);
  }
  if (max !== undefined) {
    nextValue = Math.min(max, nextValue);
  }
  return nextValue;
}

function applyDetent(value: number, detentValue?: number, detentThreshold = 0): number {
  if (detentValue === undefined || detentThreshold <= 0) {
    return value;
  }
  return Math.abs(value - detentValue) <= detentThreshold ? detentValue : value;
}

function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  digits = 1,
  slider = false,
  sliderDetentValue,
  sliderDetentThreshold,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  slider?: boolean;
  sliderDetentValue?: number;
  sliderDetentThreshold?: number;
  onChange: (value: number) => void;
}) {
  const displayedValue = formatDisplayedNumber(value, digits);
  const inputId = useId();
  const sliderId = useId();

  const commitValue = (nextValue: number) => {
    onChange(clampNumberInputValue(nextValue, min, max));
  };

  if (slider) {
    return (
      <div className="number-input-field number-input-field-with-slider">
        <span>{label}</span>
        <div className="number-input-slider-row">
          <input
            id={sliderId}
            aria-label={label}
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayedValue}
            onChange={(event) => {
              const sliderValue = clampNumberInputValue(Number(event.target.value), min, max);
              commitValue(applyDetent(sliderValue, sliderDetentValue, sliderDetentThreshold));
            }}
          />
          <input
            id={inputId}
            aria-label={`${label} value`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={displayedValue}
            onChange={(event) => commitValue(Number(event.target.value))}
          />
        </div>
      </div>
    );
  }

  return (
    <label className="number-input-field" htmlFor={inputId}>
      <span>{label}</span>
      <input
        id={inputId}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={displayedValue}
        onChange={(event) => commitValue(Number(event.target.value))}
      />
    </label>
  );
}

function SectionBlock({
  title,
  children,
  defaultExpanded = true,
}: {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sectionId = useId();

  return (
    <section className="property-block">
      <button
        type="button"
        className="property-block-toggle"
        aria-expanded={expanded}
        aria-controls={sectionId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{title}</span>
        <span className="property-block-toggle-icon" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? (
        <div id={sectionId} className="property-block-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function SegmentedIconButton({
  active,
  ariaLabel,
  children,
  disabled = false,
  onClick,
}: {
  active: boolean;
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? 'segmented-control-button active' : 'segmented-control-button'}
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function itemGlyph(kind: CanvasItem['kind']): string {
  switch (kind) {
    case 'rectangle':
      return '▭';
    case 'ellipse':
      return '◯';
    case 'line':
      return '／';
    case 'text':
      return 'T';
    case 'image':
      return '▣';
    default:
      return '•';
  }
}

function itemLabel(item: CanvasItem): string {
  return item.name || item.kind;
}

function layerPrimaryLabel(item: CanvasItem): string {
  switch (item.kind) {
    case 'rectangle':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    default:
      return itemLabel(item);
  }
}

function layerSecondaryLabel(item: CanvasItem): string | null {
  if (item.kind === 'text') {
    const snippet = item.text.trim().replace(/\s+/g, ' ').slice(0, 28);
    return snippet ? `“${snippet}${item.text.trim().length > 28 ? '…' : ''}”` : 'Empty text';
  }
  return null;
}

function layerPreviewStyle(item: CanvasItem): React.CSSProperties {
  if (item.kind === 'line') {
    return {
      color: item.stroke,
      borderColor: item.stroke,
      background: 'transparent',
    };
  }
  if ('fill' in item) {
    const previewStroke = 'stroke' in item ? item.stroke : item.fill;
    return {
      color: previewStroke,
      borderColor: previewStroke,
      background: item.fill,
    };
  }
  return {};
}

function updateImageAdjustments(
  current: ImageAdjustments,
  changes: Partial<ImageAdjustments>,
): Partial<CanvasItem> {
  return {
    adjustments: {
      ...current,
      ...changes,
    },
  } as Partial<CanvasItem>;
}

function geometrySummary(item: CanvasItem): string {
  if (item.kind === 'line') {
    return `X1 ${formatDisplayedNumber(item.startX)} · Y1 ${formatDisplayedNumber(item.startY)} · X2 ${formatDisplayedNumber(item.endX)} · Y2 ${formatDisplayedNumber(item.endY)}`;
  }
  return `X ${formatDisplayedNumber(item.x)} · Y ${formatDisplayedNumber(item.y)} · W ${formatDisplayedNumber(item.width)} · H ${formatDisplayedNumber(item.height)}`;
}


export function PropertiesPanel({
  availableFonts,
  background,
  fonts,
  items,
  missingFontFamilies,
  selectedItem,
  selectedItems = selectedItem ? [selectedItem] : [],
  onBackgroundChange,
  onItemChange,
  onDeleteItem,
  onSelectItem,
  onReorder,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'properties' | 'layers'>('properties');
  const fontLabelId = useId();
  const layersScrollRef = useRef<HTMLDivElement | null>(null);
  const propertiesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef({ layers: 0, properties: 0 });
  const fontOptions = [
    ...WEB_SAFE_FONTS.map((family) => ({
      family,
      sourceName: family,
      kind: 'system' as const,
    })),
    ...availableFonts.map((font) => ({
      family: font.family,
      sourceName: font.sourceName,
      kind: font.kind,
    })),
    ...fonts,
  ].filter(
    (font, index, list) =>
      list.findIndex(
        (entry) => entry.family === font.family && entry.kind === font.kind,
      ) === index,
  );

  const selectedTextItem = selectedItem?.kind === 'text' ? selectedItem : undefined;
  const isMultiSelection = selectedItems.length > 1;
  const allSelectedOpacityEqual = selectedItems.every((item) => item.opacity === selectedItems[0]?.opacity);
  const multiOpacityValue = selectedItems[0]?.opacity ?? 1;
  const selectedFontIsSystem = selectedTextItem
    ? WEB_SAFE_FONTS.includes(selectedTextItem.fontFamily as (typeof WEB_SAFE_FONTS)[number])
    : false;
  const familyHasBold = selectedTextItem
    ? familySupportsVariant(availableFonts, selectedTextItem.fontFamily, '700', 'normal')
    : false;
  const familyHasItalic = selectedTextItem
    ? familySupportsVariant(availableFonts, selectedTextItem.fontFamily, '400', 'italic')
    : false;
  const familyHasBoldItalic = selectedTextItem
    ? familySupportsVariant(availableFonts, selectedTextItem.fontFamily, '700', 'italic')
    : false;
  const canTurnBoldOn = selectedTextItem
    ? selectedTextItem.fontStyle === 'italic'
      ? familyHasBoldItalic
      : familyHasBold
    : false;
  const canTurnItalicOn = selectedTextItem
    ? selectedTextItem.fontWeight === 'bold'
      ? familyHasBoldItalic
      : familyHasItalic
    : false;
  const canToggleBold = selectedTextItem
    ? selectedTextItem.fontWeight === 'bold' || selectedFontIsSystem || canTurnBoldOn
    : false;
  const canToggleItalic = selectedTextItem
    ? selectedTextItem.fontStyle === 'italic' || selectedFontIsSystem || canTurnItalicOn
    : false;

  useEffect(() => {
    const key = selectedItem || isMultiSelection ? 'properties' : activeTab;
    setActiveTab((current) => (current === 'layers' ? current : key));
  }, [activeTab, selectedItem]);

  useEffect(() => {
    const target = activeTab === 'layers' ? layersScrollRef.current : propertiesScrollRef.current;
    if (target) {
      target.scrollTop = scrollPositionsRef.current[activeTab];
    }
  }, [activeTab]);

  function handleTabChange(nextTab: 'properties' | 'layers') {
    scrollPositionsRef.current.layers = layersScrollRef.current?.scrollTop ?? scrollPositionsRef.current.layers;
    scrollPositionsRef.current.properties = propertiesScrollRef.current?.scrollTop ?? scrollPositionsRef.current.properties;
    setActiveTab(nextTab);
  }

  return (
    <aside className="properties-panel tabbed-properties-panel">
      {missingFontFamilies.length > 0 ? (
        <section className="panel-section panel-section-banner warning">
          <h2>Missing fonts</h2>
          <p>{missingFontFamilies.join(', ')}</p>
        </section>
      ) : null}

      <section className="panel-section panel-section-tabbed-rail">
        <div className="rail-tab-strip" role="tablist" aria-label="Inspector panels">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'properties'}
            className={activeTab === 'properties' ? 'rail-tab active' : 'rail-tab'}
            onClick={() => handleTabChange('properties')}
          >
            Properties
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'layers'}
            className={activeTab === 'layers' ? 'rail-tab active' : 'rail-tab'}
            onClick={() => handleTabChange('layers')}
          >
            Layers
            <span className="panel-badge">{items.length}</span>
          </button>
        </div>

        {activeTab === 'layers' ? (
          <div ref={layersScrollRef} className="rail-tab-body rail-tab-body-layers">
            <div className="layer-list layer-list-tabbed">
              {items
                .slice()
                .sort((left, right) => right.zIndex - left.zIndex)
                .map((item) => {
                  const secondary = layerSecondaryLabel(item);
                  return (
                    <div
                      key={item.id}
                      className={selectedItems.some((selected) => selected.id === item.id) ? 'layer-row active' : 'layer-row'}
                    >
                      <button
                        aria-label={layerPrimaryLabel(item)}
                        className="layer-row-select"
                        type="button"
                        onClick={() => onSelectItem(item.id)}
                        onDoubleClick={() => {
                          onSelectItem(item.id);
                          handleTabChange('properties');
                        }}
                      >
                        <span
                          className={`layer-row-type layer-row-type-${item.kind}`}
                          aria-hidden="true"
                          style={layerPreviewStyle(item)}
                        >
                          {itemGlyph(item.kind)}
                        </span>
                        <span className="layer-row-copy compact richer">
                          <strong>{layerPrimaryLabel(item)}</strong>
                          {secondary ? <small>{secondary}</small> : null}
                        </span>
                      </button>
                      <button
                        aria-label={`Delete ${layerPrimaryLabel(item)}`}
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
                  );
                })}
            </div>
            <div className="layers-panel-footer layers-panel-utilities">
              <div className="layer-order-toolbar" role="group" aria-label="Layer order controls">
                <button type="button" aria-label="Bring front" onClick={() => onReorder('front')} disabled={!selectedItem}>⇡</button>
                <button type="button" aria-label="Forward" onClick={() => onReorder('forward')} disabled={!selectedItem}>↑</button>
                <button type="button" aria-label="Backward" onClick={() => onReorder('backward')} disabled={!selectedItem}>↓</button>
                <button type="button" aria-label="Send back" onClick={() => onReorder('back')} disabled={!selectedItem}>⇣</button>
              </div>
              <div className="pinned-utility-row">
                <ColorPickerControl
                  label="Canvas background"
                  value={background}
                  onChange={onBackgroundChange}
                />
              </div>
            </div>
          </div>
        ) : (
          <div ref={propertiesScrollRef} className="rail-tab-body rail-tab-body-properties">
            {isMultiSelection ? (
              <>
                <div className="panel-heading-row compact-heading-row compact-item-header slim-item-header">
                  <span className="slim-item-header-glyph" aria-hidden="true">◎</span>
                  <div className="panel-heading-stack compact slim-item-heading-stack">
                    <h2>{selectedItems.length} items selected</h2>
                    <span className="slim-item-subtitle">Multi-selection</span>
                  </div>
                </div>
                <SectionBlock title="Selection">
                  <div className="field-grid dense-grid two-up-grid">
                    <NumberInput label="Opacity" min={0} max={1} step={0.1} digits={1} value={multiOpacityValue} onChange={(value) => onItemChange({ opacity: value })} />
                    {!allSelectedOpacityEqual ? <span className="slim-item-subtitle">Mixed</span> : null}
                  </div>
                </SectionBlock>
              </>
            ) : selectedItem ? (
              <>
                <div className="panel-heading-row compact-heading-row compact-item-header slim-item-header">
                  <span className="slim-item-header-glyph" aria-hidden="true">
                    {itemGlyph(selectedItem.kind)}
                  </span>
                  <div className="panel-heading-stack compact slim-item-heading-stack">
                    <h2>{layerPrimaryLabel(selectedItem)}</h2>
                    <span className="slim-item-subtitle">{selectedItem.name || selectedItem.kind}</span>
                  </div>
                </div>

                {('fill' in selectedItem || 'stroke' in selectedItem) ? (
                  <SectionBlock title="Color">
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

                {selectedItem.kind === 'text' ? (
                  <SectionBlock title="Text">
                    <label className="compact-textarea-row">
                      <span>Content</span>
                      <textarea
                        aria-label="Text content"
                        value={selectedItem.text}
                        onChange={(event) => onItemChange({ text: event.target.value })}
                      />
                    </label>
                    <div className="field-label-group compact-row font-row">
                      <span id={fontLabelId}>Font</span>
                      <FontFamilyPicker
                        fonts={fontOptions}
                        labelId={fontLabelId}
                        value={selectedItem.fontFamily || DEFAULT_FONT_FAMILY}
                        onChange={(fontFamily) => onItemChange({ fontFamily })}
                      />
                    </div>
                    <div className="field-grid dense-grid two-up-grid">
                      <NumberInput label="Size" min={8} digits={0} value={selectedItem.fontSize} onChange={(value) => onItemChange({ fontSize: value })} />
                      <NumberInput label="Opacity" min={0} max={1} step={0.1} digits={1} value={selectedItem.opacity} onChange={(value) => onItemChange({ opacity: value })} />
                    </div>
                    <div className="property-row compact-property-row">
                      <span className="property-row-label">Style</span>
                      <div className="segmented-control" role="group" aria-label="Text style">
                        <SegmentedIconButton active={selectedItem.fontWeight === 'bold'} ariaLabel="Bold" disabled={!canToggleBold} onClick={() => onItemChange({ fontWeight: selectedItem.fontWeight === 'bold' ? 'normal' : 'bold' })}><strong>B</strong></SegmentedIconButton>
                        <SegmentedIconButton active={selectedItem.fontStyle === 'italic'} ariaLabel="Italic" disabled={!canToggleItalic} onClick={() => onItemChange({ fontStyle: selectedItem.fontStyle === 'italic' ? 'normal' : 'italic' })}><em>I</em></SegmentedIconButton>
                      </div>
                    </div>
                    <div className="property-row compact-property-row align-row">
                      <span className="property-row-label">Align</span>
                      <div className="segmented-control" role="group" aria-label="Text align">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <SegmentedIconButton key={align} active={selectedItem.align === align} ariaLabel={`Align ${align}`} onClick={() => onItemChange({ align: align as TextAlign })}>
                            {align === 'left' ? '≡' : align === 'center' ? '≣' : '≡'}
                          </SegmentedIconButton>
                        ))}
                      </div>
                    </div>
                    <div className="property-row compact-property-row align-row">
                      <span className="property-row-label">Vertical</span>
                      <div className="segmented-control" role="group" aria-label="Text vertical align">
                        {(['top', 'middle', 'bottom'] as const).map((align) => (
                          <SegmentedIconButton key={align} active={selectedItem.verticalAlign === align} ariaLabel={`Align ${align}`} onClick={() => onItemChange({ verticalAlign: align as TextVerticalAlign })}>
                            {align === 'top' ? '⇡' : align === 'middle' ? '⇕' : '⇣'}
                          </SegmentedIconButton>
                        ))}
                      </div>
                    </div>
                  </SectionBlock>
                ) : null}

                {selectedItem.kind === 'image' ? (
                  <>
                    <SectionBlock title="Image">
                      <div className="field-grid dense-grid two-up-grid">
                        <NumberInput label="Opacity" min={0} max={1} step={0.1} digits={1} value={selectedItem.opacity} onChange={(value) => onItemChange({ opacity: value })} />
                      </div>
                      <label className="checkbox-row compact-checkbox-row">
                        <input aria-label="Preserve aspect ratio" type="checkbox" checked={selectedItem.preserveAspectRatio} onChange={(event) => onItemChange({ preserveAspectRatio: event.target.checked })} />
                        Preserve aspect ratio
                      </label>
                    </SectionBlock>
                    <SectionBlock title="Color">
                      <div className="field-grid dense-grid two-up-grid">
                        <NumberInput label="Brightness" min={0} max={200} digits={0} slider sliderDetentValue={100} sliderDetentThreshold={3} value={selectedItem.adjustments.brightness} onChange={(value) => onItemChange(updateImageAdjustments(selectedItem.adjustments, { brightness: value }))} />
                        <NumberInput label="Contrast" min={0} max={100} digits={0} slider sliderDetentValue={50} sliderDetentThreshold={2} value={selectedItem.adjustments.contrast} onChange={(value) => onItemChange(updateImageAdjustments(selectedItem.adjustments, { contrast: value }))} />
                        <NumberInput label="Tint strength" min={0} max={100} digits={0} slider value={selectedItem.adjustments.tintStrength} onChange={(value) => onItemChange(updateImageAdjustments(selectedItem.adjustments, { tintStrength: value }))} />
                      </div>
                      <ColorPickerControl
                        label="Tint color"
                        value={selectedItem.adjustments.tintColor}
                        onChange={(value) => onItemChange(updateImageAdjustments(selectedItem.adjustments, { tintColor: value }))}
                      />
                    </SectionBlock>
                  </>
                ) : null}

                {(selectedItem.kind === 'rectangle' || selectedItem.kind === 'ellipse' || selectedItem.kind === 'line' || selectedItem.kind === 'text') ? (
                  <SectionBlock title="Main">
                    <div className="field-grid dense-grid two-up-grid">
                      {'stroke' in selectedItem ? (
                        <NumberInput label="Stroke width" min={selectedItem.kind === 'line' ? 1 : 0} digits={1} value={selectedItem.strokeWidth} onChange={(value) => onItemChange({ strokeWidth: value })} />
                      ) : null}
                      {selectedItem.kind === 'rectangle' ? (
                        <NumberInput label="Corner radius" min={0} digits={1} value={selectedItem.cornerRadius} onChange={(value) => onItemChange({ cornerRadius: value })} />
                      ) : null}
                      {selectedItem.kind !== 'text' ? (
                        <NumberInput label="Opacity" min={0} max={1} step={0.1} digits={1} value={selectedItem.opacity} onChange={(value) => onItemChange({ opacity: value })} />
                      ) : null}
                      {selectedItem.kind !== 'line' && selectedItem.kind !== 'text' ? (
                        <NumberInput label="Rotation" digits={0} value={selectedItem.rotation} onChange={(value) => onItemChange({ rotation: value })} />
                      ) : null}
                    </div>
                  </SectionBlock>
                ) : null}

                <SectionBlock title={`Geometry · ${geometrySummary(selectedItem)}`} defaultExpanded={false}>
                  {selectedItem.kind === 'line' ? (
                    <div className="field-grid dense-grid two-up-grid">
                      <NumberInput label="Start X" value={selectedItem.startX} step={0.1} digits={1} onChange={(value) => onItemChange({ startX: value })} />
                      <NumberInput label="Start Y" value={selectedItem.startY} step={0.1} digits={1} onChange={(value) => onItemChange({ startY: value })} />
                      <NumberInput label="End X" value={selectedItem.endX} step={0.1} digits={1} onChange={(value) => onItemChange({ endX: value })} />
                      <NumberInput label="End Y" value={selectedItem.endY} step={0.1} digits={1} onChange={(value) => onItemChange({ endY: value })} />
                    </div>
                  ) : (
                    <div className="field-grid dense-grid two-up-grid">
                      <NumberInput label="X" value={selectedItem.x} step={0.1} digits={1} onChange={(value) => onItemChange({ x: value })} />
                      <NumberInput label="Y" value={selectedItem.y} step={0.1} digits={1} onChange={(value) => onItemChange({ y: value })} />
                      <NumberInput label="Width" min={1} digits={1} value={selectedItem.width} onChange={(value) => onItemChange({ width: value })} />
                      <NumberInput label="Height" min={1} digits={1} value={selectedItem.height} onChange={(value) => onItemChange({ height: value })} />
                      {selectedItem.kind === 'text' ? (
                        <>
                          <NumberInput label="Opacity" min={0} max={1} step={0.1} digits={1} value={selectedItem.opacity} onChange={(value) => onItemChange({ opacity: value })} />
                          <NumberInput label="Rotation" digits={0} value={selectedItem.rotation} onChange={(value) => onItemChange({ rotation: value })} />
                        </>
                      ) : null}
                      {selectedItem.kind === 'image' ? (
                        <NumberInput label="Rotation" digits={0} value={selectedItem.rotation} onChange={(value) => onItemChange({ rotation: value })} />
                      ) : null}
                    </div>
                  )}
                </SectionBlock>

                {selectedItem.kind === 'text' ? (
                  <SectionBlock title="Advanced text" defaultExpanded={false}>
                    <div className="field-grid dense-grid two-up-grid">
                      <NumberInput label="Line height" min={0.5} step={0.1} value={selectedItem.lineHeight} digits={1} onChange={(value) => onItemChange({ lineHeight: value })} />
                      <NumberInput label="Character spacing" step={0.5} value={selectedItem.letterSpacing} digits={1} onChange={(value) => onItemChange({ letterSpacing: value })} />
                      <NumberInput label="Padding top" digits={1} value={selectedItem.padding.top} onChange={(value) => onItemChange({ padding: { ...selectedItem.padding, top: value } })} />
                      <NumberInput label="Padding right" digits={1} value={selectedItem.padding.right} onChange={(value) => onItemChange({ padding: { ...selectedItem.padding, right: value } })} />
                      <NumberInput label="Padding bottom" digits={1} value={selectedItem.padding.bottom} onChange={(value) => onItemChange({ padding: { ...selectedItem.padding, bottom: value } })} />
                      <NumberInput label="Padding left" digits={1} value={selectedItem.padding.left} onChange={(value) => onItemChange({ padding: { ...selectedItem.padding, left: value } })} />
                    </div>
                  </SectionBlock>
                ) : null}

                <SectionBlock title="Shadow" defaultExpanded={false}>
                  <ColorPickerControl
                    label="Shadow color"
                    value={selectedItem.shadow.color}
                    onChange={(value) => onItemChange({ shadow: { ...selectedItem.shadow, color: value } })}
                  />
                  <div className="field-grid dense-grid two-up-grid">
                    <NumberInput label="Blur" min={0} digits={1} value={selectedItem.shadow.blur} onChange={(value) => onItemChange({ shadow: { ...selectedItem.shadow, blur: value } })} />
                    <NumberInput label="Opacity" min={0} max={1} step={0.1} digits={1} value={selectedItem.shadow.opacity} onChange={(value) => onItemChange({ shadow: { ...selectedItem.shadow, opacity: value } })} />
                    <NumberInput label="Offset X" digits={1} value={selectedItem.shadow.offsetX} onChange={(value) => onItemChange({ shadow: { ...selectedItem.shadow, offsetX: value } })} />
                    <NumberInput label="Offset Y" digits={1} value={selectedItem.shadow.offsetY} onChange={(value) => onItemChange({ shadow: { ...selectedItem.shadow, offsetY: value } })} />
                  </div>
                </SectionBlock>
              </>
            ) : (
              <section className="empty-panel-inner">
                <span className="eyebrow">Nothing selected</span>
                <p>Select an item to edit it, or choose a tool and drag a new item onto the canvas.</p>
                {availableFonts.length > 0 ? <p>{availableFonts.length} uploaded font(s) ready in this session.</p> : null}
              </section>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
