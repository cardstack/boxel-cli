import { CardDef, field, contains, Component } from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import CodeIcon from '@cardstack/boxel-icons/code';

export class CodeSnippet extends CardDef {
  static displayName = 'Code Snippet';
  static icon = CodeIcon;

  @field code = contains(StringField);
  @field language = contains(StringField); // javascript, python, css, etc.
  @field filename = contains(StringField);
  @field description = contains(StringField);

  @field title = contains(StringField, {
    computeVia: function (this: CodeSnippet) {
      return this.filename || `${this.language || 'Code'} Snippet`;
    },
  });

  // Atom: inline code reference
  static atom = class Atom extends Component<typeof CodeSnippet> {
    <template>
      <code class="code-atom">
        {{#if @model.filename}}
          <span class="filename">{{@model.filename}}</span>
        {{else}}
          <span class="lang">{{@model.language}}</span>
        {{/if}}
      </code>
      <style scoped>
        .code-atom {
          display: inline-flex;
          align-items: center;
          padding: 0.15em 0.5em;
          background: #1e293b;
          border-radius: 4px;
          font-family: 'SF Mono', Menlo, monospace;
          font-size: 0.85em;
        }
        .filename, .lang {
          color: #e2e8f0;
        }
      </style>
    </template>
  };

  // Embedded: code block with syntax styling
  static embedded = class Embedded extends Component<typeof CodeSnippet> {
    get lineCount() {
      return (this.args.model.code?.split('\n').length || 0);
    }

    <template>
      <div class="code-embedded">
        <header class="code-header">
          <div class="window-controls">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>
          {{#if @model.filename}}
            <span class="filename">{{@model.filename}}</span>
          {{/if}}
          {{#if @model.language}}
            <span class="language">{{@model.language}}</span>
          {{/if}}
        </header>
        <pre class="code-content"><code>{{@model.code}}</code></pre>
        <footer class="code-footer">
          <span class="line-count">{{this.lineCount}} lines</span>
          {{#if @model.description}}
            <span class="description">{{@model.description}}</span>
          {{/if}}
        </footer>
      </div>
      <style scoped>
        .code-embedded {
          background: #0f172a;
          border-radius: 12px;
          overflow: hidden;
          font-family: 'SF Mono', 'Fira Code', Menlo, monospace;
        }
        .code-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: #1e293b;
          border-bottom: 1px solid #334155;
        }
        .window-controls {
          display: flex;
          gap: 6px;
        }
        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        .dot.red { background: #ef4444; }
        .dot.yellow { background: #eab308; }
        .dot.green { background: #22c55e; }
        .filename {
          color: #e2e8f0;
          font-size: 0.85rem;
        }
        .language {
          margin-left: auto;
          color: #64748b;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .code-content {
          margin: 0;
          padding: 1rem 1.25rem;
          overflow-x: auto;
          font-size: 0.875rem;
          line-height: 1.6;
        }
        .code-content code {
          color: #e2e8f0;
          white-space: pre;
        }
        .code-footer {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          background: #1e293b;
          border-top: 1px solid #334155;
          font-size: 0.75rem;
          color: #64748b;
        }
        .description {
          font-style: italic;
        }
      </style>
    </template>
  };

  // Isolated: full view with line numbers
  static isolated = class Isolated extends Component<typeof CodeSnippet> {
    get lines() {
      return this.args.model.code?.split('\n') || [];
    }

    <template>
      <article class="code-isolated">
        <header class="header">
          <div class="title-section">
            {{#if @model.filename}}
              <h1 class="filename">{{@model.filename}}</h1>
            {{/if}}
            {{#if @model.language}}
              <span class="language-badge">{{@model.language}}</span>
            {{/if}}
          </div>
          {{#if @model.description}}
            <p class="description">{{@model.description}}</p>
          {{/if}}
        </header>
        <div class="code-container">
          <div class="line-numbers">
            {{#each this.lines as |line index|}}
              <span class="line-num">{{index}}</span>
            {{/each}}
          </div>
          <pre class="code-content"><code>{{@model.code}}</code></pre>
        </div>
      </article>
      <style scoped>
        .code-isolated {
          max-width: 800px;
          margin: 0 auto;
          font-family: var(--boxel-font-family, system-ui);
        }
        .header {
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .title-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .filename {
          margin: 0;
          font-size: 1.25rem;
          font-family: 'SF Mono', monospace;
        }
        .language-badge {
          padding: 0.25rem 0.75rem;
          background: #0f172a;
          color: #e2e8f0;
          border-radius: 100px;
          font-size: 0.75rem;
          text-transform: uppercase;
        }
        .description {
          margin: 0.5rem 0 0;
          color: #6b7280;
        }
        .code-container {
          display: flex;
          background: #0f172a;
          overflow-x: auto;
        }
        .line-numbers {
          display: flex;
          flex-direction: column;
          padding: 1rem 0;
          background: #1e293b;
          border-right: 1px solid #334155;
          user-select: none;
        }
        .line-num {
          padding: 0 1rem;
          font-family: 'SF Mono', monospace;
          font-size: 0.875rem;
          line-height: 1.6;
          color: #475569;
          text-align: right;
        }
        .code-content {
          margin: 0;
          padding: 1rem 1.5rem;
          flex: 1;
          font-size: 0.875rem;
          line-height: 1.6;
        }
        .code-content code {
          color: #e2e8f0;
          white-space: pre;
        }
      </style>
    </template>
  };
}
