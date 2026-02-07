// ESM entry point for ProseMirror browser bundle
// Exports all commonly used ProseMirror packages

// Core
export * as model from 'prosemirror-model';
export * as state from 'prosemirror-state';
export * as view from 'prosemirror-view';
export * as transform from 'prosemirror-transform';

// Commands & Input
export * as commands from 'prosemirror-commands';
export * as keymap from 'prosemirror-keymap';
export * as inputrules from 'prosemirror-inputrules';

// History
export * as history from 'prosemirror-history';

// Schema helpers
export * as schemaBasic from 'prosemirror-schema-basic';
export * as schemaList from 'prosemirror-schema-list';

// UI helpers
export * as dropcursor from 'prosemirror-dropcursor';
export * as gapcursor from 'prosemirror-gapcursor';

// Tables
export * as tables from 'prosemirror-tables';

// Markdown
export * as markdown from 'prosemirror-markdown';

// Re-export commonly used items at top level for convenience
export { Schema, Node, Fragment, Mark, Slice, NodeRange, ResolvedPos, NodeType, MarkType } from 'prosemirror-model';
export { EditorState, Plugin, PluginKey, Transaction, Selection, TextSelection, NodeSelection, AllSelection } from 'prosemirror-state';
export { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
export {
  baseKeymap,
  toggleMark,
  setBlockType,
  wrapIn,
  lift,
  joinUp,
  joinDown,
  selectParentNode,
  exitCode,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
  splitBlockKeepMarks,
  deleteSelection,
  joinBackward,
  joinForward,
  selectNodeBackward,
  selectNodeForward,
  selectAll,
  selectTextblockStart,
  selectTextblockEnd,
  chainCommands,
  pcBaseKeymap,
  macBaseKeymap
} from 'prosemirror-commands';
export { keymap as keymapPlugin } from 'prosemirror-keymap';
export { history as historyPlugin, undo, redo, undoDepth, redoDepth } from 'prosemirror-history';
export {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  smartQuotes,
  emDash,
  ellipsis,
  InputRule,
  undoInputRule
} from 'prosemirror-inputrules';
export { dropCursor } from 'prosemirror-dropcursor';
export { gapCursor, GapCursor } from 'prosemirror-gapcursor';
export { schema as basicSchema, nodes as basicNodes, marks as basicMarks } from 'prosemirror-schema-basic';
export { addListNodes, wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
export {
  tableNodes,
  tableEditing,
  columnResizing,
  goToNextCell,
  addColumnBefore,
  addColumnAfter,
  deleteColumn,
  addRowBefore,
  addRowAfter,
  deleteRow,
  mergeCells,
  splitCell,
  setCellAttr,
  toggleHeaderRow,
  toggleHeaderColumn,
  toggleHeaderCell,
  deleteTable,
  TableMap,
  CellSelection,
  TableView,
  fixTables
} from 'prosemirror-tables';
export {
  schema as markdownSchema,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
  MarkdownSerializerState
} from 'prosemirror-markdown';
