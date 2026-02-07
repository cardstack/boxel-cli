// RichMarkdownField - Phase 3: Dual Mode & ToastMark Integration
// A ProseMirror-based WYSIWYG markdown editor as a Boxel FieldDef

// =============================================================================
// ProseMirror Imports - custom bundle with single prosemirror-model instance
// =============================================================================
import {
  Schema,
  EditorState,
  EditorView,
  baseKeymap,
  keymapPlugin as keymap,
  historyPlugin as history,
  undo,
  redo,
  toggleMark,
  wrapIn,
  setBlockType,
  lift,
  wrapInList,
  splitListItem,
  liftListItem,
  sinkListItem,
} from 'https://3ysmo545jefthhfn.public.blob.vercel-storage.com/prosemirror-bundle.e583942a74ac.js';

// =============================================================================
// ToastMark Imports - Incremental markdown parser
// TODO: Re-enable when ready for ToastMark integration
// =============================================================================
// import {
//   ToastMark,
//   Parser as ToastMarkParser,
//   createRenderHTML,
// } from 'https://3ysmo545jefthhfn.public.blob.vercel-storage.com/toastmark-bundle.eb0fba533585.js';

// Placeholder until ToastMark is enabled
const ToastMark = null;

// =============================================================================
// Boxel Imports
// =============================================================================
import {
  CardDef,
  FieldDef,
  field,
  contains,
  Component,
  StringField,
  linksToMany,
} from 'https://cardstack.com/base/card-api';
import { on } from '@ember/modifier';
import { get, concat } from '@ember/helper';
import { eq } from '@cardstack/boxel-ui/helpers';
import { htmlSafe } from '@ember/template';
import Modifier from 'ember-modifier';
import { registerDestructor } from '@ember/destroyable';

import { tracked } from '@glimmer/tracking';

// =============================================================================
// ProseMirror Schema - Phase 3: Block elements (lists, blockquote, code_block)
// =============================================================================
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
        tag: `h${level}`,
        attrs: { level },
      })),
      toDOM: (node: any) => [`h${node.attrs.level}`, 0],
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    code_block: {
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM: () => ['pre', ['code', 0]],
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [
        {
          tag: 'ol',
          getAttrs: (dom: any) => ({ order: dom.getAttribute('start') || 1 }),
        },
      ],
      toDOM: (node: any) =>
        node.attrs.order === 1
          ? ['ol', 0]
          : ['ol', { start: node.attrs.order }, 0],
    },
    list_item: {
      content: 'paragraph block*',
      attrs: { checked: { default: null } }, // null=normal, true=checked, false=unchecked
      parseDOM: [
        {
          tag: 'li[data-checked="true"]',
          getAttrs: () => ({ checked: true }),
        },
        {
          tag: 'li[data-checked="false"]',
          getAttrs: () => ({ checked: false }),
        },
        { tag: 'li' },
      ],
      toDOM: (node: any) => {
        if (node.attrs.checked === null) {
          return ['li', 0];
        }
        return [
          'li',
          {
            'data-checked': String(node.attrs.checked),
            class: 'task-item',
          },
          0,
        ];
      },
      defining: true,
    },
    text: { group: 'inline' },
    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: '' },
        title: { default: null },
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom: any) => ({
            src: dom.getAttribute('src'),
            alt: dom.getAttribute('alt') || '',
            title: dom.getAttribute('title'),
          }),
        },
      ],
      toDOM: (node: any) => [
        'img',
        {
          src: node.attrs.src,
          alt: node.attrs.alt,
          title: node.attrs.title,
        },
      ],
    },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr'],
    },
    table: {
      content: 'table_row+',
      group: 'block',
      tableRole: 'table',
      parseDOM: [{ tag: 'table' }],
      toDOM: () => ['table', ['tbody', 0]],
    },
    table_row: {
      content: '(table_cell | table_header)+',
      tableRole: 'row',
      parseDOM: [{ tag: 'tr' }],
      toDOM: () => ['tr', 0],
    },
    table_cell: {
      content: 'inline*',
      attrs: { align: { default: null } },
      tableRole: 'cell',
      parseDOM: [
        {
          tag: 'td',
          getAttrs: (dom: any) => ({ align: dom.getAttribute('align') }),
        },
      ],
      toDOM: (node: any) =>
        node.attrs.align
          ? ['td', { style: `text-align: ${node.attrs.align}` }, 0]
          : ['td', 0],
    },
    table_header: {
      content: 'inline*',
      attrs: { align: { default: null } },
      tableRole: 'header_cell',
      parseDOM: [
        {
          tag: 'th',
          getAttrs: (dom: any) => ({ align: dom.getAttribute('align') }),
        },
      ],
      toDOM: (node: any) =>
        node.attrs.align
          ? ['th', { style: `text-align: ${node.attrs.align}` }, 0]
          : ['th', 0],
    },
    // Boxel card/field embedding nodes
    boxel_card_atom: {
      attrs: {
        cardId: {},
        label: { default: '' },
      },
      inline: true,
      group: 'inline',
      atom: true,
      draggable: true,
      parseDOM: [
        {
          tag: 'span[data-boxel-card-atom]',
          getAttrs: (dom: any) => ({
            cardId: dom.getAttribute('data-card-id'),
            label: dom.getAttribute('data-label') || dom.textContent,
          }),
        },
      ],
      toDOM: (node: any) => [
        'span',
        {
          'data-boxel-card-atom': '',
          'data-card-id': node.attrs.cardId,
          'data-label': node.attrs.label,
          class: 'boxel-card-atom',
        },
        ['span', { class: 'atom-icon' }, '📄'],
        ['span', { class: 'atom-label' }, node.attrs.label],
      ],
    },
    boxel_field_atom: {
      attrs: {
        fieldType: {},
        data: { default: '{}' },
        label: { default: '' },
      },
      inline: true,
      group: 'inline',
      atom: true,
      draggable: true,
      parseDOM: [
        {
          tag: 'span[data-boxel-field-atom]',
          getAttrs: (dom: any) => ({
            fieldType: dom.getAttribute('data-field-type'),
            data: dom.getAttribute('data-field-data'),
            label: dom.getAttribute('data-label') || dom.textContent,
          }),
        },
      ],
      toDOM: (node: any) => [
        'span',
        {
          'data-boxel-field-atom': '',
          'data-field-type': node.attrs.fieldType,
          'data-field-data': node.attrs.data,
          'data-label': node.attrs.label,
          class: 'boxel-field-atom',
        },
        node.attrs.label,
      ],
    },
    boxel_card_block: {
      attrs: {
        cardId: {},
        format: { default: 'embedded' },
        size: { default: 'full' }, // full, large, medium, small (for embedded)
        width: { default: 320 },   // pixels (for fitted)
        height: { default: 200 },  // pixels (for fitted)
      },
      group: 'block',
      atom: true,
      draggable: true,
      parseDOM: [
        {
          tag: 'div[data-boxel-card-block]',
          getAttrs: (dom: any) => ({
            cardId: dom.getAttribute('data-card-id'),
            format: dom.getAttribute('data-format') || 'embedded',
            size: dom.getAttribute('data-size') || 'full',
            width: parseInt(dom.getAttribute('data-width') || '320'),
            height: parseInt(dom.getAttribute('data-height') || '200'),
          }),
        },
      ],
      toDOM: (node: any) => [
        'div',
        {
          'data-boxel-card-block': '',
          'data-card-id': node.attrs.cardId,
          'data-format': node.attrs.format,
          'data-size': node.attrs.size,
          'data-width': String(node.attrs.width),
          'data-height': String(node.attrs.height),
          class: `boxel-card-block format-${node.attrs.format} size-${node.attrs.size}`,
          style: node.attrs.format === 'fitted'
            ? `width:${node.attrs.width}px;height:${node.attrs.height}px`
            : '',
        },
        [
          'div',
          { class: 'card-block-header' },
          ['span', { class: 'card-icon' }, '📄'],
          ['span', { class: 'card-format' }, node.attrs.format],
        ],
        ['div', { class: 'card-block-id' }, node.attrs.cardId],
      ],
    },
  },
  marks: {
    strong: {
      parseDOM: [
        { tag: 'strong' },
        {
          tag: 'b',
          getAttrs: (node: any) => node.style.fontWeight !== 'normal' && null,
        },
        {
          style: 'font-weight=400',
          clearMark: (m: any) => m.type.name === 'strong',
        },
        {
          style: 'font-weight',
          getAttrs: (value: any) =>
            /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
        },
      ],
      toDOM: () => ['strong', 0],
    },
    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom: any) => ({
            href: dom.getAttribute('href'),
            title: dom.getAttribute('title'),
          }),
        },
      ],
      toDOM: (node: any) => [
        'a',
        { href: node.attrs.href, title: node.attrs.title },
        0,
      ],
    },
  },
});

// =============================================================================
// ToastMark Parser Wrapper - Incremental markdown parsing
// =============================================================================

/**
 * MarkdownParserService wraps ToastMark for incremental parsing.
 * Supports both full parsing and incremental edits for performance.
 */
class MarkdownParserService {
  private tm: any;
  private content: string;

  constructor(content: string = '') {
    this.content = content;
    // ToastMark disabled for now - using simple text storage
    this.tm = ToastMark ? new (ToastMark as any)(content) : null;
  }

  /**
   * Get the AST root node
   */
  getRootNode(): any {
    return this.tm?.getRootNode?.() || null;
  }

  /**
   * Incrementally edit the markdown content
   * @param startLine 1-indexed line number
   * @param startCol 1-indexed column number
   * @param endLine 1-indexed line number
   * @param endCol 1-indexed column number
   * @param newText replacement text
   * @returns Array of changed nodes
   */
  editMarkdown(
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    newText: string,
  ): any[] {
    const result = this.tm.editMarkdown(
      [startLine, startCol],
      [endLine, endCol],
      newText,
    );
    // Update internal content tracking
    this.updateContent(startLine, startCol, endLine, endCol, newText);
    return result;
  }

  /**
   * Replace all content (full reparse)
   */
  setContent(content: string): void {
    this.content = content;
    this.tm = new ToastMark(content);
  }

  /**
   * Get current markdown content
   */
  getContent(): string {
    return this.content;
  }

  /**
   * Update internal content string after edit
   */
  private updateContent(
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    newText: string,
  ): void {
    const lines = this.content.split('\n');
    const startIdx =
      lines.slice(0, startLine - 1).join('\n').length +
      (startLine > 1 ? 1 : 0) +
      startCol -
      1;
    const endIdx =
      lines.slice(0, endLine - 1).join('\n').length +
      (endLine > 1 ? 1 : 0) +
      endCol -
      1;
    this.content =
      this.content.slice(0, startIdx) + newText + this.content.slice(endIdx);
  }
}

/**
 * Parse card inline syntax: $$card Label | ./path/to/card$$
 */
function parseCardInline(literal: string): { label: string; cardId: string } {
  const parts = literal.split('|').map((s) => s.trim());
  return {
    label: parts[0] || '',
    cardId: parts[1] || parts[0] || '',
  };
}

/**
 * Parse field inline syntax: $$field Label | FieldType | value$$
 */
function parseFieldInline(literal: string): {
  label: string;
  fieldType: string;
  data: string;
} {
  const parts = literal.split('|').map((s) => s.trim());
  return {
    label: parts[0] || '',
    fieldType: parts[1] || 'StringField',
    data: parts[2] || '',
  };
}

/**
 * Parse card block syntax (YAML-like attributes)
 */
function parseCardBlock(literal: string): {
  cardId: string;
  format: string;
  width?: number;
  height?: number;
} {
  const attrs: Record<string, string> = {};
  for (const line of literal.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) attrs[key] = value;
  }
  return {
    cardId: attrs.id || attrs.cardId || '',
    format: attrs.format || 'embedded',
    width: attrs.width ? parseInt(attrs.width) : undefined,
    height: attrs.height ? parseInt(attrs.height) : undefined,
  };
}

/**
 * Parse field block syntax with JSON data
 */
// eslint-disable-next-line no-unused-vars
function _parseFieldBlock(literal: string): {
  fieldType: string;
  module?: string;
  label?: string;
  format: string;
  data: any;
} {
  const lines = literal.split('\n');
  const attrs: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'data') {
      if (value) {
        attrs.data = value + '\n' + lines.slice(i + 1).join('\n');
      } else {
        attrs.data = lines.slice(i + 1).join('\n');
      }
      break;
    }
    attrs[key] = value;
  }

  let parsedData: any;
  try {
    parsedData = JSON.parse(attrs.data || '""');
  } catch {
    parsedData = attrs.data?.trim().replace(/^"|"$/g, '') || '';
  }

  return {
    fieldType: attrs.type || 'StringField',
    module: attrs.module,
    label: attrs.label,
    format: attrs.format || 'embedded',
    data: parsedData,
  };
}

/**
 * Convert ToastMark AST node to ProseMirror node
 */
