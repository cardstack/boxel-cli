import {
  CardDef,
  field,
  contains,
  Component,
} from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import MailIcon from '@cardstack/boxel-icons/mail';

export class Email extends CardDef {
  static displayName = 'Email';
  static icon = MailIcon;

  @field subject = contains(StringField);
  @field from = contains(StringField);
  @field to = contains(StringField);
  @field date = contains(StringField);
  @field body = contains(StringField);
  @field preview = contains(StringField); // First line preview

  @field title = contains(StringField, {
    computeVia: function (this: Email) {
      return this.subject || 'No Subject';
    },
  });

  // Atom: inline email reference
  static atom = class Atom extends Component<typeof Email> {
    <template>
      <span class='email-atom'>
        <span class='icon'>✉️</span>
        <span class='subject'>{{@model.subject}}</span>
        <span class='from'>from {{@model.from}}</span>
      </span>
      <style scoped>
        .email-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.35em;
          padding: 0.15em 0.6em;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border: 1px solid #bfdbfe;
          border-radius: 100px;
          font-size: 0.9em;
        }
        .icon {
          font-size: 0.9em;
        }
        .subject {
          font-weight: 500;
          color: #1e40af;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .from {
          color: #3b82f6;
          font-size: 0.85em;
        }
      </style>
    </template>
  };

  // Fitted: compact grid view
  static fitted = class Fitted extends Component<typeof Email> {
    <template>
      <div class='email-fitted'>
        <div class='fitted-header'>
          <span class='fitted-avatar'>{{@model.from.[0]}}</span>
          <div class='fitted-info'>
            <div class='fitted-subject'>{{@model.subject}}</div>
            <div class='fitted-from'>{{@model.from}}</div>
          </div>
        </div>
        <div class='fitted-preview'>{{@model.preview}}</div>
        <time class='fitted-date'>{{@model.date}}</time>
      </div>
      <style scoped>
        .email-fitted {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          height: 100%;
          overflow: hidden;
        }
        .fitted-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .fitted-avatar {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 0.9rem;
          text-transform: uppercase;
          flex-shrink: 0;
        }
        .fitted-info {
          flex: 1;
          min-width: 0;
        }
        .fitted-subject {
          font-weight: 600;
          font-size: 0.9rem;
          color: #111827;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .fitted-from {
          font-size: 0.8rem;
          color: #6b7280;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .fitted-preview {
          font-size: 0.85rem;
          color: #6b7280;
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .fitted-date {
          font-size: 0.75rem;
          color: #9ca3af;
          align-self: flex-end;
        }
      </style>
    </template>
  };

  // Embedded: email preview card
  static embedded = class Embedded extends Component<typeof Email> {
    get bodyParagraphs() {
      return this.args.model.body?.split('\n\n') || [];
    }

    <template>
      <article class='email-embedded'>
        <header class='email-header'>
          <div class='header-row'>
            <span class='avatar'>{{@model.from.[0]}}</span>
            <div class='header-info'>
              <div class='from'>{{@model.from}}</div>
              <div class='to'>to {{@model.to}}</div>
            </div>
            <time class='date'>{{@model.date}}</time>
          </div>
          <h2 class='subject'>{{@model.subject}}</h2>
        </header>
        <div class='email-body'>
          {{#each this.bodyParagraphs as |paragraph|}}
            <p>{{paragraph}}</p>
          {{/each}}
        </div>
        <footer class='email-footer'>
          <button class='action'>↩️ Reply</button>
          <button class='action'>↪️ Forward</button>
        </footer>
      </article>
      <style scoped>
        .email-embedded {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }
        .email-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #f3f4f6;
          background: #fafafa;
        }
        .header-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .avatar {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 1.1rem;
          text-transform: uppercase;
        }
        .header-info {
          flex: 1;
        }
        .from {
          font-weight: 600;
          color: #111827;
        }
        .to {
          font-size: 0.85rem;
          color: #6b7280;
        }
        .date {
          font-size: 0.85rem;
          color: #9ca3af;
        }
        .subject {
          margin: 0.75rem 0 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #111827;
        }
        .email-body {
          padding: 1.25rem;
          font-size: 0.95rem;
          line-height: 1.7;
          color: #374151;
        }
        .email-body p {
          margin: 0 0 1em;
        }
        .email-body p:last-child {
          margin-bottom: 0;
        }
        .email-footer {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          border-top: 1px solid #f3f4f6;
          background: #fafafa;
        }
        .action {
          padding: 0.4rem 0.75rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.85rem;
          color: #374151;
          cursor: pointer;
        }
        .action:hover {
          background: #f9fafb;
          border-color: #d1d5db;
        }
      </style>
    </template>
  };

  // Isolated: full email view
  static isolated = class Isolated extends Component<typeof Email> {
    get bodyParagraphs() {
      return this.args.model.body?.split('\n\n') || [];
    }

    <template>
      <article class='email-isolated'>
        <header class='header'>
          <h1 class='subject'>{{@model.subject}}</h1>
          <div class='meta-row'>
            <div class='avatar'>{{@model.from.[0]}}</div>
            <div class='meta-info'>
              <div class='from-line'>
                <strong>{{@model.from}}</strong>
                <span class='to'>to {{@model.to}}</span>
              </div>
              <time class='date'>{{@model.date}}</time>
            </div>
          </div>
        </header>
        <div class='body'>
          {{#each this.bodyParagraphs as |paragraph|}}
            <p>{{paragraph}}</p>
          {{/each}}
        </div>
      </article>
      <style scoped>
        .email-isolated {
          max-width: 700px;
          margin: 0 auto;
          padding: 2rem;
          font-family: var(--boxel-font-family, system-ui);
        }
        .header {
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 1.5rem;
        }
        .subject {
          margin: 0 0 1rem;
          font-size: 1.5rem;
          color: #111827;
        }
        .meta-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .avatar {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 1.25rem;
          text-transform: uppercase;
        }
        .from-line {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .to {
          color: #6b7280;
          font-size: 0.9rem;
        }
        .date {
          color: #9ca3af;
          font-size: 0.85rem;
        }
        .body {
          font-size: 1rem;
          line-height: 1.8;
          color: #374151;
        }
        .body p {
          margin: 0 0 1.25em;
        }
      </style>
    </template>
  };
}
