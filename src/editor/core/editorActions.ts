import type {
  CanvasTool,
  EditorCommand,
  UploadedFont,
} from '../document/documentTypes';

export type SelectionCommand = Extract<EditorCommand, { type: 'select_nodes' | 'clear_selection' }>;
export type DocumentCommand = Exclude<EditorCommand, SelectionCommand>;

export type DocumentAction = { family: 'document'; command: DocumentCommand };
export type SelectionAction = { family: 'selection'; command: SelectionCommand };

export type SessionAction =
  | { family: 'session'; type: 'set_active_tool'; tool: CanvasTool }
  | { family: 'session'; type: 'register_available_font'; font: UploadedFont }
  | { family: 'session'; type: 'set_missing_font_families'; families: string[] }
  | { family: 'session'; type: 'set_export_scale'; scale: number };

export type HistoryAction =
  | { family: 'history'; type: 'undo' }
  | { family: 'history'; type: 'redo' }
  | { family: 'history'; type: 'reset_editor' };

export type InteractionAction =
  | { family: 'interaction'; type: 'begin' }
  | { family: 'interaction'; type: 'commit' }
  | { family: 'interaction'; type: 'cancel' };

export type TransactionHistoryMode = 'single' | 'reset' | 'none';

export type TransactionAction = {
  family: 'transaction';
  actions: Array<DocumentAction | SelectionAction | SessionAction>;
  historyMode?: TransactionHistoryMode;
};

export type EditorAction =
  | DocumentAction
  | SelectionAction
  | SessionAction
  | HistoryAction
  | InteractionAction
  | TransactionAction;

export function isSelectionCommand(command: EditorCommand): command is SelectionCommand {
  return command.type === 'select_nodes' || command.type === 'clear_selection';
}

export function toEditorAction(command: EditorCommand): DocumentAction | SelectionAction {
  return isSelectionCommand(command)
    ? { family: 'selection', command }
    : { family: 'document', command };
}

export function createTransactionAction(
  actions: Array<DocumentAction | SelectionAction | SessionAction>,
  historyMode: TransactionHistoryMode = 'single'
): TransactionAction {
  return {
    family: 'transaction',
    actions,
    historyMode,
  };
}
