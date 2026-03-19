import type {
  CanvasItem,
  DocumentFontReference,
  GroupNode,
  ReorderMode,
  UploadedFont,
} from '../../document/documentTypes';
import type { LayerRow } from '../../document/sceneGraph';

export interface PropertiesPanelProps {
  availableFonts: UploadedFont[];
  background: string;
  fonts: DocumentFontReference[];
  items: CanvasItem[];
  layerRows: LayerRow[];
  missingFontFamilies: string[];
  selectedGroup?: GroupNode;
  selectedItem?: CanvasItem;
  selectedItems?: CanvasItem[];
  selectedNodeIds: string[];
  onBackgroundChange: (background: string) => void;
  onGroupOpacityChange: (opacity: number) => void;
  onItemChange: (changes: Partial<CanvasItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onReorder: (mode: ReorderMode) => void;
}

export interface LayersInspectorTabProps {
  background: string;
  canReorder: boolean;
  collapsedGroupIds: ReadonlySet<string>;
  rows: LayerRow[];
  onBackgroundChange: (background: string) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenProperties: () => void;
  onReorder: (mode: ReorderMode) => void;
  onSelectNode: (nodeId: string) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  selectedNodeIds: string[];
}

export interface SelectionInspectorProps {
  availableFonts: UploadedFont[];
  fonts: DocumentFontReference[];
  onGroupOpacityChange: (opacity: number) => void;
  onItemChange: (changes: Partial<CanvasItem>) => void;
  selectedGroup?: GroupNode;
  selectedItem?: CanvasItem;
  selectedNodeCount: number;
  selectedItems: CanvasItem[];
}
