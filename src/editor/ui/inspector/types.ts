import type {
  CanvasItem,
  DocumentFontReference,
  GroupNode,
  ReorderMode,
  UploadedFont,
} from '../../document/documentTypes';
import type { LayerRow } from '../../document/sceneGraph';
import type { StoredTemplate } from '../../persistence/templateLibraryService';

export interface PropertiesPanelProps {
  availableFonts: UploadedFont[];
  background: string;
  canSaveTemplate?: boolean;
  fonts: DocumentFontReference[];
  items: CanvasItem[];
  layerRows: LayerRow[];
  missingFontFamilies: string[];
  onDeleteTemplate?: (templateId: string) => void;
  selectedGroup?: GroupNode;
  selectedItem?: CanvasItem;
  selectedItems?: CanvasItem[];
  selectedNodeIds: string[];
  onBackgroundChange: (background: string) => void;
  onGroupOpacityChange: (opacity: number) => void;
  onItemChange: (changes: Partial<CanvasItem>) => void;
  onInsertTemplate?: (templateId: string) => void;
  onSaveTemplate?: () => void;
  onDeleteItem: (itemId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onReorder: (mode: ReorderMode) => void;
  templates?: StoredTemplate[];
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
  canSaveTemplate?: boolean;
  fonts: DocumentFontReference[];
  onGroupOpacityChange: (opacity: number) => void;
  onItemChange: (changes: Partial<CanvasItem>) => void;
  onSaveTemplate?: () => void;
  selectedGroup?: GroupNode;
  selectedItem?: CanvasItem;
  selectedNodeCount: number;
  selectedItems: CanvasItem[];
}

export interface TemplatesInspectorTabProps {
  onDeleteTemplate: (templateId: string) => void;
  onInsertTemplate: (templateId: string) => void;
  templates: StoredTemplate[];
}
