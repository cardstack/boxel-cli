import { CardDef, field, contains, Component } from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import BooleanField from 'https://cardstack.com/base/boolean';
import CheckboxIcon from '@cardstack/boxel-icons/checkbox';

export class Task extends CardDef {
  static displayName = 'Task';
  static icon = CheckboxIcon;

  @field name = contains(StringField);
  @field status = contains(StringField); // todo, in-progress, done
  @field priority = contains(StringField); // low, medium, high
  @field completed = contains(BooleanField);

  @field title = contains(StringField, {
    computeVia: function (this: Task) {
      return this.name || 'Untitled Task';
    },
  });

  // Atom: inline pill
  static atom = class Atom extends Component<typeof Task> {
    get statusEmoji() {
      switch (this.args.model.status) {
        case 'done': return '✅';
        case 'in-progress': return '🔄';
        default: return '📋';
      }
    }

    <template>
      <span class="task-atom">
        <span class="status">{{this.statusEmoji}}</span>
        <span class="name">{{@model.name}}</span>
      </span>
      <style scoped>
        .task-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.25em;
          padding: 0.1em 0.5em 0.1em 0.25em;
          background: linear-gradient(135deg, #e8f4f8 0%, #d0e8f0 100%);
          border: 1px solid #b8d4e0;
          border-radius: 100px;
          font-size: 0.9em;
          white-space: nowrap;
        }
        .status { font-size: 0.85em; }
        .name { font-weight: 500; color: #2c5a6e; }
      </style>
    </template>
  };

  // Fitted: responsive card
  static fitted = class Fitted extends Component<typeof Task> {
    get statusEmoji() {
      switch (this.args.model.status) {
        case 'done': return '✅';
        case 'in-progress': return '🔄';
        default: return '📋';
      }
    }

    get priorityColor() {
      switch (this.args.model.priority) {
        case 'high': return '#e74c3c';
        case 'medium': return '#f39c12';
        default: return '#27ae60';
      }
    }

    <template>
      <div class="task-fitted">
        <div class="status-icon">{{this.statusEmoji}}</div>
        <div class="info">
          <div class="name">{{@model.name}}</div>
          {{#if @model.priority}}
            <div class="priority" style="color: {{this.priorityColor}}">
              {{@model.priority}}
            </div>
          {{/if}}
        </div>
      </div>
      <style scoped>
        .task-fitted {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: linear-gradient(135deg, #f0f8fa 0%, #e0f0f5 100%);
          height: 100%;
          box-sizing: border-box;
        }
        .status-icon { font-size: 1.5em; }
        .name {
          font-weight: 600;
          color: #2c3e50;
          font-size: 0.95rem;
        }
        .priority {
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
        }
      </style>
    </template>
  };

  // Embedded: compact card
  static embedded = class Embedded extends Component<typeof Task> {
    get statusEmoji() {
      switch (this.args.model.status) {
        case 'done': return '✅';
        case 'in-progress': return '🔄';
        default: return '📋';
      }
    }

    <template>
      <div class="task-embedded">
        <div class="status-icon">{{this.statusEmoji}}</div>
        <div class="info">
          <div class="name">{{@model.name}}</div>
          <div class="meta">
            {{#if @model.status}}<span class="status">{{@model.status}}</span>{{/if}}
            {{#if @model.priority}}<span class="priority">• {{@model.priority}} priority</span>{{/if}}
          </div>
        </div>
      </div>
      <style scoped>
        .task-embedded {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, #f0f8fa 0%, #e0f0f5 100%);
          border: 1px solid #c8dce5;
          border-radius: 12px;
        }
        .status-icon { font-size: 1.75em; }
        .name {
          font-weight: 600;
          color: #2c3e50;
          font-size: 1rem;
        }
        .meta {
          font-size: 0.85rem;
          color: #5a7a8a;
          margin-top: 0.15rem;
        }
        .priority { margin-left: 0.25rem; }
      </style>
    </template>
  };

  // Isolated: full view
  static isolated = class Isolated extends Component<typeof Task> {
    get statusEmoji() {
      switch (this.args.model.status) {
        case 'done': return '✅';
        case 'in-progress': return '🔄';
        default: return '📋';
      }
    }

    <template>
      <div class="task-isolated">
        <div class="header">
          <div class="status-icon">{{this.statusEmoji}}</div>
          <div class="title-section">
            <h1 class="name">{{@model.name}}</h1>
            <div class="meta">
              {{#if @model.status}}<span class="status">Status: {{@model.status}}</span>{{/if}}
              {{#if @model.priority}}<span class="priority">Priority: {{@model.priority}}</span>{{/if}}
            </div>
          </div>
        </div>
      </div>
      <style scoped>
        .task-isolated {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem;
          font-family: var(--boxel-font-family, system-ui);
        }
        .header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .status-icon {
          font-size: 3rem;
          background: linear-gradient(135deg, #f0f8fa 0%, #e0f0f5 100%);
          border-radius: 50%;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .name {
          margin: 0;
          font-size: 1.75rem;
          color: #2c3e50;
        }
        .meta {
          display: flex;
          gap: 1.5rem;
          margin-top: 0.5rem;
          color: #5a7a8a;
        }
      </style>
    </template>
  };
}
