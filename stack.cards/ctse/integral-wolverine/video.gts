import { CardDef, field, contains, Component } from 'https://cardstack.com/base/card-api';
import StringField from 'https://cardstack.com/base/string';
import NumberField from 'https://cardstack.com/base/number';
import VideoIcon from '@cardstack/boxel-icons/video';

export class Video extends CardDef {
  static displayName = 'Video';
  static icon = VideoIcon;

  @field videoTitle = contains(StringField);
  @field channel = contains(StringField);
  @field duration = contains(StringField); // "12:34" format
  @field views = contains(StringField); // "1.2M views"
  @field uploadDate = contains(StringField);
  @field thumbnailEmoji = contains(StringField); // Emoji placeholder
  @field description = contains(StringField);

  @field title = contains(StringField, {
    computeVia: function (this: Video) {
      return this.videoTitle || 'Untitled Video';
    },
  });

  // Atom: inline video reference
  static atom = class Atom extends Component<typeof Video> {
    <template>
      <span class="video-atom">
        <span class="icon">▶️</span>
        <span class="title">{{@model.videoTitle}}</span>
        {{#if @model.duration}}
          <span class="duration">{{@model.duration}}</span>
        {{/if}}
      </span>
      <style scoped>
        .video-atom {
          display: inline-flex;
          align-items: center;
          gap: 0.35em;
          padding: 0.15em 0.6em;
          background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          border: 1px solid #fecaca;
          border-radius: 100px;
          font-size: 0.9em;
        }
        .title {
          font-weight: 500;
          color: #dc2626;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .duration {
          padding: 0.1em 0.4em;
          background: rgba(0,0,0,0.7);
          color: white;
          border-radius: 3px;
          font-size: 0.8em;
          font-family: 'SF Mono', monospace;
        }
      </style>
    </template>
  };

  // Embedded: video player card (16:9 aspect)
  static embedded = class Embedded extends Component<typeof Video> {
    <template>
      <article class="video-embedded">
        <div class="thumbnail">
          <div class="thumbnail-content">
            {{#if @model.thumbnailEmoji}}
              {{@model.thumbnailEmoji}}
            {{else}}
              🎬
            {{/if}}
          </div>
          <div class="play-button">▶</div>
          {{#if @model.duration}}
            <span class="duration">{{@model.duration}}</span>
          {{/if}}
        </div>
        <div class="info">
          <h3 class="title">{{@model.videoTitle}}</h3>
          <div class="meta">
            {{#if @model.channel}}
              <span class="channel">{{@model.channel}}</span>
            {{/if}}
            {{#if @model.views}}
              <span class="views">{{@model.views}}</span>
            {{/if}}
            {{#if @model.uploadDate}}
              <span class="date">{{@model.uploadDate}}</span>
            {{/if}}
          </div>
        </div>
      </article>
      <style scoped>
        .video-embedded {
          background: #0f0f0f;
          border-radius: 12px;
          overflow: hidden;
        }
        .thumbnail {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: linear-gradient(135deg, #1f1f1f 0%, #2d2d2d 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thumbnail-content {
          font-size: 4rem;
          opacity: 0.5;
        }
        .play-button {
          position: absolute;
          width: 68px;
          height: 48px;
          background: rgba(255, 0, 0, 0.9);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .play-button:hover {
          background: rgba(255, 0, 0, 1);
        }
        .duration {
          position: absolute;
          bottom: 8px;
          right: 8px;
          padding: 0.2rem 0.4rem;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          border-radius: 4px;
          font-size: 0.75rem;
          font-family: 'SF Mono', monospace;
        }
        .info {
          padding: 0.75rem 1rem;
        }
        .title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 500;
          color: #f1f1f1;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.35rem;
          font-size: 0.8rem;
          color: #aaa;
        }
        .channel {
          color: #ccc;
        }
        .views::before, .date::before {
          content: '•';
          margin-right: 0.5rem;
        }
      </style>
    </template>
  };

  // Isolated: full video page
  static isolated = class Isolated extends Component<typeof Video> {
    <template>
      <article class="video-isolated">
        <div class="player">
          <div class="player-content">
            {{#if @model.thumbnailEmoji}}
              {{@model.thumbnailEmoji}}
            {{else}}
              🎬
            {{/if}}
          </div>
          <div class="play-overlay">
            <div class="play-button">▶</div>
          </div>
        </div>
        <div class="details">
          <h1 class="title">{{@model.videoTitle}}</h1>
          <div class="stats">
            {{#if @model.views}}
              <span>{{@model.views}}</span>
            {{/if}}
            {{#if @model.uploadDate}}
              <span>{{@model.uploadDate}}</span>
            {{/if}}
          </div>
          <div class="channel-row">
            <div class="channel-avatar">{{@model.channel.[0]}}</div>
            <div class="channel-name">{{@model.channel}}</div>
            <button class="subscribe">Subscribe</button>
          </div>
          {{#if @model.description}}
            <div class="description">
              <p>{{@model.description}}</p>
            </div>
          {{/if}}
        </div>
      </article>
      <style scoped>
        .video-isolated {
          max-width: 900px;
          margin: 0 auto;
          background: #0f0f0f;
          font-family: var(--boxel-font-family, system-ui);
          color: #f1f1f1;
        }
        .player {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .player-content {
          font-size: 8rem;
          opacity: 0.3;
        }
        .play-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .play-button {
          width: 80px;
          height: 56px;
          background: rgba(255, 0, 0, 0.9);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 2rem;
          cursor: pointer;
        }
        .details {
          padding: 1rem 1.5rem;
        }
        .title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          line-height: 1.4;
        }
        .stats {
          display: flex;
          gap: 1rem;
          margin-top: 0.5rem;
          font-size: 0.9rem;
          color: #aaa;
        }
        .channel-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 1rem;
          padding: 1rem 0;
          border-top: 1px solid #333;
          border-bottom: 1px solid #333;
        }
        .channel-avatar {
          width: 40px;
          height: 40px;
          background: #ff0000;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          text-transform: uppercase;
        }
        .channel-name {
          flex: 1;
          font-weight: 500;
        }
        .subscribe {
          padding: 0.6rem 1.2rem;
          background: #cc0000;
          color: white;
          border: none;
          border-radius: 100px;
          font-weight: 500;
          cursor: pointer;
        }
        .description {
          margin-top: 1rem;
          padding: 1rem;
          background: #1f1f1f;
          border-radius: 12px;
        }
        .description p {
          margin: 0;
          line-height: 1.6;
          color: #ccc;
        }
      </style>
    </template>
  };
}