function toastmarkToProseMirror(tmNode: any): any {
  const nodes: any[] = [];

  function convertInline(node: any): any[] {
    const result: any[] = [];

    let child = node.firstChild;
    while (child) {
      switch (child.type) {
        case 'text':
          result.push(schema.text(child.literal || ''));
          break;
        case 'softbreak':
          result.push(schema.text(' '));
          break;
        case 'linebreak':
          result.push(schema.nodes.hard_break.create());
          break;
        case 'strong':
          result.push(
            ...convertInline(child).map((n: any) =>
              n.isText
                ? schema.text(n.text, [
                    ...(n.marks || []),
                    schema.marks.strong.create(),
                  ])
                : n,
            ),
          );
          break;
        case 'emph':
          result.push(
            ...convertInline(child).map((n: any) =>
              n.isText
                ? schema.text(n.text, [
                    ...(n.marks || []),
                    schema.marks.em.create(),
                  ])
                : n,
            ),
          );
          break;
        case 'code':
          result.push(
            schema.text(child.literal || '', [schema.marks.code.create()]),
          );
          break;
        case 'link':
          result.push(
            ...convertInline(child).map((n: any) =>
              n.isText
                ? schema.text(n.text, [
                    ...(n.marks || []),
                    schema.marks.link.create({ href: child.destination }),
                  ])
                : n,
            ),
          );
          break;
        case 'image':
          result.push(
            schema.nodes.image.create({
              src: child.destination || '',
              alt: child.firstChild?.literal || '',
              title: child.title,
            }),
          );
          break;
        case 'customInline':
          if (child.info === 'card') {
            const { label, cardId } = parseCardInline(child.literal || '');
            result.push(schema.nodes.boxel_card_atom.create({ cardId, label }));
          } else if (child.info === 'field') {
            const { label, fieldType, data } = parseFieldInline(
              child.literal || '',
            );
            result.push(
              schema.nodes.boxel_field_atom.create({ fieldType, data, label }),
            );
          }
          break;
        default:
          if (child.literal) {
            result.push(schema.text(child.literal));
          }
      }
      child = child.next;
    }

    return result;
  }

  function convertBlock(node: any): any {
    switch (node.type) {
      case 'document': {
        let docChild = node.firstChild;
        while (docChild) {
          const converted = convertBlock(docChild);
          if (converted) nodes.push(converted);
          docChild = docChild.next;
        }
        return null;
      }

      case 'paragraph': {
        return schema.node('paragraph', null, convertInline(node));
      }

      case 'heading': {
        return schema.node(
          'heading',
          { level: node.level },
          convertInline(node),
        );
      }

      case 'blockQuote': {
        const quoteContent: any[] = [];
        let quoteChild = node.firstChild;
        while (quoteChild) {
          const converted = convertBlock(quoteChild);
          if (converted) quoteContent.push(converted);
          quoteChild = quoteChild.next;
        }
        return schema.node('blockquote', null, quoteContent);
      }

      case 'codeBlock': {
        const codeText = node.literal || '';
        return schema.node(
          'code_block',
          null,
          codeText ? [schema.text(codeText)] : [],
        );
      }

      case 'list': {
        const items: any[] = [];
        let listItem = node.firstChild;
        while (listItem) {
          const itemContent: any[] = [];
          let itemChild = listItem.firstChild;
          while (itemChild) {
            const converted = convertBlock(itemChild);
            if (converted) itemContent.push(converted);
            itemChild = itemChild.next;
          }
          // Check for task list
          const checked = listItem.listData?.task
            ? listItem.listData.checked
            : null;
          items.push(schema.node('list_item', { checked }, itemContent));
          listItem = listItem.next;
        }
        const listType =
          node.listData?.type === 'ordered' ? 'ordered_list' : 'bullet_list';
        return schema.node(listType, null, items);
      }

      case 'thematicBreak': {
        return schema.node('horizontal_rule');
      }

      case 'table': {
        const rows: any[] = [];
        let tableChild = node.firstChild;
        let isHeader = true;
        while (tableChild) {
          if (
            tableChild.type === 'tableHead' ||
            tableChild.type === 'tableBody'
          ) {
            let row = tableChild.firstChild;
            while (row) {
              const cells: any[] = [];
              let cell = row.firstChild;
              while (cell) {
                const cellType = isHeader ? 'table_header' : 'table_cell';
                cells.push(
                  schema.nodes[cellType].create(null, convertInline(cell)),
                );
                cell = cell.next;
              }
              rows.push(schema.node('table_row', null, cells));
              row = row.next;
            }
            if (tableChild.type === 'tableHead') isHeader = false;
          }
          tableChild = tableChild.next;
        }
        return schema.node('table', null, rows);
      }

      case 'customBlock':
        if (node.info === 'card') {
          const { cardId, format, width, height } = parseCardBlock(
            node.literal || '',
          );
          return schema.nodes.boxel_card_block.create({
            cardId,
            format,
            width,
            height,
          });
        }
        return null;

      default:
        return null;
    }
  }

  convertBlock(tmNode);
  return nodes.length > 0
    ? schema.node('doc', null, nodes)
    : schema.node('doc', null, [schema.node('paragraph')]);
}

/**
 * Convert ProseMirror document to ToastMark-compatible markdown
 * Uses new $$ syntax for card/field directives
 */
// eslint-disable-next-line no-unused-vars
function _proseMirrorToToastMark(doc: any): string {
  const blocks: string[] = [];

  function serializeInline(node: any): string {
    let result = '';
    node.forEach((child: any) => {
      if (child.isText) {
        let text = child.text;
        child.marks.forEach((mark: any) => {
          switch (mark.type.name) {
            case 'strong':
              text = `**${text}**`;
              break;
            case 'em':
              text = `*${text}*`;
              break;
            case 'code':
              text = `\`${text}\``;
              break;
            case 'link':
              text = `[${text}](${mark.attrs.href})`;
              break;
          }
        });
        result += text;
      } else if (child.type.name === 'hard_break') {
        result += '  \n';
      } else if (child.type.name === 'image') {
        result += `![${child.attrs.alt || ''}](${child.attrs.src || ''})`;
      } else if (child.type.name === 'boxel_card_atom') {
        // New ToastMark syntax: $$card Label | cardId$$
        result += `$$card ${child.attrs.label} | ${child.attrs.cardId}$$`;
      } else if (child.type.name === 'boxel_field_atom') {
        result += `$$field ${child.attrs.label} | ${child.attrs.fieldType} | ${child.attrs.data}$$`;
      }
    });
    return result;
  }

  function serializeNode(node: any): string {
    switch (node.type.name) {
      case 'paragraph':
        return serializeInline(node);
      case 'heading':
        return '#'.repeat(node.attrs.level) + ' ' + serializeInline(node);
      case 'horizontal_rule':
        return '---';
      case 'blockquote': {
        const lines: string[] = [];
        node.forEach((child: any) => {
          lines.push('> ' + serializeNode(child));
        });
        return lines.join('\n');
      }
      case 'code_block':
        return '```\n' + node.textContent + '\n```';
      case 'bullet_list': {
        const items: string[] = [];
        node.forEach((item: any) => {
          const checked = item.attrs.checked;
          const prefix =
            checked === true ? '- [x] ' : checked === false ? '- [ ] ' : '- ';
          item.forEach((child: any, _: any, i: number) => {
            if (i === 0) {
              items.push(prefix + serializeInline(child));
            } else {
              items.push('  ' + serializeNode(child));
            }
          });
        });
        return items.join('\n');
      }
      case 'ordered_list': {
        const items: string[] = [];
        let num = node.attrs.order || 1;
        node.forEach((item: any) => {
          item.forEach((child: any, _: any, i: number) => {
            if (i === 0) {
              items.push(`${num}. ` + serializeInline(child));
            } else {
              items.push('   ' + serializeNode(child));
            }
          });
          num++;
        });
        return items.join('\n');
      }
      case 'table': {
        const rows: string[] = [];
        let isFirstRow = true;
        node.forEach((row: any) => {
          const cells: string[] = [];
          row.forEach((cell: any) => {
            cells.push(serializeInline(cell));
          });
          rows.push('| ' + cells.join(' | ') + ' |');
          if (isFirstRow) {
            rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
            isFirstRow = false;
          }
        });
        return rows.join('\n');
      }
      case 'boxel_card_block': {
        // New ToastMark block syntax
        const { cardId, format, width, height } = node.attrs;
        let block = '$$card\n';
        block += `id: ${cardId}\n`;
        block += `format: ${format}\n`;
        if (width) block += `width: ${width}\n`;
        if (height) block += `height: ${height}\n`;
        block += '$$';
        return block;
      }
      default:
        return node.textContent || '';
    }
  }

  doc.forEach((node: any) => {
    blocks.push(serializeNode(node));
  });

  return blocks.join('\n\n');
}

/**
 * Parse markdown using ToastMark and convert to ProseMirror document
 */
// eslint-disable-next-line no-unused-vars
function _parseWithToastMark(markdown: string): any {
  if (!markdown || markdown.trim() === '') {
    return schema.node('doc', null, [schema.node('paragraph')]);
  }

  const parser = new MarkdownParserService(markdown);
  const root = parser.getRootNode();
  return toastmarkToProseMirror(root);
}

// =============================================================================
// Helper: Serialize to Markdown with inline formatting
// =============================================================================
function serializeToMarkdown(doc: any): string {
  const blocks: string[] = [];

  // Serialize inline content with marks
  function serializeInline(node: any): string {
    let result = '';
    node.forEach((child: any) => {
      if (child.isText) {
        let text = child.text;
        // Apply marks in order
        child.marks.forEach((mark: any) => {
          switch (mark.type.name) {
            case 'strong':
              text = `**${text}**`;
              break;
            case 'em':
              text = `*${text}*`;
              break;
            case 'code':
              text = `\`${text}\``;
              break;
            case 'link':
              text = `[${text}](${mark.attrs.href})`;
              break;
          }
        });
        result += text;
      } else if (child.type.name === 'hard_break') {
        result += '  \n';
      } else if (child.type.name === 'image') {
        const alt = child.attrs.alt || '';
        const src = child.attrs.src || '';
        result += `![${alt}](${src})`;
      } else if (child.type.name === 'boxel_card_atom') {
        // :card[Label]{id=cardId}
        result += `:card[${child.attrs.label}]{id=${child.attrs.cardId}}`;
      } else if (child.type.name === 'boxel_field_atom') {
        // :field[Label]{type=Type data='json'}
        result += `:field[${child.attrs.label}]{type=${child.attrs.fieldType} data='${child.attrs.data}'}`;
      }
    });
    return result;
  }

  function serializeNode(node: any): string {
    switch (node.type.name) {
      case 'paragraph':
        return serializeInline(node);
      case 'heading':
        return '#'.repeat(node.attrs.level) + ' ' + serializeInline(node);
      case 'horizontal_rule':
        return '---';
      case 'blockquote': {
        const quoteLines: string[] = [];
        node.forEach((child: any) => {
          quoteLines.push('> ' + serializeNode(child));
        });
        return quoteLines.join('\n');
      }
      case 'code_block':
        return '```\n' + node.textContent + '\n```';
      case 'bullet_list': {
        const items: string[] = [];
        node.forEach((item: any) => {
          const checked = item.attrs.checked;
          const prefix =
            checked === true ? '- [x] ' : checked === false ? '- [ ] ' : '- ';
          item.forEach((child: any, _: any, i: number) => {
            if (i === 0) {
              items.push(prefix + serializeInline(child));
            } else {
              items.push('  ' + serializeNode(child));
            }
          });
        });
        return items.join('\n');
      }
      case 'ordered_list': {
        const items: string[] = [];
        let num = node.attrs.order || 1;
        node.forEach((item: any) => {
          item.forEach((child: any, _: any, i: number) => {
            if (i === 0) {
              items.push(`${num}. ` + serializeInline(child));
            } else {
              items.push('   ' + serializeNode(child));
            }
          });
          num++;
        });
        return items.join('\n');
      }
      case 'table': {
        const rows: string[] = [];
        let isFirstRow = true;
        node.forEach((row: any) => {
          const cells: string[] = [];
          row.forEach((cell: any) => {
            cells.push(serializeInline(cell));
          });
          rows.push('| ' + cells.join(' | ') + ' |');

          // Add separator after header row
          if (isFirstRow) {
            const sep = cells.map(() => '---').join(' | ');
            rows.push('| ' + sep + ' |');
            isFirstRow = false;
          }
        });
        return rows.join('\n');
      }
      case 'boxel_card_block': {
        // Embedded: ::card{id=cardId format=embedded size=medium}
        // Fitted: ::card{id=cardId format=fitted width=320 height=200}
        const { cardId, format, size, width, height } = node.attrs;
        if (format === 'fitted') {
          return `::card{id=${cardId} format=fitted width=${width} height=${height}}`;
        }
        return `::card{id=${cardId} format=${format} size=${size || 'full'}}`;
      }
      default:
        return node.textContent || '';
    }
  }

  doc.forEach((node: any) => {
    blocks.push(serializeNode(node));
  });

  return blocks.join('\n\n');
}

// Alias for backwards compatibility
const serializeToPlainText = serializeToMarkdown;

