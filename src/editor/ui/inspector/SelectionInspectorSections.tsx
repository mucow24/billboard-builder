import { useId } from 'react';

import type {
  CanvasItem,
  ImageCanvasItem,
  TextAlign,
  TextCanvasItem,
  TextVerticalAlign,
} from '../../document/documentTypes';
import { ColorPickerControl } from '../ColorPickerControl';
import { FontFamilyPicker } from '../FontFamilyPicker';

import { NumberInput, SectionBlock, SegmentedIconButton } from './inspectorControls';
import {
  buildImageAdjustmentsChange,
  getDefaultFontFamily,
  getGeometrySummary,
  getItemGlyph,
  getLayerPrimaryLabel,
} from './inspectorModel';

interface SelectionHeadingProps {
  item: CanvasItem;
}

export function SelectionHeading({ item }: SelectionHeadingProps) {
  return (
    <div className="panel-heading-row compact-heading-row compact-item-header slim-item-header">
      <span className="slim-item-header-glyph" aria-hidden="true">
        {getItemGlyph(item.kind)}
      </span>
      <div className="panel-heading-stack compact slim-item-heading-stack">
        <h2>{getLayerPrimaryLabel(item)}</h2>
        <span className="slim-item-subtitle">{item.name || item.kind}</span>
      </div>
    </div>
  );
}

interface MultiSelectionSectionProps {
  allSelectedOpacityEqual: boolean;
  onItemChange: (changes: Partial<CanvasItem>) => void;
  opacityValue: number;
  selectedCount: number;
}

export function MultiSelectionSection({
  allSelectedOpacityEqual,
  onItemChange,
  opacityValue,
  selectedCount,
}: MultiSelectionSectionProps) {
  return (
    <>
      <div className="panel-heading-row compact-heading-row compact-item-header slim-item-header">
        <span className="slim-item-header-glyph" aria-hidden="true">
          ◎
        </span>
        <div className="panel-heading-stack compact slim-item-heading-stack">
          <h2>{selectedCount} items selected</h2>
          <span className="slim-item-subtitle">Multi-selection</span>
        </div>
      </div>
      <SectionBlock title="Selection">
        <div className="field-grid dense-grid two-up-grid">
          <NumberInput
            label="Opacity"
            min={0}
            max={1}
            step={0.1}
            digits={1}
            value={opacityValue}
            onChange={(value) => onItemChange({ opacity: value })}
          />
          {!allSelectedOpacityEqual ? <span className="slim-item-subtitle">Mixed</span> : null}
        </div>
      </SectionBlock>
    </>
  );
}

interface TextSectionProps {
  canToggleBold: boolean;
  canToggleItalic: boolean;
  fonts: Parameters<typeof FontFamilyPicker>[0]['fonts'];
  item: TextCanvasItem;
  onItemChange: (changes: Partial<CanvasItem>) => void;
}

