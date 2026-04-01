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
  | TransactionAction;

export function isSelectionCommand(command: EditorCommand): command is SelectionCommand {
  return command.type === 'select_nodes' || command.type === 'clear_selection';
}

export function toEditorAction(command: EditorCommand): DocumentAction | SelectionAction {
  return isSelectionCommand(command)
    ? { family: 'selection', command }
    : { family: 'document', command };
}

export function isHistoryCommand(command: EditorCommand): boolean {
  return !isSelectionCommand(command) && command.type !== 'register_font' && command.type !== 'load_document';
}

export function isFontRegistration(command: EditorCommand): command is Extract<EditorCommand, { type: 'register_font' }> {
  return command.type === 'register_font';
}

export function isLoadDocumentCommand(command: EditorCommand): command is Extract<EditorCommand, { type: 'load_document' }> {
  return command.type === 'load_document';
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