// =============================================================================
// Helper: Parse Markdown to ProseMirror document
// =============================================================================
function parseFromMarkdown(text: string): any {
  if (!text || text.trim() === '') {
    return schema.node('doc', null, [schema.node('paragraph')]);
  }

  // Parse inline markdown to array of text nodes with marks
  function parseInline(text: string): any[] {
    const nodes: any[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      // Image: ![alt](url) - must check before link
      const imageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (imageMatch) {
        const alt = imageMatch[1];
        const src = imageMatch[2];
        nodes.push(schema.nodes.image.create({ src, alt }));
        remaining = remaining.slice(imageMatch[0].length);
        continue;
      }

      // Link: [text](url)
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const href = linkMatch[2];
        nodes.push(schema.text(linkText, [schema.marks.link.create({ href })]));
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // Bold: **text**
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        nodes.push(schema.text(boldMatch[1], [schema.marks.strong.create()]));
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic: *text*
      const italicMatch = remaining.match(/^\*([^*]+)\*/);
      if (italicMatch) {
        nodes.push(schema.text(italicMatch[1], [schema.marks.em.create()]));
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Code: `text`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        nodes.push(schema.text(codeMatch[1], [schema.marks.code.create()]));
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Card atom: :card[Label]{id=cardId}
      const cardAtomMatch = remaining.match(
        /^:card\[([^\]]*)\]\{id=([^}\s]+)\}/,
      );
      if (cardAtomMatch) {
        const label = cardAtomMatch[1];
        const cardId = cardAtomMatch[2];
        nodes.push(schema.nodes.boxel_card_atom.create({ cardId, label }));
        remaining = remaining.slice(cardAtomMatch[0].length);
        continue;
      }

      // Field atom: :field[Label]{type=Type data='json'}
      const fieldAtomMatch = remaining.match(
        /^:field\[([^\]]*)\]\{type=([^\s}]+)\s+data='([^']*)'\}/,
      );
      if (fieldAtomMatch) {
        const label = fieldAtomMatch[1];
        const fieldType = fieldAtomMatch[2];
        const data = fieldAtomMatch[3];
        nodes.push(
          schema.nodes.boxel_field_atom.create({ fieldType, data, label }),
        );
        remaining = remaining.slice(fieldAtomMatch[0].length);
        continue;
      }

      // Plain text until next special char (added : for directives)
      const plainMatch = remaining.match(/^[^*`[!:]+/);
      if (plainMatch) {
        nodes.push(schema.text(plainMatch[0]));
        remaining = remaining.slice(plainMatch[0].length);
        continue;
      }

      // Single special char that didn't match a pattern
      nodes.push(schema.text(remaining[0]));
      remaining = remaining.slice(1);
    }

    return nodes.length > 0 ? nodes : [];
  }

  const blocks: any[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line - skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      blocks.push(schema.node('horizontal_rule'));
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const codeText = codeLines.join('\n');
      blocks.push(
        schema.node(
          'code_block',
          null,
          codeText ? [schema.text(codeText)] : [],
        ),
      );
      continue;
    }

    // Heading - trim leading whitespace before matching
    const headingMatch = line.trim().match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = parseInline(headingMatch[2]);
      blocks.push(schema.node('heading', { level }, content));
      i++;
      continue;
    }

    // Block card: ::card{id=... format=... size=...} or ::card{id=... format=fitted width=... height=...}
    const blockCardMatch = line.trim().match(/^::card\{([^}]+)\}/);
    if (blockCardMatch) {
      const attrsStr = blockCardMatch[1];
      // Parse attributes
      const idMatch = attrsStr.match(/id=([^\s}]+)/);
      const formatMatch = attrsStr.match(/format=([^\s}]+)/);
      const sizeMatch = attrsStr.match(/size=([^\s}]+)/);
      const widthMatch = attrsStr.match(/width=(\d+)/);
      const heightMatch = attrsStr.match(/height=(\d+)/);

      const format = formatMatch?.[1] || 'embedded';
      // Size presets: full (100%), large (640px), medium (480px), small (320px)
      const size = sizeMatch?.[1] || 'full';

      blocks.push(
        schema.nodes.boxel_card_block.create({
          cardId: idMatch?.[1] || '',
          format,
          size,
          width: widthMatch ? parseInt(widthMatch[1]) : 320,
          height: heightMatch ? parseInt(heightMatch[1]) : 200,
        }),
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      const quoteContent = parseInline(quoteLines.join('\n'));
      blocks.push(
        schema.node('blockquote', null, [
          schema.node('paragraph', null, quoteContent),
        ]),
      );
      continue;
    }

    // Bullet list (including task lists)
    if (/^[-*+]\s/.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        let itemText = lines[i].replace(/^[-*+]\s/, '');
        let checked: boolean | null = null;

        // Check for task list syntax: [ ] or [x]
        const taskMatch = itemText.match(/^\[([ xX])\]\s*/);
        if (taskMatch) {
          checked = taskMatch[1].toLowerCase() === 'x';
          itemText = itemText.slice(taskMatch[0].length);
        }

        const itemContent = parseInline(itemText);
        items.push(
          schema.node('list_item', { checked }, [
            schema.node('paragraph', null, itemContent),
          ]),
        );
        i++;
      }
      blocks.push(schema.node('bullet_list', null, items));
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: any[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s/, '');
        const itemContent = parseInline(itemText);
        items.push(
          schema.node('list_item', null, [
            schema.node('paragraph', null, itemContent),
          ]),
        );
        i++;
      }
      blocks.push(schema.node('ordered_list', null, items));
      continue;
    }

    // Table: starts with | and has at least one |
    if (line.startsWith('|') && line.includes('|', 1)) {
      const tableRows: any[] = [];
      let isHeader = true;

      while (i < lines.length && lines[i].startsWith('|')) {
        const rowLine = lines[i];

        // Skip separator row (| --- | --- |)
        if (/^\|[\s\-:|]+\|$/.test(rowLine)) {
          i++;
          continue;
        }

        // Parse cells
        const cellTexts = rowLine
          .slice(1, -1) // remove leading/trailing |
          .split('|')
          .map((c) => c.trim());

        const cells = cellTexts.map((text) => {
          const content = parseInline(text);
          const nodeType = isHeader
            ? schema.nodes.table_header
            : schema.nodes.table_cell;
          return nodeType.create(null, content);
        });

        if (cells.length > 0) {
          tableRows.push(schema.node('table_row', null, cells));
          isHeader = false;
        }
        i++;
      }

      if (tableRows.length > 0) {
        blocks.push(schema.node('table', null, tableRows));
      }
      continue;
    }

    // Regular paragraph
    const content = parseInline(line);
    blocks.push(schema.node('paragraph', null, content));
    i++;
  }

  return schema.node(
    'doc',
    null,
    blocks.length > 0 ? blocks : [schema.node('paragraph')],
  );
}

// Alias for backwards compatibility
const parseFromPlainText = parseFromMarkdown;

// =============================================================================
// Helper: Convert Markdown to HTML for read-only display
// =============================================================================
function markdownToHtml(text: string): string {
  if (!text || text.trim() === '') return '';

  // Escape HTML entities first
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = text.split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      html.push('<hr>');
      i++;
      continue;
    }

    // Container card directive: :::card{id=N format=X} ... :::
    if (line.trim().startsWith(':::card{')) {
      const attrsMatch = line.match(/:::card\{([^}]+)\}/);
      if (attrsMatch) {
        const attrsStr = attrsMatch[1];
        const idMatch = attrsStr.match(/id=([^\s}]+)/);
        const formatMatch = attrsStr.match(/format=([^\s}]+)/);
        const cardId = idMatch?.[1] || '0';
        const format = formatMatch?.[1] || 'isolated';
        html.push(
          `<div class="boxel-card-container" data-card-id="${cardId}" data-format="${format}">` +
            `<div class="card-placeholder">[Card ${cardId} - ${format}]</div>` +
            `</div>`,
        );
        // Skip until closing :::
        i++;
        while (i < lines.length && lines[i].trim() !== ':::') {
          i++;
        }
        i++; // skip closing :::
        continue;
      }
    }

    // Block card directive: ::card{id=N format=X}
    if (line.trim().startsWith('::card{')) {
      const attrsMatch = line.match(/::card\{([^}]+)\}/);
      if (attrsMatch) {
        const attrsStr = attrsMatch[1];
        const idMatch = attrsStr.match(/id=([^\s}]+)/);
        const formatMatch = attrsStr.match(/format=([^\s}]+)/);
        const cardId = idMatch?.[1] || '0';
        const format = formatMatch?.[1] || 'embedded';
        html.push(
          `<div class="boxel-card-block" data-card-id="${cardId}" data-format="${format}">` +
            `<div class="card-placeholder">[Card ${cardId} - ${format}]</div>` +
            `</div>`,
        );
        i++;
        continue;
      }
    }

    // Code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(escape(lines[i]));
        i++;
      }
      i++; // skip closing ```
      html.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2]);
      html.push(`<h${level}>${content}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      html.push(
        `<blockquote><p>${renderInline(quoteLines.join(' '))}</p></blockquote>`,
      );
      continue;
    }

    // Bullet list (including task lists)
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      let hasTaskItems = false;
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        let itemText = lines[i].replace(/^[-*+]\s/, '');
        const taskMatch = itemText.match(/^\[([ xX])\]\s*/);
        if (taskMatch) {
          hasTaskItems = true;
          const checked = taskMatch[1].toLowerCase() === 'x';
          itemText = itemText.slice(taskMatch[0].length);
          const checkbox = `<input type="checkbox" ${checked ? 'checked' : ''} disabled>`;
          items.push(
            `<li class="task-item">${checkbox} ${renderInline(itemText)}</li>`,
          );
        } else {
          items.push(`<li>${renderInline(itemText)}</li>`);
        }
        i++;
      }
      const listClass = hasTaskItems ? ' class="task-list"' : '';
      html.push(`<ul${listClass}>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(
          `<li>${renderInline(lines[i].replace(/^\d+\.\s/, ''))}</li>`,
        );
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Table
    if (line.startsWith('|') && line.includes('|', 1)) {
      const rows: string[] = [];
      let isHeader = true;

      while (i < lines.length && lines[i].startsWith('|')) {
        const rowLine = lines[i];

        // Skip separator row
        if (/^\|[\s\-:|]+\|$/.test(rowLine)) {
          i++;
          continue;
        }

        const cellTexts = rowLine
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        const tag = isHeader ? 'th' : 'td';
        const cells = cellTexts
          .map((text) => `<${tag}>${renderInline(text)}</${tag}>`)
          .join('');
        rows.push(`<tr>${cells}</tr>`);
        isHeader = false;
        i++;
      }

      if (rows.length > 0) {
        html.push(`<table><tbody>${rows.join('')}</tbody></table>`);
      }
      continue;
    }

    // Block card: ::card{id=... format=... width=... height=...} (allow leading whitespace)
    const blockCardMatch = line.trim().match(/^::card\{([^}]+)\}/);
    if (blockCardMatch) {
      const attrsStr = blockCardMatch[1];
      const idMatch = attrsStr.match(/id=([^\s}]+)/);
      const formatMatch = attrsStr.match(/format=([^\s}]+)/);
      const widthMatch = attrsStr.match(/width=(\d+)/);
      const heightMatch = attrsStr.match(/height=(\d+)/);
      const cardId = idMatch?.[1] || '';
      const format = formatMatch?.[1] || 'embedded';
      const width = widthMatch ? widthMatch[1] : '320';
      const height = heightMatch ? heightMatch[1] : '200';
      // Output a slot element that will be replaced with actual card render
      html.push(
        `<div class="boxel-card-slot boxel-card-slot-block" data-card-id="${escape(cardId)}" data-format="${format}" style="width:${width}px;height:${height}px;">` +
          `<div class="slot-fallback">` +
          `<div class="card-block-header"><span class="card-icon">📄</span><span class="card-format">${format}</span></div>` +
          `<div class="card-block-id">${escape(cardId)}</div>` +
          `</div></div>`,
      );
      i++;
      continue;
    }

    // Paragraph
    html.push(`<p>${renderInline(line)}</p>`);
    i++;
  }

  // Render inline markdown (bold, italic, code, links, images, card/field atoms)
  function renderInline(text: string): string {
    let result = escape(text);

    // Card atoms: :card[Label]{id=cardId} - render as slot for card injection
    result = result.replace(
      /:card\[([^\]]*)\]\{id=([^}\s]+)\}/g,
      '<span class="boxel-card-slot" data-card-id="$2" data-format="atom" data-label="$1">' +
        '<span class="slot-fallback">' +
        '<span class="atom-icon">📄</span>' +
        '<span class="atom-label">$1</span>' +
        '</span>' +
        '</span>',
    );

    // Field atoms: :field[Label]{type=Type data='json'}
    result = result.replace(
      /:field\[([^\]]*)\]\{type=([^\s}]+)\s+data='([^]*)'\}/g,
      '<span class="boxel-field-atom">' +
        '<span class="atom-icon">📊</span>' +
        '<span class="atom-label">$1</span>' +
        '</span>',
    );

    // Images: ![alt](url) - must be before links
    result = result.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" class="inline-image">',
    );

    // Links: [text](url)
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );

    // Bold: **text** or __text__
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Inline code: `text`
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

    return result;
  }

  return html.join('');
}

// =============================================================================
// Helper: Extract card references from markdown
// Returns an array of { id, format, slotId } for each card embed
// =============================================================================
interface CardRef {
  id: string;
  format: 'atom' | 'embedded' | 'fitted';
  slotId: string;
  label?: string;
}

// eslint-disable-next-line no-unused-vars
function _extractCardRefs(text: string): CardRef[] {
  if (!text) return [];

  const refs: CardRef[] = [];
  let slotCounter = 0;

  // Inline card atoms: :card[Label]{id=cardId}
  const atomRegex = /:card\[([^\]]*)\]\{id=([^}\s]+)\}/g;
  let match;
  while ((match = atomRegex.exec(text)) !== null) {
    refs.push({
      id: match[2],
      format: 'atom',
      slotId: `card-slot-${slotCounter++}`,
      label: match[1],
    });
  }

  // Block cards: ::card{id=... format=...}
  const blockRegex = /::card\{([^}]+)\}/g;
  while ((match = blockRegex.exec(text)) !== null) {
    const attrsStr = match[1];
    const idMatch = attrsStr.match(/id=([^\s}]+)/);
    const formatMatch = attrsStr.match(/format=([^\s}]+)/);
    if (idMatch) {
      refs.push({
        id: idMatch[1],
        format: (formatMatch?.[1] as 'embedded' | 'fitted') || 'embedded',
        slotId: `card-slot-${slotCounter++}`,
      });
    }
  }

  return refs;
}

// Helper: Resolve relative card URLs to absolute URLs
// eslint-disable-next-line no-unused-vars
function _resolveCardUrl(cardId: string, realmUrl: string): string {
  if (cardId.startsWith('http://') || cardId.startsWith('https://')) {
    return cardId;
  }
  // Handle relative paths like ./Person/jamie-chen
  if (cardId.startsWith('./')) {
    return new URL(cardId.slice(2), realmUrl).href;
  }
  // Handle paths without ./ prefix
  return new URL(cardId, realmUrl).href;
}

// =============================================================================
// ProseMirror Modifier - Using stable ID-based storage
// The editor state persists in a global map keyed by field ID.
// =============================================================================
interface ProseMirrorModifierArgs {
  positional: [];
  named: {
    editorId: string;
    initialContent: string;
    onSave: (text: string) => void;
    onSlotCreated?: (
      slotId: string,
      element: HTMLElement,
      cardIndex: number,
      format: string,
    ) => void;
    onSlotDestroyed?: (slotId: string) => void;
  };
}

// Global editor state storage - stores SERIALIZED text (not doc objects)
const editorStateStorage = new Map<
  string,
  {
    currentText: string;
    savedText: string;
  }
>();

// Global editor view storage - for toolbar access
const editorViewStorage = new Map<string, any>();

// Get editor view by ID (for toolbar commands)
function getEditorView(editorId: string): any {
  return editorViewStorage.get(editorId);
}

// Toolbar command helpers
function runCommand(
  editorId: string,
  command: (state: any, dispatch: any) => boolean,
): void {
  const view = getEditorView(editorId);
  if (view) {
    command(view.state, view.dispatch);
    view.focus();
  }
}

function toggleMarkCommand(editorId: string, markType: any): void {
  runCommand(editorId, toggleMark(markType));
}

function setHeadingCommand(editorId: string, level: number): void {
  const view = getEditorView(editorId);
  if (view) {
    const command = setBlockType(schema.nodes.heading, { level });
    command(view.state, view.dispatch);
    view.focus();
  }
}

function setParagraphCommand(editorId: string): void {
  const view = getEditorView(editorId);
  if (view) {
    const command = setBlockType(schema.nodes.paragraph);
    command(view.state, view.dispatch);
    view.focus();
  }
}

function insertHorizontalRule(editorId: string): void {
  const view = getEditorView(editorId);
  if (view) {
    const { tr } = view.state;
    const hr = schema.nodes.horizontal_rule.create();
    view.dispatch(tr.replaceSelectionWith(hr));
    view.focus();
  }
}

function toggleLinkCommand(editorId: string): void {
  const view = getEditorView(editorId);
  if (!view) return;

  const { from, to } = view.state.selection;
  const linkMark = schema.marks.link;

  // Check if already has link - if so, remove it
  const hasLink = view.state.doc.rangeHasMark(from, to, linkMark);
  if (hasLink) {
    view.dispatch(view.state.tr.removeMark(from, to, linkMark));
    view.focus();
    return;
  }

  // Prompt for URL
  const href = prompt('Enter URL:');
  if (!href) return;

  const mark = linkMark.create({ href });
  if (from === to) {
    // No selection - insert link text
    const text = prompt('Enter link text:', href) || href;
    view.dispatch(
      view.state.tr
        .insertText(text, from)
        .addMark(from, from + text.length, mark),
    );
  } else {
    view.dispatch(view.state.tr.addMark(from, to, mark));
  }
  view.focus();
}

function insertImageCommand(editorId: string): void {
  const view = getEditorView(editorId);
  if (!view) return;

  // Prompt for image URL
  const src = prompt('Enter image URL:');
  if (!src) return;

  // Prompt for alt text
  const alt = prompt('Enter alt text (optional):', '') || '';

  const { from: insertPos } = view.state.selection;
  const imageNode = schema.nodes.image.create({ src, alt });
  view.dispatch(view.state.tr.insert(insertPos, imageNode));
  view.focus();
}

function insertTableCommand(editorId: string): void {
  const view = getEditorView(editorId);
  if (!view) return;

  // Create a 3x3 table with header row
  const headerCells = [
    schema.nodes.table_header.create(null, [schema.text('Header 1')]),
    schema.nodes.table_header.create(null, [schema.text('Header 2')]),
    schema.nodes.table_header.create(null, [schema.text('Header 3')]),
  ];
  const headerRow = schema.node('table_row', null, headerCells);

  const rows = [headerRow];
  for (let r = 0; r < 2; r++) {
    const cells = [
      schema.nodes.table_cell.create(null, [schema.text('Cell')]),
      schema.nodes.table_cell.create(null, [schema.text('Cell')]),
      schema.nodes.table_cell.create(null, [schema.text('Cell')]),
    ];
    rows.push(schema.node('table_row', null, cells));
  }

  const table = schema.node('table', null, rows);
  view.dispatch(view.state.tr.replaceSelectionWith(table));
  view.focus();
}

function insertCardAtomCommand(editorId: string): void {
  const view = getEditorView(editorId);
  if (!view) return;

  // Prompt for card URL/ID
  const cardId = prompt('Enter card URL or ID:');
  if (!cardId) return;

  // Prompt for display label
  const label =
    prompt('Enter display label:', cardId.split('/').pop() || cardId) || cardId;

  const node = schema.nodes.boxel_card_atom.create({ cardId, label });
  view.dispatch(view.state.tr.replaceSelectionWith(node));
  view.focus();
}