export function TextSection({
  canToggleBold,
  canToggleItalic,
  fonts,
  item,
  onItemChange,
}: TextSectionProps) {
  const fontLabelId = useId();

  return (
    <SectionBlock title="Text">
      <label className="compact-textarea-row">
        <span>Content</span>
        <textarea
          aria-label="Text content"
          value={item.text}
          onChange={(event) => onItemChange({ text: event.target.value })}
        />
      </label>
      <div className="field-label-group compact-row font-row">
        <span id={fontLabelId}>Font</span>
        <FontFamilyPicker
          fonts={fonts}
          labelId={fontLabelId}
          value={getDefaultFontFamily(item)}
          onChange={(fontFamily) => onItemChange({ fontFamily })}
        />
      </div>
      <div className="field-grid dense-grid two-up-grid">
        <NumberInput
          label="Size"
          min={8}
          digits={0}
          value={item.fontSize}
          onChange={(value) => onItemChange({ fontSize: value })}
        />
        <NumberInput
          label="Opacity"
          min={0}
          max={1}
          step={0.1}
          digits={1}
          value={item.opacity}
          onChange={(value) => onItemChange({ opacity: value })}
        />
      </div>
      <div className="property-row compact-property-row">
        <span className="property-row-label">Style</span>
        <div className="segmented-control" role="group" aria-label="Text style">
          <SegmentedIconButton
            active={item.fontWeight === 'bold'}
            ariaLabel="Bold"
            disabled={!canToggleBold}
            onClick={() =>
              onItemChange({
                fontWeight: item.fontWeight === 'bold' ? 'normal' : 'bold',
              })
            }
          >
            <strong>B</strong>
          </SegmentedIconButton>
          <SegmentedIconButton
            active={item.fontStyle === 'italic'}
            ariaLabel="Italic"
            disabled={!canToggleItalic}
            onClick={() =>
              onItemChange({
                fontStyle: item.fontStyle === 'italic' ? 'normal' : 'italic',
              })
            }
          >
            <em>I</em>
          </SegmentedIconButton>
        </div>
      </div>
      <div className="property-row compact-property-row align-row">
        <span className="property-row-label">Align</span>
        <div className="segmented-control" role="group" aria-label="Text align">
          {(['left', 'center', 'right'] as const).map((align) => (
            <SegmentedIconButton
              key={align}
              active={item.align === align}
              ariaLabel={`Align ${align}`}
              onClick={() => onItemChange({ align: align as TextAlign })}
            >
              {align === 'left' ? '≡' : align === 'center' ? '≣' : '≡'}
            </SegmentedIconButton>
          ))}
        </div>
      </div>
      <div className="property-row compact-property-row align-row">
        <span className="property-row-label">Vertical</span>
        <div className="segmented-control" role="group" aria-label="Text vertical align">
          {(['top', 'middle', 'bottom'] as const).map((align) => (
            <SegmentedIconButton
              key={align}
              active={item.verticalAlign === align}
              ariaLabel={`Align ${align}`}
              onClick={() =>
                onItemChange({ verticalAlign: align as TextVerticalAlign })
              }
            >
              {align === 'top' ? '⇡' : align === 'middle' ? '⇕' : '⇣'}
            </SegmentedIconButton>
          ))}
        </div>
      </div>
    </SectionBlock>
  );
}

interface ImageSectionProps {
  item: ImageCanvasItem;
  onItemChange: (changes: Partial<CanvasItem>) => void;
}

export function ImageSection({ item, onItemChange }: ImageSectionProps) {
  return (
    <>
      <SectionBlock title="Image">
        <div className="field-grid dense-grid two-up-grid">
          <NumberInput
            label="Opacity"
            min={0}
            max={1}
            step={0.1}
            digits={1}
            value={item.opacity}
            onChange={(value) => onItemChange({ opacity: value })}
          />
        </div>
        <label className="checkbox-row compact-checkbox-row">
          <input
            aria-label="Preserve aspect ratio"
            type="checkbox"
            checked={item.preserveAspectRatio}
            onChange={(event) =>
              onItemChange({ preserveAspectRatio: event.target.checked })
            }
          />
          Preserve aspect ratio
        </label>
      </SectionBlock>
      <SectionBlock title="Color">
        <div className="field-grid dense-grid two-up-grid">
          <NumberInput
            label="Brightness"
            min={0}
            max={200}
            digits={0}
            slider
            sliderDetentValue={100}
            sliderDetentThreshold={3}
            value={item.adjustments.brightness}
            onChange={(value) =>
              onItemChange(
                buildImageAdjustmentsChange(item.adjustments, { brightness: value }),
              )
            }
          />
          <NumberInput
            label="Contrast"
            min={0}
            max={100}
            digits={0}
            slider
            sliderDetentValue={50}
            sliderDetentThreshold={2}
            value={item.adjustments.contrast}
            onChange={(value) =>
              onItemChange(
                buildImageAdjustmentsChange(item.adjustments, { contrast: value }),
              )
            }
          />
          <NumberInput
            label="Tint strength"
            min={0}
            max={100}
            digits={0}
            slider
            value={item.adjustments.tintStrength}
            onChange={(value) =>
              onItemChange(
                buildImageAdjustmentsChange(item.adjustments, { tintStrength: value }),
              )
            }
          />
        </div>
        <ColorPickerControl
          label="Tint color"
          value={item.adjustments.tintColor}
          onChange={(value) =>
            onItemChange(
              buildImageAdjustmentsChange(item.adjustments, { tintColor: value }),
            )
          }
        />
      </SectionBlock>
    </>
  );
}

