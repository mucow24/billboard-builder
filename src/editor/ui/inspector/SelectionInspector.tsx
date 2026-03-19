import type { TextCanvasItem } from '../../document/documentTypes';
import { ColorPickerControl } from '../ColorPickerControl';

import {
  AdvancedTextSection,
  GeometrySection,
  ImageSection,
  MultiSelectionSection,
  SelectionHeading,
  ShadowSection,
  ShapeMainSection,
  TextSection,
} from './SelectionInspectorSections';
import {
  buildFontOptions,
  getSelectionSummary,
  getTextStyleCapabilities,
} from './inspectorModel';
import type { SelectionInspectorProps } from './types';
import { NumberInput, SectionBlock } from './inspectorControls';

export function SelectionInspector({
  availableFonts,
  canSaveTemplate = false,
  fonts,
  onGroupOpacityChange,
  onItemChange,
  onSaveTemplate = () => {},
  selectedGroup,
  selectedItem,
  selectedNodeCount,
  selectedItems,
}: SelectionInspectorProps) {
  const selectionSummary = getSelectionSummary(selectedItems);
  const isMultiNodeSelection = selectedNodeCount > 1;
  const selectedTextItem =
    selectedItem?.kind === 'text' ? (selectedItem as TextCanvasItem) : undefined;
  const fontOptions = buildFontOptions(availableFonts, fonts);
  const textStyleCapabilities = getTextStyleCapabilities(
    selectedTextItem,
    availableFonts,
  );

  const templateSaveAction = canSaveTemplate ? (
    <div className="panel-action-row">
      <button
        type="button"
        className="panel-action-button"
        onClick={onSaveTemplate}
      >
        Save as template
      </button>
    </div>
  ) : null;

  if (selectedGroup && !isMultiNodeSelection) {
    return (
      <>
        {templateSaveAction}
        <SectionBlock title="Group">
          <NumberInput
            label="Group Opacity"
            min={0}
            max={1}
            step={0.01}
            digits={2}
            slider
            value={selectedGroup.opacity}
            onChange={onGroupOpacityChange}
          />
        </SectionBlock>
      </>
    );
  }

  if (isMultiNodeSelection || selectionSummary.isMultiSelection) {
    return (
      <>
        {templateSaveAction}
        <MultiSelectionSection
          allSelectedOpacityEqual={selectionSummary.allSelectedOpacityEqual}
          onItemChange={onItemChange}
          opacityValue={selectionSummary.opacityValue}
          selectedCount={selectedItems.length}
        />
      </>
    );
  }

  if (!selectedItem) {
    return (
      <>
        <section className="empty-panel-inner">
          <span className="eyebrow">Nothing selected</span>
          <p>Select an item to edit it, or choose a tool and drag a new item onto the canvas.</p>
          {availableFonts.length > 0 ? (
            <p>{availableFonts.length} uploaded font(s) ready in this session.</p>
          ) : null}
        </section>
      </>
    );
  }

  return (
    <>
      {templateSaveAction}
      <SelectionHeading item={selectedItem} />

      {'fill' in selectedItem || 'stroke' in selectedItem ? (
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

      {selectedTextItem ? (
        <TextSection
          canToggleBold={textStyleCapabilities.canToggleBold}
          canToggleItalic={textStyleCapabilities.canToggleItalic}
          fonts={fontOptions}
          item={selectedTextItem}
          onItemChange={onItemChange}
        />
      ) : null}

      {selectedItem.kind === 'image' ? (
        <ImageSection item={selectedItem} onItemChange={onItemChange} />
      ) : null}

      <ShapeMainSection item={selectedItem} onItemChange={onItemChange} />
      <GeometrySection item={selectedItem} onItemChange={onItemChange} />

      {selectedTextItem ? (
        <AdvancedTextSection item={selectedTextItem} onItemChange={onItemChange} />
      ) : null}

      <ShadowSection item={selectedItem} onItemChange={onItemChange} />
    </>
  );
}