function insertCardBlockCommand(editorId: string): void {
  const view = getEditorView(editorId);
  if (!view) return;

  // Prompt for card URL/ID
  const cardId = prompt('Enter card URL or ID:');
  if (!cardId) return;

  // Prompt for dimensions
  const widthStr = prompt('Enter width (px):', '320');
  const heightStr = prompt('Enter height (px):', '200');
  const width = parseInt(widthStr || '320') || 320;
  const height = parseInt(heightStr || '200') || 200;

  const node = schema.nodes.boxel_card_block.create({
    cardId,
    format: 'fitted',
    width,
    height,
  });
  view.dispatch(view.state.tr.replaceSelectionWith(node));
  view.focus();
}

function toggleTaskListCommand(editorId: string): void {
  const view = getEditorView(editorId);
  if (!view) return;

  const { $from } = view.state.selection;

  // Find if we're in a list item
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type === schema.nodes.list_item) {
      const pos = $from.before(d);
      const currentChecked = node.attrs.checked;
      // Toggle: null -> false -> true -> null
      const newChecked =
        currentChecked === null
          ? false
          : currentChecked === false
            ? true
            : null;
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, { checked: newChecked }),
      );
      view.focus();
      return;
    }
  }

  // Not in a list - create a new task list
  const listItem = schema.nodes.list_item.create({ checked: false }, [
    schema.node('paragraph', null, []),
  ]);
  const list = schema.nodes.bullet_list.create(null, [listItem]);
  view.dispatch(view.state.tr.replaceSelectionWith(list));
  view.focus();
}

// Debounce delay for auto-save (ms)
const AUTO_SAVE_DELAY = 500;

class ProseMirrorModifier extends Modifier<ProseMirrorModifierArgs> {
  private editorView: any = null;
  private element: HTMLElement | null = null;
  private editorId: string | null = null;
  private onSaveCallback: ((text: string) => void) | null = null;
  private onSlotCreated:
    | ((
        slotId: string,
        element: HTMLElement,
        cardIndex: number,
        format: string,
      ) => void)
    | null = null;
  private onSlotDestroyed: ((slotId: string) => void) | null = null;
  private saveTimer: number | null = null;
  private lastInitialContent: string | null = null;
  private slotCounter = 0;

  constructor(owner: any, args: any) {
    super(owner, args);
    registerDestructor(this, () => {
      this.cleanup();
    });
  }

  modify(
    element: HTMLElement,
    _positional: [],
    named: ProseMirrorModifierArgs['named'],
  ) {
    const { editorId, initialContent, onSave, onSlotCreated, onSlotDestroyed } =
      named;
    this.element = element;
    this.editorId = editorId;
    this.onSaveCallback = onSave;
    this.onSlotCreated = onSlotCreated || null;
    this.onSlotDestroyed = onSlotDestroyed || null;

    // Check for stored state from a previous incarnation
    const stored = editorStateStorage.get(editorId);

    // Detect external content change (server update)
    const externalContentChanged =
      this.lastInitialContent !== null &&
      initialContent !== this.lastInitialContent &&
      initialContent !== stored?.savedText;

    // If editor exists and no external change, keep it
    if (
      this.editorView &&
      element.contains(this.editorView.dom) &&
      !externalContentChanged
    ) {
      return;
    }

    // If external content changed, destroy old editor
    if (this.editorView && externalContentChanged) {
      this.editorView.destroy();
      this.editorView = null;
      editorStateStorage.delete(editorId);
    }

    // Clear element before creating editor
    element.innerHTML = '';

    // Use stored text ONLY if it matches what we last saved (no external changes)
    // If initialContent differs from savedText, external source has new content - use it
    let textToLoad: string;
    if (
      stored &&
      stored.savedText === initialContent &&
      !externalContentChanged
    ) {
      // No external changes - use current editor state (may have unsaved edits)
      textToLoad = stored.currentText;
    } else {
      // External content changed (or first load) - use initialContent
      textToLoad = initialContent ?? '';
      // Clear old storage
      editorStateStorage.delete(editorId);
    }

    // Track for next comparison
    this.lastInitialContent = initialContent ?? '';

    // Parse text fresh each time (avoids version mismatch)
    const doc = parseFromPlainText(textToLoad);

    // Link command - prompts for URL and wraps selection
    function toggleLink(state: any, dispatch: any) {
      const { from, to, empty } = state.selection;
      const linkMark = schema.marks.link;

      // Check if already has link - if so, remove it
      const hasLink = state.doc.rangeHasMark(from, to, linkMark);
      if (hasLink) {
        if (dispatch) {
          dispatch(state.tr.removeMark(from, to, linkMark));
        }
        return true;
      }

      // Prompt for URL
      const href = prompt('Enter URL:');
      if (!href) return false;

      if (dispatch) {
        const mark = linkMark.create({ href });
        if (empty) {
          // No selection - insert link text
          const text = prompt('Enter link text:', href) || href;
          dispatch(
            state.tr
              .insertText(text, from)
              .addMark(from, from + text.length, mark),
          );
        } else {
          dispatch(state.tr.addMark(from, to, mark));
        }
      }
      return true;
    }

    // Build keyboard shortcuts including formatting and blocks
    const formatKeymap = {
      'Mod-b': toggleMark(schema.marks.strong),
      'Mod-i': toggleMark(schema.marks.em),
      'Mod-`': toggleMark(schema.marks.code),
      'Mod-k': toggleLink,
      'Mod->': wrapIn(schema.nodes.blockquote),
      'Mod-Shift-\\': setBlockType(schema.nodes.code_block),
      'Mod-Shift-8': wrapInList(schema.nodes.bullet_list),
      'Mod-Shift-9': wrapInList(schema.nodes.ordered_list),
    };

    // List item keybindings
    const listKeymap = {
      Enter: splitListItem(schema.nodes.list_item),
      Tab: sinkListItem(schema.nodes.list_item),
      'Shift-Tab': liftListItem(schema.nodes.list_item),
    };

    // Table delete handling - Delete/Backspace should remove adjacent tables
    function deleteTableForward(state: any, dispatch: any): boolean {
      const { $cursor } = state.selection;
      if (!$cursor) return false;

      // Check if cursor is at end of a block and next sibling is a table
      const after = $cursor.after();
      const pos = $cursor.pos;
      if (after === pos) {
        // At end of parent - check next node at parent level
        const parent = $cursor.node(-1);
        const indexInParent = $cursor.index(-1);
        if (indexInParent < parent.childCount - 1) {
          const nextNode = parent.child(indexInParent + 1);
          if (nextNode.type === schema.nodes.table) {
            if (dispatch) {
              const nextPos = $cursor.after(-1);
              dispatch(state.tr.delete(nextPos, nextPos + nextNode.nodeSize));
            }
            return true;
          }
        }
      }

      // Also check if we're right before a table in the doc
      const nodeAfter = state.doc.nodeAt(pos);
      if (nodeAfter?.type === schema.nodes.table) {
        if (dispatch) {
          dispatch(state.tr.delete(pos, pos + nodeAfter.nodeSize));
        }
        return true;
      }

      return false;
    }

    function deleteTableBackward(state: any, dispatch: any): boolean {
      const { $cursor } = state.selection;
      if (!$cursor) return false;

      // Check if cursor is at start of a block and previous sibling is a table
      if ($cursor.parentOffset === 0) {
        // At start of parent - check previous node
        const parent = $cursor.node(-1);
        const indexInParent = $cursor.index(-1);
        if (indexInParent > 0) {
          const prevNode = parent.child(indexInParent - 1);
          if (prevNode.type === schema.nodes.table) {
            if (dispatch) {
              const prevStart = $cursor.before(-1) - prevNode.nodeSize;
              dispatch(
                state.tr.delete(prevStart, prevStart + prevNode.nodeSize),
              );
            }
            return true;
          }
        }
      }

      return false;
    }

    const tableKeymap = {
      Delete: deleteTableForward,
      Backspace: deleteTableBackward,
    };

    const state = EditorState.create({
      doc,
      schema,
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo }),
        keymap(formatKeymap),
        keymap(listKeymap),
        keymap(tableKeymap),
        keymap(baseKeymap),
      ],
    });

    const self = this;

    // Capture slot callbacks for nodeViews closure (they run in ProseMirror context)
    const slotCreatedCb = this.onSlotCreated;
    const slotDestroyedCb = this.onSlotDestroyed;
    let slotCounter = 0;

    this.editorView = new EditorView(element, {
      state,
      // Custom nodeViews for card embedding - register with Glimmer for {{in-element}}
      nodeViews: {
        boxel_card_block(node: any) {
          const slotId = `block-${slotCounter++}`;
          const cardIndex = parseInt(node.attrs.cardId, 10);
          const format = node.attrs.format || 'embedded';
          const size = node.attrs.size || 'full';

          // Create slot container
          const dom = document.createElement('div');
          dom.className = `openbox-card-slot openbox-card-slot-block format-${format} size-${size}`;
          dom.setAttribute('data-slot-id', slotId);
          dom.setAttribute('data-card-index', String(cardIndex));
          dom.setAttribute('data-format', format);
          dom.setAttribute('data-size', size);

          // Fitted format: explicit pixel dimensions
          // Embedded format: responsive size classes (CSS handles width)
          if (format === 'fitted') {
            const width = node.attrs.width ? `${node.attrs.width}px` : '320px';
            const height = node.attrs.height ? `${node.attrs.height}px` : '200px';
            dom.style.cssText = `width: ${width}; height: ${height};`;
          }
          // Embedded: no inline styles, CSS classes handle sizing

          // Container where {{in-element}} will render the card - transparent wrapper
          const cardContainer = document.createElement('div');
          cardContainer.className = 'card-render-target';
          cardContainer.style.cssText = 'display: contents;'; // Removes from layout
          dom.appendChild(cardContainer);

          // Register slot with Glimmer component
          if (slotCreatedCb) {
            setTimeout(
              () => slotCreatedCb(slotId, cardContainer, cardIndex, format),
              0,
            );
          }

          return {
            dom,
            stopEvent: () => true,
            ignoreMutation: () => true,
            destroy() {
              if (slotDestroyedCb) {
                slotDestroyedCb(slotId);
              }
            },
          };
        },
        boxel_card_atom(node: any) {
          const slotId = `atom-${slotCounter++}`;
          const cardIndex = parseInt(node.attrs.cardId, 10);
          const format = 'atom';

          // Create inline container - CSS will hide when empty
          const dom = document.createElement('span');
          dom.className = 'openbox-card-slot openbox-card-slot-atom';
          dom.setAttribute('data-slot-id', slotId);
          dom.setAttribute('data-card-index', String(cardIndex));
          dom.setAttribute('data-format', format);
          dom.setAttribute('data-label', node.attrs.label || '');
          // Start visible but empty - CSS handles visibility
          dom.style.cssText =
            'display: inline; margin: 0; padding: 0; border: none; background: none;';

          // Container where {{in-element}} will render the card
          const cardContainer = document.createElement('span');
          cardContainer.className = 'card-render-target';
          cardContainer.style.cssText = 'display: inline;';
          dom.appendChild(cardContainer);

          // Register slot with Glimmer component
          if (slotCreatedCb) {
            setTimeout(
              () => slotCreatedCb(slotId, cardContainer, cardIndex, format),
              0,
            );
          }

          return {
            dom,
            stopEvent: () => true,
            ignoreMutation: () => true,
            destroy() {
              if (slotDestroyedCb) {
                slotDestroyedCb(slotId);
              }
            },
          };
        },
      },
      dispatchTransaction(transaction: any) {
        if (!self.editorView) return;
        const newState = self.editorView.state.apply(transaction);
        self.editorView.updateState(newState);

        // Store and auto-save on doc changes
        if (transaction.docChanged && self.editorId) {
          const currentText = serializeToPlainText(newState.doc);
          const existing = editorStateStorage.get(self.editorId);
          editorStateStorage.set(self.editorId, {
            currentText,
            savedText: existing?.savedText ?? initialContent ?? '',
          });
          // Debounced auto-save
          self.scheduleAutoSave();
        }
      },
      // Handle paste: parse markdown from clipboard
      handlePaste(view: any, event: ClipboardEvent) {
        let text = event.clipboardData?.getData('text/plain');
        if (!text) return false;

        // Terminal copy cleanup
        let lines = text.split('\n');
        let nonEmptyLines = lines.filter((l) => l.trim().length > 0);

        if (nonEmptyLines.length > 0) {
          // 1. Dedent: if all non-empty lines have same leading whitespace, remove it
          const leadingSpaces = nonEmptyLines.map((l) => {
            const match = l.match(/^( +)/);
            return match ? match[1].length : 0;
          });
          const minIndent = Math.min(...leadingSpaces);
          if (minIndent > 0) {
            lines = lines.map((l) =>
              l.length >= minIndent ? l.slice(minIndent) : l,
            );
            text = lines.join('\n');
          }

          // 2. Right-pad removal: if most lines are same width (terminal width padding)
          // Be forgiving on first/last lines being off by a bit
          const lineLengths = lines.map((l) => l.length);
          const middleLines = lineLengths.slice(1, -1); // exclude first and last
          if (middleLines.length >= 2) {
            // Find most common length among middle lines
            const lengthCounts = new Map<number, number>();
            middleLines.forEach((len) => {
              lengthCounts.set(len, (lengthCounts.get(len) || 0) + 1);
            });
            let mostCommonLen = 0;
            let mostCommonCount = 0;
            lengthCounts.forEach((count, len) => {
              if (count > mostCommonCount) {
                mostCommonLen = len;
                mostCommonCount = count;
              }
            });

            // If 70%+ of middle lines share same length and it's longer than content needs
            if (
              mostCommonCount >= middleLines.length * 0.7 &&
              mostCommonLen > 20
            ) {
              // Check if lines have trailing spaces
              const hasTrailingSpaces = lines.some(
                (l) => l.length === mostCommonLen && l.endsWith(' '),
              );
              if (hasTrailingSpaces) {
                text = lines.map((l) => l.trimEnd()).join('\n');
              }
            }
          } else {
            // Few lines - just trim trailing spaces if they exist
            if (lines.some((l) => l.endsWith('  '))) {
              text = lines.map((l) => l.trimEnd()).join('\n');
            }
          }
        }

        // Check if text looks like markdown (has markdown syntax)
        const hasMarkdown =
          /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>/m.test(text) ||
          /\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)/.test(text);

        if (hasMarkdown) {
          event.preventDefault();

          // Parse as markdown
          const doc = parseFromMarkdown(text);

          // Get current selection
          const { from: selFrom, to: selTo } = view.state.selection;
          const tr = view.state.tr;

          // Delete selection first
          if (selFrom !== selTo) {
            tr.delete(selFrom, selTo);
          }

          // Find the position to insert at block level
          const $pos = tr.doc.resolve(tr.mapping.map(selFrom));

          // If we're in an empty paragraph at the start, replace the whole doc
          if (tr.doc.content.size <= 2) {
            // Document is empty or just has empty paragraph
            tr.replaceWith(0, tr.doc.content.size, doc.content);
          } else {
            // Insert each block from the parsed doc
            let insertPos = $pos.before($pos.depth) || from;
            doc.content.forEach((node: any) => {
              tr.insert(insertPos, node);
              insertPos += node.nodeSize;
            });
          }

          view.dispatch(tr);
          return true;
        }

        return false; // let default handling proceed
      },
    });

    // Also save on blur (immediate)
    this.editorView.dom.addEventListener('blur', () => {
      self.saveContentNow();
    });

    // Handle clicks on task list items (checkbox area)
    this.editorView.dom.addEventListener('mousedown', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const li = target.closest('li.task-item');
      if (!li || !self.editorView) return;

      // Check if click is in the checkbox area (left side)
      const rect = li.getBoundingClientRect();
      const clickX = event.clientX - rect.left;

      // Checkbox area is roughly first 28px
      if (clickX <= 28) {
        event.preventDefault(); // Prevent focus change
        event.stopPropagation();

        // Find the position of this list item in the document
        const pos = self.editorView.posAtDOM(li, 0);
        if (pos === null) return;

        const $pos = self.editorView.state.doc.resolve(pos);

        // Walk up to find the list_item node
        for (let d = $pos.depth; d >= 0; d--) {
          const node = $pos.node(d);
          if (
            node.type === schema.nodes.list_item &&
            node.attrs.checked !== null
          ) {
            const nodePos = $pos.before(d);
            const newChecked = !node.attrs.checked;
            self.editorView.dispatch(
              self.editorView.state.tr.setNodeMarkup(nodePos, undefined, {
                ...node.attrs,
                checked: newChecked,
              }),
            );
            return;
          }
        }
      }
    });

    // Card atom hover popover using Popover API
    const popover = document.createElement('div');
    popover.id = `card-popover-${editorId}`;
    popover.setAttribute('popover', 'manual');
    popover.className = 'card-atom-popover';
    document.body.appendChild(popover);

    let hideTimeout: number | null = null;

    this.editorView.dom.addEventListener(
      'mouseenter',
      (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const atom = target.closest('.boxel-card-atom') as HTMLElement;
        if (!atom) return;

        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }

        const cardId = atom.getAttribute('data-card-id') || '';
        const label = atom.getAttribute('data-label') || '';

        popover.innerHTML = `
        <div class="preview-card">
          <div class="preview-header">
            <span class="preview-icon">📄</span>
            <span class="preview-title">${label}</span>
          </div>
          <div class="preview-body">
            <div class="preview-id">${cardId}</div>
            <div class="preview-meta">Click to open card</div>
          </div>
        </div>
      `;

        // Position using anchor positioning
        const rect = atom.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.left = `${rect.left + rect.width / 2}px`;
        popover.style.top = `${rect.top - 8}px`;
        popover.style.transform = 'translateX(-50%) translateY(-100%)';

        popover.showPopover();
      },
      true,
    );

    this.editorView.dom.addEventListener(
      'mouseleave',
      (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const atom = target.closest('.boxel-card-atom');
        if (!atom) return;

        hideTimeout = setTimeout(() => {
          popover.hidePopover();
        }, 100) as unknown as number;
      },
      true,
    );

    // Keep popover open when hovering over it
    popover.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });

    popover.addEventListener('mouseleave', () => {
      popover.hidePopover();
    });

    // Clean up popover on destroy
    registerDestructor(this, () => {
      popover.remove();
    });

    // Store view for toolbar access
    editorViewStorage.set(editorId, this.editorView);

    // Focus after a tick to ensure DOM is ready
    setTimeout(() => {
      if (self.editorView) {
        self.editorView.focus();
      }
    }, 10);
  }

  private scheduleAutoSave() {
    // Clear any pending save
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    // Schedule new save
    this.saveTimer = setTimeout(() => {
      this.saveContentNow();
    }, AUTO_SAVE_DELAY) as unknown as number;
  }

  private saveContentNow() {
    // Clear pending timer
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (!this.editorView || !this.onSaveCallback || !this.editorId) return;

    const text = serializeToPlainText(this.editorView.state.doc);
    const stored = editorStateStorage.get(this.editorId);

    if (text !== stored?.savedText) {
      editorStateStorage.set(this.editorId, {
        currentText: text,
        savedText: text,
      });
      this.onSaveCallback(text);
    }
  }

  private cleanup() {
    // Clear pending timer
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // Save current text state before cleanup
    if (this.editorView && this.editorId) {
      const text = serializeToPlainText(this.editorView.state.doc);
      const stored = editorStateStorage.get(this.editorId);

      editorStateStorage.set(this.editorId, {
        currentText: text,
        savedText: stored?.savedText ?? text,
      });

      // Clean up view storage
      editorViewStorage.delete(this.editorId);

      this.editorView.destroy();
      this.editorView = null;
    }
  }
}