interface ShapeMainSectionProps {
  item: CanvasItem;
  onItemChange: (changes: Partial<CanvasItem>) => void;
}

export function ShapeMainSection({ item, onItemChange }: ShapeMainSectionProps) {
  if (
    item.kind !== 'rectangle' &&
    item.kind !== 'ellipse' &&
    item.kind !== 'line' &&
    item.kind !== 'text'
  ) {
    return null;
  }

  return (
    <SectionBlock title="Main">
      <div className="field-grid dense-grid two-up-grid">
        {'stroke' in item ? (
          <NumberInput
            label="Stroke width"
            min={item.kind === 'line' ? 1 : 0}
            digits={1}
            value={item.strokeWidth}
            onChange={(value) => onItemChange({ strokeWidth: value })}
          />
        ) : null}
        {item.kind === 'rectangle' ? (
          <NumberInput
            label="Corner radius"
            min={0}
            digits={1}
            value={item.cornerRadius}
            onChange={(value) => onItemChange({ cornerRadius: value })}
          />
        ) : null}
        {item.kind !== 'text' ? (
          <NumberInput
            label="Opacity"
            min={0}
            max={1}
            step={0.1}
            digits={1}
            value={item.opacity}
            onChange={(value) => onItemChange({ opacity: value })}
          />
        ) : null}
        {item.kind !== 'line' && item.kind !== 'text' ? (
          <NumberInput
            label="Rotation"
            digits={0}
            value={item.rotation}
            onChange={(value) => onItemChange({ rotation: value })}
          />
        ) : null}
      </div>
    </SectionBlock>
  );
}

interface GeometrySectionProps {
  item: CanvasItem;
  onItemChange: (changes: Partial<CanvasItem>) => void;
}

export function GeometrySection({ item, onItemChange }: GeometrySectionProps) {
  return (
    <SectionBlock
      title={`Geometry · ${getGeometrySummary(item)}`}
      defaultExpanded={false}
    >
      {item.kind === 'line' ? (
        <div className="field-grid dense-grid two-up-grid">
          <NumberInput
            label="Start X"
            value={item.startX}
            step={0.1}
            digits={1}
            onChange={(value) => onItemChange({ startX: value })}
          />
          <NumberInput
            label="Start Y"
            value={item.startY}
            step={0.1}
            digits={1}
            onChange={(value) => onItemChange({ startY: value })}
          />
          <NumberInput
            label="End X"
            value={item.endX}
            step={0.1}
            digits={1}
            onChange={(value) => onItemChange({ endX: value })}
          />
          <NumberInput
            label="End Y"
            value={item.endY}
            step={0.1}
            digits={1}
            onChange={(value) => onItemChange({ endY: value })}
          />
        </div>
      ) : (
        <div className="field-grid dense-grid two-up-grid">
          <NumberInput
            label="X"
            value={item.x}
            step={0.1}
            digits={1}
            onChange={(value) => onItemChange({ x: value })}
          />
          <NumberInput
            label="Y"
            value={item.y}
            step={0.1}
            digits={1}
            onChange={(value) => onItemChange({ y: value })}
          />
          <NumberInput
            label="Width"
            min={1}
            digits={1}
            value={item.width}
            onChange={(value) => onItemChange({ width: value })}
          />
          <NumberInput
            label="Height"
            min={1}
            digits={1}
            value={item.height}
            onChange={(value) => onItemChange({ height: value })}
          />
          {item.kind === 'text' ? (
            <>
              <NumberInput
                label="Opacity"
                min={0}
                max={1}
                step={0.1}
                digits={1}
                value={item.opacity}
                onChange={(value) => onItemChange({ opacity: value })}
              />
              <NumberInput
                label="Rotation"
                digits={0}
                value={item.rotation}
                onChange={(value) => onItemChange({ rotation: value })}
              />
            </>
          ) : null}
          {item.kind === 'image' ? (
            <NumberInput
              label="Rotation"
              digits={0}
              value={item.rotation}
              onChange={(value) => onItemChange({ rotation: value })}
            />
          ) : null}
        </div>
      )}
    </SectionBlock>
  );
}

