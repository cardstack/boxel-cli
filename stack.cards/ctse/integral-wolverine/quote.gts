import { CardDef, field, contains, Component } from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import QuoteIcon from '@cardstack/boxel-icons/quote';

export class Quote extends CardDef {
  static displayName = 'Quote';
  static icon = QuoteIcon;

  @field text = contains(StringField);
  @field author = contains(StringField);
  @field source = contains(StringField); // Book, speech, article, etc.
  @field year = contains(StringField);

  @field title = contains(StringField, {
    computeVia: function (this: Quote) {
      if (this.author) {
        return `Quote by ${this.author}`;
      }
      return this.text?.slice(0, 50) + '...' || 'Untitled Quote';
    },
  });

  // Atom: inline citation
  static atom = class Atom extends Component<typeof Quote> {
    <template>
      <span class="quote-atom">
        <span class="quote-mark">"</span>
        <span class="text">{{@model.text}}</span>
        <span class="quote-mark">"</span>
        {{#if @model.author}}
          <span class="author">— {{@model.author}}</span>
        {{/if}}
      </span>
      <style scoped>
        .quote-atom {
          font-style: italic;
          color: #555;
        }
        .quote-mark {
          color: #9ca3af;
          font-size: 1.1em;
        }
        .author {
          font-style: normal;
          color: #888;
          margin-left: 0.5em;
        }
      </style>
    </template>
  };

  // Embedded: blockquote style
  static embedded = class Embedded extends Component<typeof Quote> {
    <template>
      <blockquote class="quote-embedded">
        <div class="quote-content">
          <span class="opening-mark">"</span>
          <p class="text">{{@model.text}}</p>
          <span class="closing-mark">"</span>
        </div>
        <footer class="attribution">
          {{#if @model.author}}
            <cite class="author">{{@model.author}}</cite>
          {{/if}}
          {{#if @model.source}}
            <span class="source">{{@model.source}}</span>
          {{/if}}
          {{#if @model.year}}
            <span class="year">({{@model.year}})</span>
          {{/if}}
        </footer>
      </blockquote>
      <style scoped>
        .quote-embedded {
          margin: 0;
          padding: 1.5rem 2rem;
          background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
          border-left: 4px solid #eab308;
          border-radius: 0 12px 12px 0;
          position: relative;
        }
        .quote-content {
          position: relative;
        }
        .opening-mark, .closing-mark {
          font-family: Georgia, serif;
          font-size: 3rem;
          color: #eab308;
          opacity: 0.5;
          line-height: 0;
          position: absolute;
        }
        .opening-mark {
          top: 0.5rem;
          left: -0.5rem;
        }
        .closing-mark {
          bottom: -1rem;
          right: 0;
        }
        .text {
          margin: 0;
          padding: 0 1rem;
          font-size: 1.1rem;
          font-style: italic;
          line-height: 1.6;
          color: #713f12;
        }
        .attribution {
          margin-top: 1rem;
          padding-left: 1rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: baseline;
        }
        .author {
          font-weight: 600;
          font-style: normal;
          color: #854d0e;
        }
        .author::before {
          content: '— ';
        }
        .source {
          font-style: italic;
          color: #a16207;
        }
        .year {
          color: #ca8a04;
          font-size: 0.9rem;
        }
      </style>
    </template>
  };

  // Isolated: full display
  static isolated = class Isolated extends Component<typeof Quote> {
    <template>
      <article class="quote-isolated">
        <blockquote class="quote-block">
          <span class="big-quote">"</span>
          <p class="text">{{@model.text}}</p>
        </blockquote>
        <footer class="attribution">
          {{#if @model.author}}
            <div class="author">{{@model.author}}</div>
          {{/if}}
          <div class="meta">
            {{#if @model.source}}
              <span class="source">{{@model.source}}</span>
            {{/if}}
            {{#if @model.year}}
              <span class="year">{{@model.year}}</span>
            {{/if}}
          </div>
        </footer>
      </article>
      <style scoped>
        .quote-isolated {
          max-width: 600px;
          margin: 2rem auto;
          padding: 2rem;
          font-family: var(--boxel-font-family, system-ui);
        }
        .quote-block {
          margin: 0;
          padding: 0;
          position: relative;
        }
        .big-quote {
          font-family: Georgia, serif;
          font-size: 6rem;
          color: #fde047;
          line-height: 1;
          position: absolute;
          top: -1rem;
          left: -1rem;
        }
        .text {
          margin: 0;
          padding: 1rem 0 1rem 3rem;
          font-size: 1.5rem;
          font-style: italic;
          line-height: 1.7;
          color: #374151;
        }
        .attribution {
          padding-left: 3rem;
          margin-top: 1.5rem;
          border-top: 1px solid #e5e7eb;
          padding-top: 1rem;
        }
        .author {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }
        .meta {
          margin-top: 0.25rem;
          color: #6b7280;
        }
        .source {
          font-style: italic;
        }
        .source::after {
          content: ', ';
        }
      </style>
    </template>
  };
}