// =============================================================================
// RichMarkdownField - FieldDef with ProseMirror editor
// =============================================================================

export class RichMarkdownField extends FieldDef {
  static displayName = 'Rich Markdown Field';

  // The markdown content (string)
  @field content = contains(StringField);

  // Linked cards for field delegation - cards referenced in the markdown
  @field linkedCards = linksToMany(CardDef);

  // Edit template: ProseMirror editor with stable ID-based state
  static edit = class Edit extends Component<typeof this> {
    // Editor mode: 'wysiwyg' or 'markdown'
    @tracked editorMode: 'wysiwyg' | 'markdown' = 'wysiwyg';

    // Markdown content when in markdown mode
    @tracked markdownContent: string = '';

    // ToastMark parser instance for incremental parsing
    @tracked parserService: MarkdownParserService | null = null;

    // Card slot registry for {{in-element}} rendering
    // Maps slot ID to { element, cardIndex, format }
    @tracked _cardSlotVersion = 0;
    private cardSlotMap = new Map<
      string,
      { element: HTMLElement; cardIndex: number; format: string }
    >();

    // Separate slot registry for markdown preview editor
    @tracked _previewCardSlotVersion = 0;
    private previewCardSlotMap = new Map<
      string,
      { element: HTMLElement; cardIndex: number; format: string }
    >();

    // Getter returns array of registered slots (triggers on version change)
    get cardSlots(): Array<{
      id: string;
      element: HTMLElement;
      cardIndex: number;
      format: string;
    }> {
      // Access version to make this reactive
      this._cardSlotVersion;
      return Array.from(this.cardSlotMap.entries()).map(([id, data]) => ({
        id,
        ...data,
      }));
    }

    // Register a card slot from ProseMirror nodeView
    registerCardSlot = (
      slotId: string,
      element: HTMLElement,
      cardIndex: number,
      format: string,
    ) => {
      this.cardSlotMap.set(slotId, { element, cardIndex, format });
      this._cardSlotVersion++;
    };

    // Unregister a card slot when nodeView is destroyed
    unregisterCardSlot = (slotId: string) => {
      this.cardSlotMap.delete(slotId);
      this._cardSlotVersion++;
    };

    // Preview card slots getter (for markdown mode preview)
    get previewCardSlots() {
      this._previewCardSlotVersion;
      return Array.from(this.previewCardSlotMap.entries()).map(([id, data]) => ({
        id,
        ...data,
      }));
    }

    // Register a card slot from preview ProseMirror nodeView
    registerPreviewCardSlot = (
      slotId: string,
      element: HTMLElement,
      cardIndex: number,
      format: string,
    ) => {
      this.previewCardSlotMap.set(slotId, { element, cardIndex, format });
      this._previewCardSlotVersion++;
    };

    // Unregister a preview card slot when nodeView is destroyed
    unregisterPreviewCardSlot = (slotId: string) => {
      this.previewCardSlotMap.delete(slotId);
      this._previewCardSlotVersion++;
    };

    // Use fieldName as stable ID - it doesn't change across re-renders
    get editorId(): string {
      return `prosemirror-${this.args.fieldName || 'content'}`;
    }

    // Get realm URL from context for card injection
    get realmUrl(): string {
      // @ts-ignore - context may have realm info
      return (
        this.args.context?.realm?.url ||
        'https://realms-staging.stack.cards/ctse/integral-wolverine/'
      );
    }

    // Save callback - called on blur (sets the content sub-field)
    handleSave = (text: string) => {
      if (this.args.model) {
        this.args.model.content = text;
      }
    };

    // Toggle between WYSIWYG and Markdown modes
    toggleMode = () => {
      if (this.editorMode === 'wysiwyg') {
        // Switch to markdown mode - serialize current ProseMirror doc
        const view = getEditorView(this.editorId);
        if (view) {
          // Use existing serialization (ToastMark syntax when ready)
          const content = serializeToMarkdown(view.state.doc);
          this._markdownContent = content;
          this.markdownContent = content; // For initial textarea render
          this.parserService = new MarkdownParserService(content);
        } else {
          const content = this.args.model?.content || '';
          this._markdownContent = content;
          this.markdownContent = content;
          this.parserService = new MarkdownParserService(content);
        }
        this.editorMode = 'markdown';
      } else {
        // Switch to WYSIWYG mode - parse markdown and update editor
        const view = getEditorView(this.editorId);
        if (view && this._markdownContent) {
          // Use existing parser (ToastMark when ready)
          const doc = parseFromMarkdown(this._markdownContent);
          const newState = EditorState.create({
            doc,
            schema,
            plugins: view.state.plugins,
          });
          view.updateState(newState);

          // Update storage
          editorStateStorage.set(this.editorId, {
            currentText: this._markdownContent,
            savedText: this.args.model?.content || '',
          });
        }
        this.editorMode = 'wysiwyg';
        // Clear parser service when leaving markdown mode
        this.parserService = null;
      }
    };

    // Store textarea content without triggering re-renders
    private _markdownContent: string = '';

    // Handle markdown textarea changes - don't update tracked property on every keystroke
    onMarkdownChange = (event: Event) => {
      const textarea = event.target as HTMLTextAreaElement;
      this._markdownContent = textarea.value;

      // Update model (doesn't trigger textarea re-render)
      if (this.args.model) {
        this.args.model.content = this._markdownContent;
      }

      // Update the preview ProseMirror view (debounced)
      this.updatePreviewEditor();
    };

    // Debounce timer for preview updates
    private previewUpdateTimer: number | null = null;

    // Track which pane is currently being edited to avoid loops
    private activePane: 'markdown' | 'preview' | null = null;

    // Update the preview ProseMirror editor with current markdown
    updatePreviewEditor = () => {
      // Don't update if we're editing the preview (would cause loop)
      if (this.activePane === 'preview') return;

      // Debounce to avoid excessive parsing
      if (this.previewUpdateTimer) {
        clearTimeout(this.previewUpdateTimer);
      }
      this.previewUpdateTimer = setTimeout(() => {
        const previewId = `${this.editorId}-preview`;
        const view = getEditorView(previewId);
        if (view && this._markdownContent !== undefined) {
          const doc = parseFromMarkdown(this._markdownContent);
          const newState = EditorState.create({
            doc,
            schema,
            plugins: view.state.plugins,
          });
          view.updateState(newState);
        }
      }, 150) as unknown as number;
    };

    // Update markdown textarea when preview is edited
    updateMarkdownFromPreview = () => {
      // Don't update if we're editing markdown (would cause loop)
      if (this.activePane === 'markdown') return;

      const previewId = `${this.editorId}-preview`;
      const view = getEditorView(previewId);
      if (view) {
        this._markdownContent = serializeToMarkdown(view.state.doc);
        // Update the textarea DOM directly to avoid re-render
        const textarea = document.querySelector(
          '.markdown-textarea',
        ) as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = this._markdownContent;
        }
        if (this.args.model) {
          this.args.model.content = this._markdownContent;
        }
      }
    };