interface AdvancedTextSectionProps {
  item: TextCanvasItem;
  onItemChange: (changes: Partial<CanvasItem>) => void;
}

export function AdvancedTextSection({
  item,
  onItemChange,
}: AdvancedTextSectionProps) {
  return (
    <SectionBlock title="Advanced text" defaultExpanded={false}>
      <div className="field-grid dense-grid two-up-grid">
        <NumberInput
          label="Line height"
          min={0.5}
          step={0.1}
          value={item.lineHeight}
          digits={1}
          onChange={(value) => onItemChange({ lineHeight: value })}
        />
        <NumberInput
          label="Character spacing"
          step={0.5}
          value={item.letterSpacing}
          digits={1}
          onChange={(value) => onItemChange({ letterSpacing: value })}
        />
        <NumberInput
          label="Padding top"
          digits={1}
          value={item.padding.top}
          onChange={(value) =>
            onItemChange({ padding: { ...item.padding, top: value } })
          }
        />
        <NumberInput
          label="Padding right"
          digits={1}
          value={item.padding.right}
          onChange={(value) =>
            onItemChange({ padding: { ...item.padding, right: value } })
          }
        />
        <NumberInput
          label="Padding bottom"
          digits={1}
          value={item.padding.bottom}
          onChange={(value) =>
            onItemChange({ padding: { ...item.padding, bottom: value } })
          }
        />
        <NumberInput
          label="Padding left"
          digits={1}
          value={item.padding.left}
          onChange={(value) =>
            onItemChange({ padding: { ...item.padding, left: value } })
          }
        />
      </div>
    </SectionBlock>
  );
}

interface ShadowSectionProps {
  item: CanvasItem;
  onItemChange: (changes: Partial<CanvasItem>) => void;
}

export function ShadowSection({ item, onItemChange }: ShadowSectionProps) {
  return (
    <SectionBlock title="Shadow" defaultExpanded={false}>
      <ColorPickerControl
        label="Shadow color"
        value={item.shadow.color}
        onChange={(value) =>
          onItemChange({ shadow: { ...item.shadow, color: value } })
        }
      />
      <div className="field-grid dense-grid two-up-grid">
        <NumberInput
          label="Blur"
          min={0}
          digits={1}
          value={item.shadow.blur}
          onChange={(value) => onItemChange({ shadow: { ...item.shadow, blur: value } })}
        />
        <NumberInput
          label="Opacity"
          min={0}
          max={1}
          step={0.1}
          digits={1}
          value={item.shadow.opacity}
          onChange={(value) =>
            onItemChange({ shadow: { ...item.shadow, opacity: value } })
          }
        />
        <NumberInput
          label="Offset X"
          digits={1}
          value={item.shadow.offsetX}
          onChange={(value) =>
            onItemChange({ shadow: { ...item.shadow, offsetX: value } })
          }
        />
        <NumberInput
          label="Offset Y"
          digits={1}
          value={item.shadow.offsetY}
          onChange={(value) =>
            onItemChange({ shadow: { ...item.shadow, offsetY: value } })
          }
        />
      </div>
    </SectionBlock>
  );
}
