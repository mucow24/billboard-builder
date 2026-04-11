import type {
  CanvasItem,
  CanvasSize,
  DocumentFontReference,
  GroupNode,
  ReorderMode,
  SelectionItemChange,
  UploadedFont,
} from '../../document/documentTypes';
import type { LayerRow } from '../../document/sceneGraph';
import type { StoredFavorite } from '../../persistence/favoriteLibraryService';

export type { SelectionItemChange };

export type InspectorTab = 'properties' | 'layers' | 'favorites';

export interface PropertiesPanelProps {
  activeTab: InspectorTab;
  availableFonts: UploadedFont[];
  background: string;
  canvas: CanvasSize;
  fonts: DocumentFontReference[];
  layerRows: LayerRow[];
  missingFontFamilies: string[];
  favorites?: StoredFavorite[];
  onDeleteFavorite?: (favoriteId: string) => void;
  onRenameFavorite?: (favoriteId: string, name: string) => void;
  onRecolorFavorite?: (favoriteId: string, color: string) => void;
  onReorderFavorite?: (fromIndex: number, toIndex: number) => void;
  selectedGroup?: GroupNode;
  selectedItem?: CanvasItem;
  selectedItems?: CanvasItem[];
  selectedNodeIds: string[];
  onBackgroundChange: (background: string) => void;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onGroupOpacityChange: (opacity: number) => void;
  onItemChange: (changes: SelectionItemChange) => void;
  onInsertFavorite?: (favoriteId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onMoveNode?: (nodeId: string, targetParentId: string | null, targetIndex: number) => void;
  onOpenProperties?: () => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectGroupChildren?: () => void;
  onToggleNode: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  onToggleNodeHidden: (nodeId: string) => void;
  onReorder: (mode: ReorderMode) => void;
  pendingCollapsedGroupIds?: string[];
  onClearPendingCollapsedGroupIds?: () => void;
}

export interface LayersInspectorTabProps {
  background: string;
  canvas: CanvasSize;
  canReorder: boolean;
  collapsedGroupIds: ReadonlySet<string>;
  rows: LayerRow[];
  onBackgroundChange: (background: string) => void;
  onCanvasSizeChange: (canvas: CanvasSize) => void;
  onDeleteNode: (nodeId: string) => void;
  onMoveNode?: (nodeId: string, targetParentId: string | null, targetIndex: number) => void;
  onOpenProperties: () => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onReorder: (mode: ReorderMode) => void;
  onSelectNode: (nodeId: string) => void;
  onToggleNode: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  onToggleNodeHidden: (nodeId: string) => void;
  onToggleGroupCollapse: (groupId: string) => void;
  selectedNodeIds: string[];
}

export interface SelectionInspectorProps {
  availableFonts: UploadedFont[];
  fonts: DocumentFontReference[];
  onGroupOpacityChange: (opacity: number) => void;
  onItemChange: (changes: SelectionItemChange) => void;
  onSelectGroupChildren?: () => void;
  selectedGroup?: GroupNode;
  selectedItem?: CanvasItem;
  selectedNodeCount: number;
  selectedItems: CanvasItem[];
}

export interface FavoritesInspectorTabProps {
  favorites: StoredFavorite[];
  onDeleteFavorite: (favoriteId: string) => void;
  onInsertFavorite: (favoriteId: string) => void;
  onRenameFavorite: (favoriteId: string, name: string) => void;
  onRecolorFavorite: (favoriteId: string, color: string) => void;
  onReorderFavorite: (fromIndex: number, toIndex: number) => void;
}