    // Handle preview save (called when preview editor changes)
    handlePreviewSave = (text: string) => {
      this.activePane = 'preview';
      this._markdownContent = text;
      // Update the textarea DOM directly to avoid re-render
      const textarea = document.querySelector(
        '.markdown-textarea',
      ) as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = text;
      }
      if (this.args.model) {
        this.args.model.content = text;
      }
      // Reset active pane after a tick
      setTimeout(() => {
        this.activePane = null;
      }, 0);
    };

    // Handle markdown textarea focus
    onMarkdownFocus = () => {
      this.activePane = 'markdown';
    };

    // Handle markdown textarea blur - sync to storage
    onMarkdownBlur = () => {
      this.activePane = null;
      if (this.args.model) {
        this.args.model.content = this._markdownContent;
      }
      // Update editor state storage for when we switch back
      editorStateStorage.set(this.editorId, {
        currentText: this._markdownContent,
        savedText: this._markdownContent,
      });
    };

    // Preview HTML for markdown mode (getter for template access)
    get previewHtml() {
      return htmlSafe(markdownToHtml(this.markdownContent || ''));
    }

    // Toolbar handlers
    onBold = () => toggleMarkCommand(this.editorId, schema.marks.strong);
    onItalic = () => toggleMarkCommand(this.editorId, schema.marks.em);
    onCode = () => toggleMarkCommand(this.editorId, schema.marks.code);
    onLink = () => toggleLinkCommand(this.editorId);
    onImage = () => insertImageCommand(this.editorId);
    onH1 = () => setHeadingCommand(this.editorId, 1);
    onH2 = () => setHeadingCommand(this.editorId, 2);
    onH3 = () => setHeadingCommand(this.editorId, 3);
    onParagraph = () => setParagraphCommand(this.editorId);
    onBulletList = () =>
      runCommand(this.editorId, wrapInList(schema.nodes.bullet_list));
    onOrderedList = () =>
      runCommand(this.editorId, wrapInList(schema.nodes.ordered_list));
    onBlockquote = () =>
      runCommand(this.editorId, wrapIn(schema.nodes.blockquote));
    onCodeBlock = () =>
      runCommand(this.editorId, setBlockType(schema.nodes.code_block));
    onHr = () => insertHorizontalRule(this.editorId);
    onTaskList = () => toggleTaskListCommand(this.editorId);
    onTable = () => insertTableCommand(this.editorId);
    onCardAtom = () => insertCardAtomCommand(this.editorId);
    onCardBlock = () => insertCardBlockCommand(this.editorId);
    onLift = () => runCommand(this.editorId, lift);

    <template>
      <div class='rich-markdown-editor'>
        <div class='toolbar'>
          {{! Mode toggle button }}
          <div class='toolbar-group mode-toggle'>
            <button
              type='button'
              class='toolbar-btn mode-btn
                {{if (eq this.editorMode "wysiwyg") "active"}}'
              title='Toggle Markdown/WYSIWYG mode'
              {{on 'click' this.toggleMode}}
            >
              {{if (eq this.editorMode 'wysiwyg') 'MD' 'WY'}}
            </button>
          </div>
          <div class='toolbar-sep'></div>

          {{! WYSIWYG toolbar buttons (hidden in markdown mode) }}
          {{#if (eq this.editorMode 'wysiwyg')}}
            <div class='toolbar-group'>
              <button
                type='button'
                class='toolbar-btn'
                title='Bold (⌘B)'
                {{on 'click' this.onBold}}
              >B</button>
              <button
                type='button'
                class='toolbar-btn italic'
                title='Italic (⌘I)'
                {{on 'click' this.onItalic}}
              >I</button>
              <button
                type='button'
                class='toolbar-btn mono'
                title='Code (⌘`)'
                {{on 'click' this.onCode}}
              >&lt;/&gt;</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Link (⌘K)'
                {{on 'click' this.onLink}}
              >🔗</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Image'
                {{on 'click' this.onImage}}
              >🖼</button>
            </div>
            <div class='toolbar-sep'></div>
            <div class='toolbar-group'>
              <button
                type='button'
                class='toolbar-btn'
                title='Heading 1'
                {{on 'click' this.onH1}}
              >H1</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Heading 2'
                {{on 'click' this.onH2}}
              >H2</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Heading 3'
                {{on 'click' this.onH3}}
              >H3</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Paragraph'
                {{on 'click' this.onParagraph}}
              >¶</button>
            </div>
            <div class='toolbar-sep'></div>
            <div class='toolbar-group'>
              <button
                type='button'
                class='toolbar-btn'
                title='Bullet List'
                {{on 'click' this.onBulletList}}
              >•</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Numbered List'
                {{on 'click' this.onOrderedList}}
              >1.</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Blockquote'
                {{on 'click' this.onBlockquote}}
              >"</button>
              <button
                type='button'
                class='toolbar-btn mono'
                title='Code Block'
                {{on 'click' this.onCodeBlock}}
              >{ }</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Task List'
                {{on 'click' this.onTaskList}}
              >☐</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Table'
                {{on 'click' this.onTable}}
              >▦</button>
            </div>
            <div class='toolbar-sep'></div>
            <div class='toolbar-group'>
              <button
                type='button'
                class='toolbar-btn'
                title='Horizontal Rule'
                {{on 'click' this.onHr}}
              >―</button>
              <button
                type='button'
                class='toolbar-btn'
                title='Lift/Outdent'
                {{on 'click' this.onLift}}
              >←</button>
            </div>
            <div class='toolbar-sep'></div>
            <div class='toolbar-group'>
              <button
                type='button'
                class='toolbar-btn card-btn'
                title='Insert Card (inline)'
                {{on 'click' this.onCardAtom}}
              >@</button>
              <button
                type='button'
                class='toolbar-btn card-btn'
                title='Insert Card Block'
                {{on 'click' this.onCardBlock}}
              >📄</button>
            </div>
          {{else}}
            <div class='toolbar-group'>
              <span class='mode-label'>Markdown Mode</span>
            </div>
          {{/if}}
        </div>

        {{!-- Editor content area with {{in-element}} card rendering --}}
        {{#if (eq this.editorMode 'wysiwyg')}}
          <div class='editor-with-cards'>
            <div
              class='editor-mount'
              {{ProseMirrorModifier
                editorId=this.editorId
                initialContent=@model.content
                onSave=this.handleSave
                onSlotCreated=this.registerCardSlot
                onSlotDestroyed=this.unregisterCardSlot
              }}
            ></div>

            {{!-- Render cards into their ProseMirror slots using {{in-element}} --}}
            {{#each this.cardSlots as |slot|}}
              {{#let (get @fields.linkedCards slot.cardIndex) as |cardField|}}
                {{#if cardField}}
                  {{#in-element slot.element insertBefore=null}}
                    <cardField @format={{slot.format}} />
                  {{/in-element}}
                {{else}}
                  {{#in-element slot.element insertBefore=null}}
                    <div style='background: red; color: white; padding: 8px;'>
                      NO CARD: index={{slot.cardIndex}}, format={{slot.format}}
                    </div>
                  {{/in-element}}
                {{/if}}
              {{/let}}
            {{/each}}

            {{! Debug: show slot count }}
            <div
              class='debug-slot-info'
              style='position: fixed; bottom: 10px; right: 10px; background: black; color: lime; padding: 8px; font-size: 11px; z-index: 9999; font-family: monospace;'
            >
              Slots:
              {{this.cardSlots.length}}
              {{#each this.cardSlots as |slot|}}
                <div>{{slot.id}}: idx={{slot.cardIndex}}
                  fmt={{slot.format}}</div>
              {{/each}}
            </div>
          </div>
        {{else}}
          <div class='markdown-editor-container'>
            <textarea
              class='markdown-textarea'
              value={{this.markdownContent}}
              placeholder='Enter markdown here...'
              {{on 'input' this.onMarkdownChange}}
              {{on 'focus' this.onMarkdownFocus}}
              {{on 'blur' this.onMarkdownBlur}}
            ></textarea>
            <div class='markdown-preview'>
              <div class='preview-label'>WYSIWYG</div>
              <div
                class='editor-mount preview-mount'
                {{ProseMirrorModifier
                  editorId=(concat this.editorId '-preview')
                  initialContent=this.markdownContent
                  onSave=this.handlePreviewSave
                  onSlotCreated=this.registerPreviewCardSlot
                  onSlotDestroyed=this.unregisterPreviewCardSlot
                }}
              ></div>

              {{!-- Render cards into preview slots using {{in-element}} --}}
              {{#each this.previewCardSlots as |slot|}}
                {{#let (get @fields.linkedCards slot.cardIndex) as |cardField|}}
                  {{#if cardField}}
                    {{#in-element slot.element insertBefore=null}}
                      <cardField @format={{slot.format}} />
                    {{/in-element}}
                  {{else}}
                    {{#in-element slot.element insertBefore=null}}
                      <div style='background: red; color: white; padding: 8px;'>
                        NO CARD: index={{slot.cardIndex}}, format={{slot.format}}
                      </div>
                    {{/in-element}}
                  {{/if}}
                {{/let}}
              {{/each}}
            </div>
          </div>
        {{/if}}
      </div>

      <style scoped>
        .rich-markdown-editor {
          font-family:
            -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            'Helvetica Neue', Arial, sans-serif;
        }

        .toolbar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 8px;
          background: #f8f8f8;
          border: 1px solid #ddd;
          border-bottom: none;
          border-radius: 4px 4px 0 0;
          flex-wrap: wrap;
        }

        .toolbar-group {
          display: flex;
          gap: 2px;
        }

        .toolbar-sep {
          width: 1px;
          height: 20px;
          background: #ddd;
          margin: 0 4px;
        }

        .toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: #444;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.15s,
            color 0.15s;
        }

        .toolbar-btn:hover {
          background: #e8e8e8;
          color: #000;
        }

        .toolbar-btn:active {
          background: #ddd;
        }

        .toolbar-btn.italic {
          font-style: italic;
        }

        .toolbar-btn.mono {
          font-family: 'SFMono-Regular', Consolas, monospace;
          font-size: 11px;
          font-weight: 500;
        }

        .editor-mount {
          border: 1px solid #ddd;
          border-radius: 0 0 4px 4px;
          padding: 12px 16px;
          min-height: 120px;
          background: #fff;
          font-size: 15px;
          line-height: 1.6;
          color: #222;
          cursor: text;
        }

        .editor-mount:focus-within {
          border-color: #0066cc;
          box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
          outline: none;
        }

        /* ProseMirror styles - white-space required per ProseMirror docs */
        .editor-mount :deep(.ProseMirror) {
          outline: none;
          min-height: 100px;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .editor-mount :deep(.ProseMirror p) {
          margin: 0 0 1em 0;
        }

        .editor-mount :deep(.ProseMirror p:last-child) {
          margin-bottom: 0;
        }

        .editor-mount :deep(.ProseMirror h1),
        .editor-mount :deep(.ProseMirror h2),
        .editor-mount :deep(.ProseMirror h3),
        .editor-mount :deep(.ProseMirror h4),
        .editor-mount :deep(.ProseMirror h5),
        .editor-mount :deep(.ProseMirror h6) {
          margin: 1em 0 0.5em 0;
          font-weight: 600;
          line-height: 1.25;
        }

        .editor-mount :deep(.ProseMirror h1:first-child),
        .editor-mount :deep(.ProseMirror h2:first-child),
        .editor-mount :deep(.ProseMirror h3:first-child) {
          margin-top: 0;
        }

        .editor-mount :deep(.ProseMirror h1) {
          font-size: 1.8em;
        }
        .editor-mount :deep(.ProseMirror h2) {
          font-size: 1.5em;
        }
        .editor-mount :deep(.ProseMirror h3) {
          font-size: 1.25em;
        }
        .editor-mount :deep(.ProseMirror h4) {
          font-size: 1.1em;
        }
        .editor-mount :deep(.ProseMirror h5) {
          font-size: 1em;
        }
        .editor-mount :deep(.ProseMirror h6) {
          font-size: 0.9em;
          color: #666;
        }

        .editor-mount :deep(.ProseMirror hr) {
          border: none;
          border-top: 1px solid #ddd;
          margin: 1.5em 0;
        }

        .editor-mount :deep(.ProseMirror strong) {
          font-weight: 600;
        }

        .editor-mount :deep(.ProseMirror em) {
          font-style: italic;
        }

        .editor-mount :deep(.ProseMirror code) {
          font-family:
            'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 0.9em;
          padding: 0.15em 0.4em;
          background: #f5f5f5;
          border-radius: 3px;
        }

        .editor-mount :deep(.ProseMirror a) {
          color: #0066cc;
          text-decoration: none;
        }

        .editor-mount :deep(.ProseMirror img) {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 0.5em 0;
          display: block;
        }

        .editor-mount :deep(.ProseMirror img.ProseMirror-selectednode) {
          outline: 2px solid #0066cc;
        }

        .editor-mount :deep(.ProseMirror blockquote) {
          border-left: 3px solid #ddd;
          margin: 1em 0;
          padding-left: 1em;
          color: #666;
        }

        .editor-mount :deep(.ProseMirror pre) {
          background: #f5f5f5;
          border-radius: 4px;
          padding: 0.75em 1em;
          font-family:
            'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 0.9em;
          overflow-x: auto;
        }

        .editor-mount :deep(.ProseMirror ul),
        .editor-mount :deep(.ProseMirror ol) {
          margin: 1em 0;
          padding-left: 1.5em;
        }

        .editor-mount :deep(.ProseMirror li) {
          margin: 0.25em 0;
        }

        .editor-mount :deep(.ProseMirror li > p) {
          margin: 0;
        }

        .editor-mount :deep(.ProseMirror ul:has(> li.task-item)) {
          list-style: none;
          padding-left: 0;
          margin: 0.5em 0;
        }

        .editor-mount :deep(.ProseMirror li.task-item) {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin: 0.25em 0;
          padding-left: 4px;
        }

        .editor-mount :deep(.ProseMirror li.task-item::before) {
          content: '';
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          border: 2px solid #bbb;
          border-radius: 4px;
          cursor: pointer;
          position: relative;
          top: 3px;
          background: #fff;
        }

        .editor-mount :deep(.ProseMirror li.task-item:hover::before) {
          border-color: #0066cc;
        }

        .editor-mount
          :deep(.ProseMirror li.task-item[data-checked='true']::before) {
          background: #0066cc;
          border-color: #0066cc;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='white' d='M6.5 12L2 7.5l1.5-1.5L6.5 9l6-6L14 4.5z'/%3E%3C/svg%3E");
          background-size: 12px;
          background-position: center;
          background-repeat: no-repeat;
        }

        .editor-mount :deep(.ProseMirror li.task-item[data-checked='true']) {
          color: #888;
        }

        .editor-mount :deep(.ProseMirror li.task-item > p) {
          margin: 0;
          flex: 1;
        }

        .editor-mount :deep(.ProseMirror table) {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }

        .editor-mount :deep(.ProseMirror th),
        .editor-mount :deep(.ProseMirror td) {
          border: 1px solid #ddd;
          padding: 8px 12px;
          text-align: left;
        }

        .editor-mount :deep(.ProseMirror th) {
          background: #f5f5f5;
          font-weight: 600;
        }

        .editor-mount :deep(.ProseMirror tr:hover td) {
          background: #fafafa;
        }

        /* Boxel card/field atoms - pill style with hover preview */
        .editor-mount :deep(.ProseMirror .boxel-card-atom) {
          display: inline-flex;
          align-items: center;
          gap: 0.3em;
          padding: 0.15em 0.6em 0.15em 0.4em;
          background: linear-gradient(135deg, #fdf8f3 0%, #f9efe6 100%);
          border: 1px solid #e8ddd0;
          border-radius: 100px;
          font-size: 0.875em;
          cursor: pointer;
          white-space: nowrap;
          vertical-align: baseline;
          position: relative;
          transition: all 0.15s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .editor-mount :deep(.ProseMirror .boxel-card-atom .atom-icon) {
          font-size: 0.9em;
        }

        .editor-mount :deep(.ProseMirror .boxel-card-atom .atom-label) {
          font-weight: 500;
          color: #5c4a32;
        }

        .editor-mount :deep(.ProseMirror .boxel-card-atom:hover) {
          background: linear-gradient(135deg, #fff 0%, #fdf8f3 100%);
          border-color: #d4c4b0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }

        .editor-mount
          :deep(.ProseMirror .boxel-card-atom.ProseMirror-selectednode) {
          outline: 2px solid #0066cc;
          outline-offset: 2px;
        }

        /* =================================================================
           BLOCK CARD SLOTS - Clean CSS for embedding cards in rich text

           DOM Structure:
           .openbox-card-slot-block (slot container, inline width/height)
             └─ .card-render-target (display: contents, invisible)
                 └─ Boxel wrappers (need height: 100%, visually transparent)
                     └─ .fitted-container (container-type: size for queries)
                         └─ sub-format divs (shown/hidden by @container)
           ================================================================= */

        /* Slot container - explicit dimensions from markdown syntax */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block) {
          display: flex;
          flex-direction: column;
          margin: 0.5em 0;
          padding: 0;
          border: none;
          background: transparent;
          overflow: hidden;
          line-height: 0;
          font-size: 0;
          border-radius: 8px;
        }

        /* Card render target - invisible wrapper for {{in-element}} */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block .card-render-target) {
          display: contents;
        }

        /* Boxel wrapper layers for FITTED format - pass through explicit height */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-fitted .boxel-card-container),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-fitted .boxel-card-container--boundaries),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-fitted .field-component-card),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-fitted .display-container-true),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-fitted .ember-view:not(.fitted-container)) {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }

        /* Boxel wrapper layers for EMBEDDED format - natural height flow */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded .boxel-card-container),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded .boxel-card-container--boundaries),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded .field-component-card),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded .display-container-true),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded .ember-view) {
          display: block !important;
          width: 100% !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }

        /* FITTED FORMAT: Fixed dimensions, container queries for sub-formats */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-fitted .fitted-container) {
          width: 100% !important;
          height: 100% !important;
          container-type: size !important;
        }

        /* EMBEDDED FORMAT: Natural height, responsive width via size classes */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded) {
          height: auto !important;
          margin: 0.75em 0;
        }

        /* Size presets for embedded cards (like image sizing in blogs) */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded.size-full) {
          width: 100%;
        }

        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded.size-large) {
          width: 100%;
          max-width: 640px;
        }

        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded.size-medium) {
          width: 100%;
          max-width: 480px;
        }

        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded.size-small) {
          width: 100%;
          max-width: 320px;
        }

        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded .person-embedded),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded .task-embedded),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block.format-embedded [class*='-embedded']) {
          width: 100%;
          box-sizing: border-box;
        }

        /* Restore text properties inside card content (slot has font-size: 0) */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block .fitted-container),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block .person-embedded),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block .task-embedded),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block [class*='-embedded']),
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block [class*='-fitted']) {
          line-height: 1.5;
          font-size: 1rem;
        }

        /* Fallback display when card isn't loaded yet */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-block .slot-fallback) {
          display: flex;
          flex-direction: column;
          padding: 1em;
          color: #666;
          line-height: 1.5;
          font-size: 0.9rem;
        }

        .editor-mount :deep(.ProseMirror .openbox-card-slot-block .card-block-header) {
          display: flex;
          align-items: center;
          gap: 0.5em;
          font-size: 0.85em;
          margin-bottom: 0.5em;
        }

        .editor-mount :deep(.ProseMirror .openbox-card-slot-block .card-block-id) {
          font-family: monospace;
          font-size: 0.85em;
          color: #888;
        }

        /* Ensure ProseMirror paragraphs flow inline content correctly */
        .editor-mount :deep(.ProseMirror p) {
          display: block;
          white-space: normal;
        }

        /* Card slot styles for INLINE atom cards */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-atom) {
          display: inline !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          background: none !important;
          vertical-align: baseline !important;
          float: none !important;
          clear: none !important;
        }

        .editor-mount
          :deep(.ProseMirror .openbox-card-slot-atom .card-render-target) {
          display: inline !important;
        }

        .editor-mount
          :deep(.ProseMirror .openbox-card-slot-atom .slot-fallback) {
          display: inline-flex;
          flex-direction: row;
          padding: 0.15em 0.5em;
          gap: 0.3em;
          background: linear-gradient(135deg, #fdf8f3 0%, #f9efe6 100%);
          border: 1px solid #e8ddd0;
          border-radius: 100px;
          font-size: 0.875em;
        }

        .editor-mount :deep(.ProseMirror .openbox-card-slot-atom .atom-label) {
          font-weight: 500;
          color: #5c4a32;
        }

        /* Ensure card content inside atom slots renders inline */
        .editor-mount
          :deep(.ProseMirror .openbox-card-slot-atom .card-render-target > *) {
          display: inline-flex !important;
          vertical-align: middle;
        }

        /* Person atom inside slot */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-atom .person-atom) {
          display: inline-flex !important;
          vertical-align: middle;
        }

        /* Task atom inside slot */
        .editor-mount :deep(.ProseMirror .openbox-card-slot-atom .task-atom) {
          display: inline-flex !important;
          vertical-align: middle;
        }

        /* Hide card-renders container */
        .card-renders {
          display: none !important;
        }

        /* Global popover styles (using Popover API) */
        :global(.card-atom-popover) {
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          overflow: visible;
        }

        :global(.card-atom-popover)::backdrop {
          background: transparent;
        }

        :global(.card-atom-popover .preview-card) {
          width: 240px;
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 10px;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.18),
            0 2px 8px rgba(0, 0, 0, 0.08);
          overflow: hidden;
          font-family:
            -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          animation: popoverFadeIn 0.15s ease-out;
        }

        @keyframes popoverFadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-90%);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(-100%);
          }
        }

        :global(.card-atom-popover .preview-header) {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: linear-gradient(135deg, #fdf8f3 0%, #f5ebe0 100%);
          border-bottom: 1px solid #e8ddd0;
        }

        :global(.card-atom-popover .preview-icon) {
          font-size: 1.5em;
        }

        :global(.card-atom-popover .preview-title) {
          font-weight: 600;
          font-size: 0.95em;
          color: #333;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        :global(.card-atom-popover .preview-body) {
          padding: 14px 16px;
        }

        :global(.card-atom-popover .preview-id) {
          font-size: 0.75em;
          color: #555;
          font-family: 'SFMono-Regular', Consolas, monospace;
          word-break: break-all;
          margin-bottom: 10px;
          padding: 8px 10px;
          background: #f5f5f5;
          border-radius: 6px;
          border: 1px solid #eee;
        }

        :global(.card-atom-popover .preview-meta) {
          font-size: 0.75em;
          color: #888;
          text-align: center;
        }

        /* Field atoms - similar pill style */
        .editor-mount :deep(.ProseMirror .boxel-field-atom) {
          display: inline-flex;
          align-items: center;
          gap: 0.3em;
          padding: 0.15em 0.6em 0.15em 0.4em;
          background: linear-gradient(135deg, #f0f7ff 0%, #e3effc 100%);
          border: 1px solid #c5d9f0;
          border-radius: 100px;
          font-size: 0.875em;
          cursor: default;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .editor-mount :deep(.ProseMirror .boxel-field-atom:hover) {
          background: linear-gradient(135deg, #fff 0%, #f0f7ff 100%);
          border-color: #a8c8e8;
        }

        .editor-mount
          :deep(.ProseMirror .boxel-field-atom.ProseMirror-selectednode) {
          outline: 2px solid #0066cc;
          outline-offset: 2px;
        }

        /* Card blocks */
        .editor-mount :deep(.ProseMirror .boxel-card-block) {
          display: flex;
          flex-direction: column;
          margin: 1em 0;
          border: 1px solid #e1e3e9;
          border-radius: 10px;
          background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
          color: #666;
          font-size: 0.9em;
          overflow: hidden;
        }

        .editor-mount :deep(.ProseMirror .boxel-card-block .card-block-header) {
          display: flex;
          align-items: center;
          gap: 0.5em;
          padding: 0.5em 0.75em;
          background: linear-gradient(135deg, #f0ebe6 0%, #e8ddd0 100%);
          border-bottom: 1px solid #e1d8cc;
          font-size: 0.8em;
        }

        .editor-mount :deep(.ProseMirror .boxel-card-block .card-icon) {
          font-size: 1em;
        }

        .editor-mount :deep(.ProseMirror .boxel-card-block .card-format) {
          text-transform: uppercase;
          font-size: 0.7em;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: #8b7355;
          background: rgba(255, 255, 255, 0.5);
          padding: 0.15em 0.4em;
          border-radius: 4px;
        }

        .editor-mount :deep(.ProseMirror .boxel-card-block .card-block-id) {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1em;
          font-family: var(--boxel-font-mono, monospace);
          font-size: 0.85em;
          color: #555;
          word-break: break-all;
        }

        .editor-mount :deep(.ProseMirror .boxel-card-block.format-embedded) {
          border-color: #d4e8d4;
          background: linear-gradient(135deg, #f8fdf8 0%, #f0f8f0 100%);
        }

        .editor-mount
          :deep(
            .ProseMirror .boxel-card-block.format-embedded .card-block-header
          ) {
          background: linear-gradient(135deg, #e8f4e8 0%, #d4e8d4 100%);
          border-bottom-color: #c4d8c4;
        }

        .editor-mount
          :deep(.ProseMirror .boxel-card-block.format-embedded .card-format) {
          color: #4a7c4a;
        }

        .editor-mount
          :deep(.ProseMirror .boxel-card-block.ProseMirror-selectednode) {
          outline: 2px solid #0066cc;
          border-color: transparent;
        }

        .toolbar-btn.card-btn {
          color: #0066cc;
        }

        /* Mode toggle button */
        .mode-toggle {
          margin-right: 4px;
        }

        .mode-btn {
          background: #e0e0e0 !important;
          font-family: monospace;
          font-size: 11px !important;
          font-weight: 700 !important;
        }

        .mode-btn.active {
          background: #0066cc !important;
          color: white !important;
        }

        .mode-label {
          font-size: 12px;
          color: #666;
          font-style: italic;
        }

        /* Markdown editor container */
        .markdown-editor-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          min-height: 300px;
          border: 1px solid #ddd;
          border-top: none;
          border-radius: 0 0 4px 4px;
        }

        .markdown-textarea {
          font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          font-size: 13px;
          line-height: 1.5;
          padding: 12px;
          border: none;
          border-right: 1px solid #ddd;
          resize: none;
          min-height: 300px;
          background: #fafafa;
          color: #333;
        }

        .markdown-textarea:focus {
          outline: none;
          background: #fff;
        }

        .markdown-preview {
          background: #fff;
          overflow: auto;
          display: flex;
          flex-direction: column;
        }

        .preview-label {
          font-size: 11px;
          color: #999;
          padding: 4px 12px;
          background: #f5f5f5;
          border-bottom: 1px solid #eee;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }

        /* Preview mount - editable ProseMirror */
        .preview-mount {
          flex: 1;
          border: none !important;
          border-radius: 0 !important;
          background: #fff !important;
        }

        .preview-mount:focus-within {
          background: #fff !important;
          box-shadow: inset 0 0 0 2px rgba(0, 102, 204, 0.2);
        }

        .preview-content {
          padding: 12px;
          font-size: 14px;
          line-height: 1.6;
        }

        .preview-content h1 {
          font-size: 1.8em;
          margin: 0.5em 0;
        }
        .preview-content h2 {
          font-size: 1.5em;
          margin: 0.5em 0;
        }
        .preview-content h3 {
          font-size: 1.25em;
          margin: 0.5em 0;
        }
        .preview-content p {
          margin: 0.5em 0;
        }
        .preview-content code {
          background: #f0f0f0;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: monospace;
        }
        .preview-content pre {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
        }
        .preview-content pre code {
          background: transparent;
          padding: 0;
        }
        .preview-content blockquote {
          border-left: 3px solid #ddd;
          margin: 0.5em 0;
          padding-left: 1em;
          color: #666;
        }
        .preview-content ul,
        .preview-content ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }
        .preview-content table {
          border-collapse: collapse;
          margin: 0.5em 0;
        }
        .preview-content th,
        .preview-content td {
          border: 1px solid #ddd;
          padding: 6px 10px;
        }
        .preview-content th {
          background: #f5f5f5;
        }
      </style>
    </template>
  };

  // Embedded template: renders content as styled HTML with card rendering
  static embedded = class Embedded extends Component<typeof this> {
    // Get linkedCards array for indexed access
    get linkedCards() {
      return this.args.model?.linkedCards || [];
    }

    // Parse content into segments: text and card references
    get contentSegments() {
      const content = this.args.model?.content || '';
      const segments: Array<{
        type: 'text' | 'card';
        html?: string;
        cardIndex?: number;
        format?: string;
      }> = [];

      // Split by block card directives: ::card{id=N format=X}
      const blockRegex = /::card\{([^}]+)\}/g;
      let lastIndex = 0;
      let match;

      while ((match = blockRegex.exec(content)) !== null) {
        // Add text before this card
        if (match.index > lastIndex) {
          const textBefore = content.slice(lastIndex, match.index);
          segments.push({ type: 'text', html: markdownToHtml(textBefore) });
        }

        // Parse card attributes
        const attrsStr = match[1];
        const idMatch = attrsStr.match(/id=([^\s}]+)/);
        const formatMatch = attrsStr.match(/format=([^\s}]+)/);
        const cardIndex = parseInt(idMatch?.[1] || '0', 10);
        const format = formatMatch?.[1] || 'embedded';

        segments.push({ type: 'card', cardIndex, format });
        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < content.length) {
        segments.push({
          type: 'text',
          html: markdownToHtml(content.slice(lastIndex)),
        });
      }

      return segments;
    }

    <template>
      <div class='rich-markdown-embedded'>
        {{#if @model.content}}
          <div class='content'>
            {{#each this.contentSegments as |segment|}}
              {{#if (eq segment.type 'text')}}
                {{{segment.html}}}
              {{else if (eq segment.type 'card')}}
                {{#let
                  (get @fields.linkedCards segment.cardIndex)
                  as |cardField|
                }}
                  {{#if cardField}}
                    <div class='embedded-card' data-format={{segment.format}}>
                      <cardField @format={{segment.format}} />
                    </div>
                  {{else}}
                    <div class='card-placeholder'>[Card
                      {{segment.cardIndex}}
                      not found]</div>
                  {{/if}}
                {{/let}}
              {{/if}}
            {{/each}}
          </div>
        {{else}}
          <div class='empty'>No content</div>
        {{/if}}
      </div>

      <style scoped>
        .rich-markdown-embedded {
          font-family:
            -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            'Helvetica Neue', Arial, sans-serif;
          font-size: 15px;
          line-height: 1.6;
          color: #222;
        }

        .content h1,
        .content h2,
        .content h3,
        .content h4,
        .content h5,
        .content h6 {
          margin: 0.5em 0 0.25em 0;
          font-weight: 600;
          line-height: 1.25;
        }
        .content h1 {
          font-size: 1.5em;
        }
        .content h2 {
          font-size: 1.3em;
        }
        .content h3 {
          font-size: 1.1em;
        }
        .content p {
          margin: 0 0 0.5em 0;
        }
        .content p:last-child {
          margin-bottom: 0;
        }
        .content ul,
        .content ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }
        .content li {
          margin: 0.15em 0;
        }
        .content blockquote {
          margin: 0.5em 0;
          padding-left: 0.75em;
          border-left: 3px solid #ddd;
          color: #666;
        }
        .content pre {
          background: #f5f5f5;
          padding: 0.5em;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 0.9em;
        }
        .content code {
          font-family: 'SFMono-Regular', Consolas, monospace;
          font-size: 0.9em;
          background: #f5f5f5;
          padding: 0.1em 0.3em;
          border-radius: 3px;
        }
        .content pre code {
          background: none;
          padding: 0;
        }
        .content a {
          color: #0066cc;
          text-decoration: none;
        }
        .content hr {
          border: none;
          border-top: 1px solid #ddd;
          margin: 0.75em 0;
        }
        .content img,
        .content .inline-image {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 0.5em 0;
          display: block;
        }
        .content .task-list {
          list-style: none;
          padding-left: 0.5em;
        }
        .content .task-item {
          display: flex;
          align-items: flex-start;
          gap: 0.4em;
        }
        .content .task-item input[type='checkbox'] {
          margin-top: 0.25em;
          accent-color: #0066cc;
        }
        .content table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
          font-size: 0.95em;
        }
        .content th,
        .content td {
          border: 1px solid #ddd;
          padding: 6px 10px;
          text-align: left;
        }
        .content th {
          background: #f5f5f5;
          font-weight: 600;
        }
        /* Card slot fallback pills (shown until real card loads) */
        .content .boxel-card-slot {
          display: inline-flex;
          align-items: center;
          cursor: pointer;
        }

        .content .boxel-card-slot .slot-fallback {
          display: inline-flex;
          align-items: center;
          gap: 0.3em;
          padding: 0.15em 0.6em 0.15em 0.4em;
          background: linear-gradient(135deg, #fdf8f3 0%, #f9efe6 100%);
          border: 1px solid #e8ddd0;
          border-radius: 100px;
          font-size: 0.875em;
          white-space: nowrap;
          transition: all 0.15s ease;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .content .boxel-card-slot .slot-fallback .atom-icon {
          font-size: 0.9em;
        }
        .content .boxel-card-slot .slot-fallback .atom-label {
          font-weight: 500;
          color: #5c4a32;
        }

        .content .boxel-card-slot:hover .slot-fallback {
          background: linear-gradient(135deg, #fff 0%, #fdf8f3 100%);
          border-color: #d4c4b0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }

        /* Block card slots */
        .content .boxel-card-slot-block {
          display: flex;
          flex-direction: column;
          margin: 0.75em 0;
          border-radius: 10px;
          overflow: hidden;
        }

        .content .boxel-card-slot-block .slot-fallback {
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
          border: 1px solid #e1e3e9;
          border-radius: 10px;
          height: 100%;
        }

        .content .boxel-card-slot-block .card-block-header {
          display: flex;
          align-items: center;
          gap: 0.5em;
          padding: 0.5em 0.75em;
          background: linear-gradient(135deg, #f0ebe6 0%, #e8ddd0 100%);
          border-bottom: 1px solid #e1d8cc;
          font-size: 0.75em;
        }

        .content .boxel-card-slot-block .card-format {
          text-transform: uppercase;
          font-size: 0.7em;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: #8b7355;
          background: rgba(255, 255, 255, 0.5);
          padding: 0.15em 0.4em;
          border-radius: 4px;
        }

        .content .boxel-card-slot-block .card-block-id {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1em;
          font-family: var(--boxel-font-mono, monospace);
          font-size: 0.8em;
          color: #555;
          word-break: break-all;
        }

        /* Hide fallback when card is rendered */
        .content .boxel-card-slot.card-loaded .slot-fallback {
          display: none;
        }

        /* Field atom pills */
        .content .boxel-field-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.3em;
          padding: 0.15em 0.6em 0.15em 0.4em;
          background: linear-gradient(135deg, #f0f7ff 0%, #e3effc 100%);
          border: 1px solid #c5d9f0;
          border-radius: 100px;
          font-size: 0.875em;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .content .boxel-field-atom .atom-icon {
          font-size: 0.9em;
        }
        .content .boxel-field-atom .atom-label {
          font-weight: 500;
          color: #2c5282;
        }

        /* Card blocks */
        .content .boxel-card-block {
          display: flex;
          flex-direction: column;
          margin: 0.75em 0;
          border: 1px solid #e1e3e9;
          border-radius: 10px;
          background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
          color: #666;
          overflow: hidden;
        }

        .content .boxel-card-block .card-block-header {
          display: flex;
          align-items: center;
          gap: 0.5em;
          padding: 0.5em 0.75em;
          background: linear-gradient(135deg, #f0ebe6 0%, #e8ddd0 100%);
          border-bottom: 1px solid #e1d8cc;
          font-size: 0.75em;
        }

        .content .boxel-card-block .card-format {
          text-transform: uppercase;
          font-size: 0.7em;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: #8b7355;
          background: rgba(255, 255, 255, 0.5);
          padding: 0.15em 0.4em;
          border-radius: 4px;
        }

        .content .boxel-card-block .card-block-id {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1em;
          font-family: var(--boxel-font-mono, monospace);
          font-size: 0.8em;
          color: #555;
          word-break: break-all;
        }

        .content .boxel-card-block.format-embedded {
          border-color: #d4e8d4;
          background: linear-gradient(135deg, #f8fdf8 0%, #f0f8f0 100%);
        }

        .content .boxel-card-block.format-embedded .card-block-header {
          background: linear-gradient(135deg, #e8f4e8 0%, #d4e8d4 100%);
          border-bottom-color: #c4d8c4;
        }

        .content .boxel-card-block.format-embedded .card-format {
          color: #4a7c4a;
        }

        /* Card placeholder (for block and container directives) */
        .content :deep(.boxel-card-block) {
          display: block;
          margin: 0.75em 0;
          padding: 1em;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          background: linear-gradient(135deg, #f8f8f8, #f0f0f0);
          text-align: center;
          font-family: var(--boxel-font-mono, monospace);
          font-size: 0.85em;
          color: #666;
        }

        /* Container card (isolated format) */
        .content :deep(.boxel-card-container) {
          display: block;
          margin: 1em 0;
          padding: 1.5em;
          border: 2px dashed #ccc;
          border-radius: 12px;
          background: #fafafa;
          text-align: center;
          font-family: var(--boxel-font-mono, monospace);
          font-size: 0.85em;
          color: #666;
        }

        .empty {
          color: #999;
          font-style: italic;
        }
      </style>
    </template>
  };

  // Atom template: plain text excerpt for inline references
  static atom = class Atom extends Component<typeof this> {
    get excerpt(): string {
      // Strip markdown syntax for plain text excerpt
      let text = this.args.model?.content || '';
      text = text.replace(/^#{1,6}\s+/gm, ''); // headings
      text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // bold
      text = text.replace(/\*([^*]+)\*/g, '$1'); // italic
      text = text.replace(/`([^`]+)`/g, '$1'); // code
      text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, ''); // images
      text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // links
      text = text.replace(/:card\[([^\]]*)\]\{[^}]+\}/g, '$1'); // card atoms
      text = text.replace(/:field\[([^\]]*)\]\{[^}]+\}/g, '$1'); // field atoms
      text = text.replace(/::card\{[^}]+\}/g, ''); // card blocks
      text = text.replace(/\[([ xX])\]\s*/g, ''); // task checkboxes
      text = text.replace(/^[-*+]\s+/gm, ''); // bullets
      text = text.replace(/^\d+\.\s+/gm, ''); // numbers
      text = text.replace(/^>\s+/gm, ''); // quotes
      text = text.replace(/\n+/g, ' ').trim();
      if (text.length <= 50) return text;
      return text.slice(0, 50) + '…';
    }

    <template>
      <span class='rich-markdown-atom'>{{this.excerpt}}</span>

      <style scoped>
        .rich-markdown-atom {
          font-size: inherit;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      </style>
    </template>
  };

  // Fitted template: truncated content for grid/card views
  static fitted = class Fitted extends Component<typeof this> {
    get renderedHtml() {
      return htmlSafe(markdownToHtml(this.args.model?.content || ''));
    }

    <template>
      <div class='rich-markdown-fitted'>
        {{#if @model.content}}
          <div class='content'>{{{this.renderedHtml}}}</div>
        {{else}}
          <div class='empty'>No content</div>
        {{/if}}
      </div>

      <style scoped>
        .rich-markdown-fitted {
          font-family:
            -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            'Helvetica Neue', Arial, sans-serif;
          font-size: 13px;
          line-height: 1.4;
          color: #222;
          height: 100%;
          width: 100%;
          overflow: hidden;
        }

        .content {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .content h1,
        .content h2,
        .content h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 0 0 0.25em 0;
        }
        .content p {
          margin: 0 0 0.25em 0;
        }
        .content ul,
        .content ol {
          margin: 0.25em 0;
          padding-left: 1.2em;
        }
        .content li {
          margin: 0;
        }
        .content blockquote {
          margin: 0.25em 0;
          padding-left: 0.5em;
          border-left: 2px solid #ddd;
          color: #666;
        }
        .content pre {
          font-size: 0.85em;
          background: #f5f5f5;
          padding: 0.25em;
          border-radius: 3px;
        }
        .content code {
          font-family: 'SFMono-Regular', Consolas, monospace;
          font-size: 0.9em;
        }
        .content a {
          color: #0066cc;
        }
        .content hr {
          border: none;
          border-top: 1px solid #ddd;
          margin: 0.5em 0;
        }
        .content img,
        .content .inline-image {
          max-width: 100%;
          height: auto;
          border-radius: 3px;
          margin: 0.25em 0;
        }
        .content .task-list {
          list-style: none;
          padding-left: 0.3em;
        }
        .content .task-item {
          display: flex;
          align-items: flex-start;
          gap: 0.3em;
        }
        .content .task-item input[type='checkbox'] {
          margin-top: 0.15em;
        }
        .content table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.25em 0;
          font-size: 0.9em;
        }
        .content th,
        .content td {
          border: 1px solid #ddd;
          padding: 4px 6px;
          text-align: left;
        }
        .content th {
          background: #f5f5f5;
          font-weight: 600;
        }
        .content .boxel-card-slot .slot-fallback {
          display: inline-flex;
          align-items: center;
          gap: 0.2em;
          padding: 0.1em 0.4em;
          background: linear-gradient(135deg, #fdf8f3, #f9efe6);
          border: 1px solid #e8ddd0;
          border-radius: 100px;
          font-size: 0.85em;
        }
        .content .boxel-card-slot .slot-fallback .atom-icon {
          font-size: 0.85em;
        }
        .content .boxel-card-slot .slot-fallback .atom-label {
          font-weight: 500;
          color: #5c4a32;
        }
        .content .boxel-field-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.2em;
          padding: 0.1em 0.4em;
          background: linear-gradient(135deg, #f0f7ff, #e3effc);
          border: 1px solid #c5d9f0;
          border-radius: 100px;
          font-size: 0.85em;
        }
        .content .boxel-field-atom .atom-label {
          font-weight: 500;
          color: #2c5282;
        }
        .content .boxel-card-slot-block .slot-fallback {
          display: flex;
          flex-direction: column;
          border: 1px solid #e1e3e9;
          border-radius: 6px;
          background: linear-gradient(135deg, #fafafa, #f5f5f5);
          overflow: hidden;
          font-size: 0.85em;
        }
        .content .boxel-card-slot-block .card-block-header {
          display: flex;
          align-items: center;
          gap: 0.3em;
          padding: 0.3em 0.5em;
          background: linear-gradient(135deg, #f0ebe6, #e8ddd0);
          border-bottom: 1px solid #e1d8cc;
          font-size: 0.8em;
        }
        .content .boxel-card-slot-block .card-format {
          text-transform: uppercase;
          font-size: 0.65em;
          font-weight: 600;
          color: #8b7355;
          background: rgba(255, 255, 255, 0.5);
          padding: 0.1em 0.3em;
          border-radius: 3px;
        }
        .content .boxel-card-slot-block .card-block-id {
          padding: 0.5em;
          color: #666;
          text-align: center;
          font-family: monospace;
          font-size: 0.85em;
        }

        .empty {
          color: #999;
          font-style: italic;
        }
      </style>
    </template>
  };
}

// =============================================================================
// RawMarkdownDisplay - Read-only textarea showing raw markdown text
// =============================================================================

class RawMarkdownDisplay extends StringField {
  static displayName = 'Raw Markdown Display';

  static edit = class Edit extends Component<typeof this> {
    <template>
      <textarea class='raw-display' readonly>{{@model}}</textarea>

      <style scoped>
        .raw-display {
          width: 100%;
          height: 5lh;
          font-family:
            'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 12px;
          line-height: 1.4;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: #f9f9f9;
          color: #333;
          resize: vertical;
          overflow-y: auto;
        }
      </style>
    </template>
  };

  static embedded = class Embedded extends Component<typeof this> {
    <template>
      <code class='raw-inline'>{{@model}}</code>

      <style scoped>
        .raw-inline {
          font-family: 'SFMono-Regular', Consolas, monospace;
          font-size: 0.9em;
          white-space: pre-wrap;
        }
      </style>
    </template>
  };
}

// =============================================================================
// RichMarkdown CardDef - Wrapper card that uses RichMarkdownField
// =============================================================================

export class RichMarkdown extends CardDef {
  static displayName = 'Rich Markdown';
  static prefersWideFormat = true;

  @field content = contains(RichMarkdownField);

  // Computed field to show raw markdown (mirrors content.content)
  @field rawMarkdown = contains(RawMarkdownDisplay, {
    computeVia: function (this: RichMarkdown) {
      return this.content?.content ?? '';
    },
  });

  // Isolated: Full view with reading layout
  static isolated = class Isolated extends Component<typeof this> {
    // Get realm URL from context
    get realmUrl(): string {
      // @ts-ignore
      return (
        this.args.context?.realm?.url ||
        'https://realms-staging.stack.cards/ctse/integral-wolverine/'
      );
    }

    // Simple query to fetch all Person cards in this realm
    get personQuery() {
      // Module URL must be absolute for queries
      const moduleUrl = new URL('person', this.realmUrl).href;
      return {
        filter: {
          type: { module: moduleUrl, name: 'Person' },
        },
      };
    }

    get realms(): string[] {
      return [this.realmUrl];
    }

    <template>
      <article class='rich-markdown-isolated'>
        <header class='header'>
          <h1 class='title'>{{@model.cardTitle}}</h1>
        </header>
        <div class='content'>
          <@fields.content />
        </div>

        {{! Test: Direct PrerenderedCardSearch for Person cards }}
        <div class='card-test'>
          <h3>Referenced People (PrerenderedCardSearch test):</h3>
          {{#let
            (component @context.prerenderedCardSearchComponent)
            as |PrerenderedCardSearch|
          }}
            <PrerenderedCardSearch
              @query={{this.personQuery}}
              @format='fitted'
              @realms={{this.realms}}
            >
              <:loading>
                <p>Loading people...</p>
              </:loading>
              <:response as |cards|>
                {{#if cards.length}}
                  <div class='people-grid'>
                    {{#each cards as |card|}}
                      <div
                        class='person-card'
                        style='width: 200px; height: 120px;'
                      >
                        <card.component @format='fitted' />
                      </div>
                    {{/each}}
                  </div>
                {{else}}
                  <p>No people found</p>
                {{/if}}
              </:response>
            </PrerenderedCardSearch>
          {{/let}}
        </div>

        <div class='raw-markdown'>
          <h3>Raw Markdown:</h3>
          <@fields.rawMarkdown />
        </div>
      </article>

      <style scoped>
        .rich-markdown-isolated {
          background: var(--card, #fff);
          color: var(--card-foreground, #1a1a1a);
          min-height: 100%;
          padding: var(--boxel-sp-lg, 1.5rem);
        }

        .raw-markdown {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid #ddd;
        }

        .raw-markdown h3 {
          font-size: 0.875rem;
          color: #666;
          margin: 0 0 0.5rem 0;
        }

        .header {
          border-bottom: 1px solid var(--border, #e5e5e5);
          padding-bottom: var(--boxel-sp, 1rem);
          margin-bottom: var(--boxel-sp-lg, 1.5rem);
        }

        .title {
          font-size: var(--boxel-font-size-xl, 1.5rem);
          font-weight: 600;
          margin: 0;
          color: var(--foreground, #1a1a1a);
        }

        .content {
          font-size: var(--boxel-font-size, 1rem);
          line-height: 1.6;
        }

        .card-test {
          margin-top: 2rem;
          padding: 1rem;
          background: #f9f9f9;
          border-radius: 8px;
        }

        .card-test h3 {
          font-size: 0.875rem;
          color: #666;
          margin: 0 0 1rem 0;
        }

        .people-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .person-card {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }
      </style>
    </template>
  };

  // Embedded: Compact view for lists
  static embedded = class Embedded extends Component<typeof this> {
    <template>
      <div class='rich-markdown-card-embedded'>
        <div class='title'>{{@model.cardTitle}}</div>
        <div class='preview'>
          <@fields.content />
        </div>
      </div>

      <style scoped>
        .rich-markdown-card-embedded {
          background: var(--card, #fff);
          color: var(--card-foreground, #1a1a1a);
          padding: var(--boxel-sp-sm, 0.5rem);
          border-radius: var(--boxel-border-radius-sm, 4px);
        }

        .title {
          font-size: var(--boxel-font-size-sm, 0.875rem);
          font-weight: 600;
          margin-bottom: var(--boxel-sp-xs, 0.25rem);
        }

        .preview {
          font-size: var(--boxel-font-size-xs, 0.75rem);
          line-height: 1.4;
          overflow: hidden;
          max-height: 4em;
        }
      </style>
    </template>
  };

  // Fitted: Fixed dimensions for grids
  static fitted = class Fitted extends Component<typeof this> {
    <template>
      <div class='rich-markdown-card-fitted'>
        <div class='title'>{{@model.cardTitle}}</div>
        <div class='content-preview'>
          <@fields.content />
        </div>
      </div>

      <style scoped>
        .rich-markdown-card-fitted {
          background: var(--card, #fff);
          color: var(--card-foreground, #1a1a1a);
          height: 100%;
          width: 100%;
          padding: var(--boxel-sp-sm, 0.5rem);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .title {
          font-size: var(--boxel-font-size-sm, 0.875rem);
          font-weight: 600;
          margin-bottom: var(--boxel-sp-xs, 0.25rem);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .content-preview {
          font-size: var(--boxel-font-size-xs, 0.75rem);
          line-height: 1.3;
          flex: 1;
          overflow: hidden;
        }
      </style>
    </template>
  };
}

// Phase 1 complete - basic text editing with ProseMirror
