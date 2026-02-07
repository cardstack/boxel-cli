import { CardDef, field, contains, Component } from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import UserIcon from '@cardstack/boxel-icons/user';

export class Person extends CardDef {
  static displayName = 'Person';
  static icon = UserIcon;

  @field firstName = contains(StringField);
  @field lastName = contains(StringField);
  @field role = contains(StringField);
  @field email = contains(StringField);
  @field avatarEmoji = contains(StringField); // Simple emoji avatar

  @field title = contains(StringField, {
    computeVia: function (this: Person) {
      const parts = [this.firstName, this.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : 'Unnamed Person';
    },
  });

  // Atom format: minimal inline pill
  static atom = class Atom extends Component<typeof Person> {
    <template>
      <span class="person-atom">
        {{#if @model.avatarEmoji}}
          <span class="avatar">{{@model.avatarEmoji}}</span>
        {{else}}
          <span class="avatar">👤</span>
        {{/if}}
        <span class="name">{{@model.title}}</span>
      </span>
      <style scoped>
        .person-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.25em;
          padding: 0.1em 0.5em 0.1em 0.25em;
          background: linear-gradient(135deg, #f8f4f0 0%, #f0e8e0 100%);
          border: 1px solid #e0d4c8;
          border-radius: 100px;
          font-size: 0.9em;
          white-space: nowrap;
        }
        .avatar { font-size: 0.85em; }
        .name { font-weight: 500; color: #5c4a32; }
      </style>
    </template>
  };

  // Fitted format: responsive card for grids/previews
  static fitted = class Fitted extends Component<typeof Person> {
    <template>
      <div class="fitted-container">
        <div class="badge-format">
          {{#if @model.avatarEmoji}}
            <span class="avatar">{{@model.avatarEmoji}}</span>
          {{else}}
            <span class="avatar">👤</span>
          {{/if}}
        </div>
        <div class="strip-format">
          <span class="avatar">{{if @model.avatarEmoji @model.avatarEmoji "👤"}}</span>
          <span class="name">{{@model.title}}</span>
        </div>
        <div class="tile-format">
          <div class="avatar-large">{{if @model.avatarEmoji @model.avatarEmoji "👤"}}</div>
          <div class="info">
            <div class="name">{{@model.title}}</div>
            {{#if @model.role}}
              <div class="role">{{@model.role}}</div>
            {{/if}}
          </div>
        </div>
        <div class="card-format">
          <div class="avatar-section">
            <div class="avatar-xl">{{if @model.avatarEmoji @model.avatarEmoji "👤"}}</div>
          </div>
          <div class="content">
            <div class="name">{{@model.title}}</div>
            {{#if @model.role}}
              <div class="role">{{@model.role}}</div>
            {{/if}}
            {{#if @model.email}}
              <div class="email">{{@model.email}}</div>
            {{/if}}
          </div>
        </div>
      </div>
      <style scoped>
        .fitted-container {
          container-type: size;
          width: 100%;
          height: 100%;
          font-family: var(--boxel-font-family, system-ui);
        }

        /* Hide all by default */
        .badge-format, .strip-format, .tile-format, .card-format {
          display: none;
        }

        /* Badge: tiny square (< 60px height) */
        @container (max-height: 59px) {
          .badge-format {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #fdf8f3 0%, #f5ebe0 100%);
          }
          .badge-format .avatar { font-size: 1.5em; }
        }

        /* Strip: narrow horizontal (60px+ height, < 120px) */
        @container (min-height: 60px) and (max-height: 119px) {
          .strip-format {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            width: 100%;
            height: 100%;
            padding: 0.5rem;
            background: linear-gradient(135deg, #fdf8f3 0%, #f5ebe0 100%);
            box-sizing: border-box;
          }
          .strip-format .avatar { font-size: 1.2em; }
          .strip-format .name {
            font-weight: 600;
            color: #333;
            font-size: 0.9rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }

        /* Tile: medium square/portrait (120px+ height, < 200px) */
        @container (min-height: 120px) and (max-height: 199px) {
          .tile-format {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            height: 100%;
            padding: 0.75rem;
            background: linear-gradient(135deg, #fdf8f3 0%, #f5ebe0 100%);
            box-sizing: border-box;
            text-align: center;
          }
          .tile-format .avatar-large { font-size: 2.5em; }
          .tile-format .name {
            font-weight: 600;
            color: #333;
            font-size: 0.95rem;
          }
          .tile-format .role {
            font-size: 0.8rem;
            color: #666;
          }
        }

        /* Card: large format (200px+ height) */
        @container (min-height: 200px) {
          .card-format {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #fdf8f3 0%, #f5ebe0 100%);
            box-sizing: border-box;
          }
          .avatar-section {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
            flex-shrink: 0;
          }
          .avatar-xl { font-size: 4em; }
          .content {
            padding: 1rem;
            text-align: center;
          }
          .card-format .name {
            font-weight: 700;
            font-size: 1.1rem;
            color: #333;
            margin-bottom: 0.25rem;
          }
          .card-format .role {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 0.5rem;
          }
          .card-format .email {
            font-size: 0.8rem;
            color: #0066cc;
          }
        }
      </style>
    </template>
  };

  // Embedded format: compact card for inclusion
  static embedded = class Embedded extends Component<typeof Person> {
    <template>
      <div class="person-embedded">
        <div class="avatar">{{if @model.avatarEmoji @model.avatarEmoji "👤"}}</div>
        <div class="info">
          <div class="name">{{@model.title}}</div>
          {{#if @model.role}}
            <div class="role">{{@model.role}}</div>
          {{/if}}
        </div>
      </div>
      <style scoped>
        .person-embedded {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, #fdf8f3 0%, #f5ebe0 100%);
          border: 1px solid #e8ddd0;
          border-radius: 12px;
        }
        .avatar { font-size: 2em; }
        .name {
          font-weight: 600;
          color: #333;
          font-size: 1rem;
        }
        .role {
          font-size: 0.85rem;
          color: #666;
          margin-top: 0.15rem;
        }
      </style>
    </template>
  };

  // Isolated format: full detail view
  static isolated = class Isolated extends Component<typeof Person> {
    <template>
      <div class="person-isolated">
        <div class="header">
          <div class="avatar">{{if @model.avatarEmoji @model.avatarEmoji "👤"}}</div>
          <div class="title-section">
            <h1 class="name">{{@model.title}}</h1>
            {{#if @model.role}}
              <div class="role">{{@model.role}}</div>
            {{/if}}
          </div>
        </div>
        <div class="details">
          {{#if @model.email}}
            <div class="field">
              <label>Email</label>
              <a href="mailto:{{@model.email}}">{{@model.email}}</a>
            </div>
          {{/if}}
        </div>
      </div>
      <style scoped>
        .person-isolated {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem;
          font-family: var(--boxel-font-family, system-ui);
        }
        .header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e8ddd0;
        }
        .avatar {
          font-size: 4rem;
          background: linear-gradient(135deg, #fdf8f3 0%, #f5ebe0 100%);
          border-radius: 50%;
          width: 100px;
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .name {
          margin: 0;
          font-size: 1.75rem;
          color: #333;
        }
        .role {
          font-size: 1.1rem;
          color: #666;
          margin-top: 0.25rem;
        }
        .details {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .field label {
          display: block;
          font-size: 0.85rem;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.25rem;
        }
        .field a {
          color: #0066cc;
          text-decoration: none;
        }
        .field a:hover {
          text-decoration: underline;
        }
      </style>
    </template>
  };
}
