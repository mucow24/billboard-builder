import { ColorPickerControl } from '../ColorPickerControl';

import {
  getItemGlyph,
  getLayerPreviewStyle,
  getLayerPrimaryLabel,
  getLayerSecondaryLabel,
  getSortedLayerItems,
} from './inspectorModel';
import type { LayersInspectorTabProps } from './types';

export function LayersInspectorTab({
  background,
  canReorder,
  items,
  onBackgroundChange,
  onDeleteItem,
  onOpenProperties,
  onReorder,
  onSelectItem,
  selectedItems,
}: LayersInspectorTabProps) {
  return (
    <div className="rail-tab-body rail-tab-body-layers">
      <div className="layer-list layer-list-tabbed">
        {getSortedLayerItems(items).map((item) => {
          const secondary = getLayerSecondaryLabel(item);
          return (
            <div
              key={item.id}
              className={
                selectedItems.some((selected) => selected.id === item.id)
                  ? 'layer-row active'
                  : 'layer-row'
              }
            >
              <button
                aria-label={getLayerPrimaryLabel(item)}
                className="layer-row-select"
                type="button"
                onClick={() => onSelectItem(item.id)}
                onDoubleClick={() => {
                  onSelectItem(item.id);
                  onOpenProperties();
                }}
              >
                <span
                  className={`layer-row-type layer-row-type-${item.kind}`}
                  aria-hidden="true"
                  style={getLayerPreviewStyle(item)}
                >
                  {getItemGlyph(item.kind)}
                </span>
                <span className="layer-row-copy compact richer">
                  <strong>{getLayerPrimaryLabel(item)}</strong>
                  {secondary ? <small>{secondary}</small> : null}
                </span>
              </button>
              <button
                aria-label={`Delete ${getLayerPrimaryLabel(item)}`}
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
          <button
            type="button"
            aria-label="Bring front"
            disabled={!canReorder}
            onClick={() => onReorder('front')}
          >
            ⇡
          </button>
          <button
            type="button"
            aria-label="Forward"
            disabled={!canReorder}
            onClick={() => onReorder('forward')}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Backward"
            disabled={!canReorder}
            onClick={() => onReorder('backward')}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Send back"
            disabled={!canReorder}
            onClick={() => onReorder('back')}
          >
            ⇣
          </button>
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
  );
}
