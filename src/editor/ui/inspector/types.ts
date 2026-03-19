import type {
  CanvasItem,
  DocumentFontReference,
  ReorderMode,
  UploadedFont,
} from '../../document/documentTypes';

export interface PropertiesPanelProps {
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

export interface LayersInspectorTabProps {
  background: string;
  canReorder: boolean;
  items: CanvasItem[];
  onBackgroundChange: (background: string) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenProperties: () => void;
  onReorder: (mode: ReorderMode) => void;
  onSelectItem: (itemId: string) => void;
  selectedItems: CanvasItem[];
}

export interface SelectionInspectorProps {
  availableFonts: UploadedFont[];
  fonts: DocumentFontReference[];
  onItemChange: (changes: Partial<CanvasItem>) => void;
  selectedItem?: CanvasItem;
  selectedItems: CanvasItem[];
}
